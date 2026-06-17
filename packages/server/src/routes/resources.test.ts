import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { resourcesRouter } from './resources'
import { closeDb } from '@sahayak/shared/db'

const mockExecResult = { stdout: 'hello world\n', stderr: '', code: 0 }
const mockConn = {
  host: '192.168.1.1',
  port: 22,
  exec: vi.fn().mockResolvedValue(mockExecResult),
  shell: vi.fn(),
  disconnect: vi.fn(),
}

vi.mock('../services/ssh', () => ({
  connect: vi.fn().mockResolvedValue(mockConn),
}))

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/resources', resourcesRouter())
  return app
}

describe('Resource API - SSH exec', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    closeDb()
    vi.clearAllMocks()
    app = createApp()
  })

  afterEach(() => {
    closeDb()
  })

  it('POST /api/resources/:id/ssh/exec - executes command on SSH resource', async () => {
    // First create an SSH resource
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Test Server', type: 'ssh', host: '192.168.1.1', username: 'admin' })
    expect(createRes.status).toBe(200)
    const resourceId = createRes.body.id

    const res = await request(app)
      .post(`/api/resources/${resourceId}/ssh/exec`)
      .send({ command: 'echo hello' })

    expect(res.status).toBe(200)
    expect(res.body.stdout).toBe('hello world\n')
    expect(res.body.code).toBe(0)
    expect(mockConn.exec).toHaveBeenCalledWith('echo hello')
    expect(mockConn.disconnect).toHaveBeenCalled()
  })

  it('POST /api/resources/:id/ssh/exec - returns 404 for unknown resource', async () => {
    const res = await request(app)
      .post('/api/resources/unknown/ssh/exec')
      .send({ command: 'echo hello' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Resource not found')
  })

  it('POST /api/resources/:id/ssh/exec - returns 400 without command', async () => {
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Test', type: 'ssh', host: '10.0.0.1' })
    expect(createRes.status).toBe(200)

    const res = await request(app)
      .post(`/api/resources/${createRes.body.id}/ssh/exec`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('command is required')
  })

  it('POST /api/resources/:id/ssh/exec - returns 400 for non-SSH resource', async () => {
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Local Folder', type: 'folder', path: '/tmp' })
    expect(createRes.status).toBe(200)

    const res = await request(app)
      .post(`/api/resources/${createRes.body.id}/ssh/exec`)
      .send({ command: 'ls' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Not an SSH resource')
  })

  it('POST /api/resources/:id/ssh/exec - returns 502 on connection failure', async () => {
    const { connect } = await import('../services/ssh')
    ;(connect as any).mockRejectedValueOnce(new Error('Connection timeout'))

    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Bad Server', type: 'ssh', host: '10.0.0.99' })
    expect(createRes.status).toBe(200)

    const res = await request(app)
      .post(`/api/resources/${createRes.body.id}/ssh/exec`)
      .send({ command: 'ls' })
    expect(res.status).toBe(502)
    expect(res.body.error).toBe('Connection timeout')
  })
})
