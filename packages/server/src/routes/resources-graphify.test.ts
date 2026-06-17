import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { resourcesRouter } from './resources'
import { closeDb } from '@sahayak/shared/db'

const mockBgProcess = {
  id: 'bp_test123',
  title: 'graphify: test',
  command: 'graphify "/tmp/test-project"',
  status: 'running' as const,
  startedAt: new Date().toISOString(),
}

const mockManagedProcess = {
  process: mockBgProcess,
  child: { kill: vi.fn() } as any,
  output: ['Extracting: file1.ts', 'Extracting: file2.py', 'Building graph...'],
  maxOutputLines: 500,
}

function createMockBgManager() {
  const processes = new Map<string, typeof mockManagedProcess>()

  return {
    create: vi.fn().mockImplementation(async (title: string, command: string, cwd: string) => {
      const id = `bp_${Date.now()}`
      const proc = { ...mockBgProcess, id, title, command }
      const managed = { ...mockManagedProcess, process: proc, output: [...mockManagedProcess.output] }
      processes.set(id, managed)
      return proc
    }),
    get: vi.fn().mockImplementation((id: string) => processes.get(id) || null),
    stop: vi.fn().mockImplementation(async (id: string) => {
      const managed = processes.get(id)
      if (!managed) throw new Error(`Process ${id} not found`)
      managed.process.status = 'stopped'
      managed.process.stoppedAt = new Date().toISOString()
      return managed.process
    }),
    list: vi.fn().mockReturnValue([]),
    terminate: vi.fn(),
    readOutput: vi.fn().mockImplementation((_id: string, method: string) => {
      const output = mockManagedProcess.output
      if (method === 'tail') {
        return { content: output.slice(-3).join('\n'), truncated: false, sizeBytes: 100 }
      }
      return { content: output.join('\n'), truncated: false, sizeBytes: 150 }
    }),
    shutdown: vi.fn(),
    events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  }
}

function createApp(bgManager?: ReturnType<typeof createMockBgManager>) {
  const app = express()
  app.use(express.json())
  app.use('/api/resources', resourcesRouter(bgManager as any))
  return app
}

describe('Resource API - Graphify', () => {
  let app: ReturnType<typeof createApp>
  let bgManager: ReturnType<typeof createMockBgManager>

  beforeEach(() => {
    closeDb()
    vi.clearAllMocks()
    bgManager = createMockBgManager()
    app = createApp(bgManager)
  })

  afterEach(() => {
    closeDb()
  })

  it('POST /api/resources/:id/graphify/start - starts graphify on folder resource', async () => {
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'My Project', type: 'folder', path: '/tmp/test-project' })
    expect(createRes.status).toBe(200)
    const resourceId = createRes.body.id

    const res = await request(app)
      .post(`/api/resources/${resourceId}/graphify/start`)

    expect(res.status).toBe(200)
    expect(res.body.graphifyState).toBe('running')
    expect(res.body.processId).toBeDefined()
    expect(bgManager.create).toHaveBeenCalledWith(
      'graphify: My Project',
      'graphify "/tmp/test-project"',
      expect.stringContaining('/.sahayak/graphify/'),
    )
  })

  it('POST /api/resources/:id/graphify/start - returns 400 for SSH resource', async () => {
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Server', type: 'ssh', host: '10.0.0.1' })
    expect(createRes.status).toBe(200)

    const res = await request(app)
      .post(`/api/resources/${createRes.body.id}/graphify/start`)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Graphify only supports folder resources')
  })

  it('POST /api/resources/:id/graphify/start - returns 404 for unknown resource', async () => {
    const res = await request(app)
      .post('/api/resources/unknown/graphify/start')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Resource not found')
  })

  it('POST /api/resources/:id/graphify/start - returns 500 without bgProcessManager', async () => {
    const appNoBg = createApp()
    const createRes = await request(appNoBg)
      .post('/api/resources')
      .send({ name: 'Project', type: 'folder', path: '/tmp/project' })
    expect(createRes.status).toBe(200)

    const res = await request(appNoBg)
      .post(`/api/resources/${createRes.body.id}/graphify/start`)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Background process manager not available')
  })

  it('POST /api/resources/:id/graphify/stop - stops a running graphify process', async () => {
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Project', type: 'folder', path: '/tmp/project' })
    expect(createRes.status).toBe(200)
    const resourceId = createRes.body.id

    // Start graphify
    const startRes = await request(app)
      .post(`/api/resources/${resourceId}/graphify/start`)
    expect(startRes.status).toBe(200)
    const processId = startRes.body.processId

    // Stop it
    const res = await request(app)
      .post(`/api/resources/${resourceId}/graphify/stop`)
      .send({ processId })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(bgManager.stop).toHaveBeenCalledWith(processId)
  })

  it('POST /api/resources/:id/graphify/stop - returns 400 without processId', async () => {
    const res = await request(app)
      .post('/api/resources/some-id/graphify/stop')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('processId is required')
  })

  it('GET /api/resources/:id/graphify/status - returns resource state without processId', async () => {
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Project', type: 'folder', path: '/tmp/project' })
    expect(createRes.status).toBe(200)

    const res = await request(app)
      .get(`/api/resources/${createRes.body.id}/graphify/status`)

    expect(res.status).toBe(200)
    expect(res.body.graphifyState).toBe('none')
  })

  it('GET /api/resources/:id/graphify/status - returns process status with processId', async () => {
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Project', type: 'folder', path: '/tmp/project' })
    expect(createRes.status).toBe(200)
    const resourceId = createRes.body.id

    const startRes = await request(app)
      .post(`/api/resources/${resourceId}/graphify/start`)
    expect(startRes.status).toBe(200)
    const processId = startRes.body.processId

    const res = await request(app)
      .get(`/api/resources/${resourceId}/graphify/status?processId=${processId}`)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('running')
    expect(res.body.processId).toBe(processId)
  })

  it('GET /api/resources/:id/graphify/output - returns process output', async () => {
    const createRes = await request(app)
      .post('/api/resources')
      .send({ name: 'Project', type: 'folder', path: '/tmp/project' })
    expect(createRes.status).toBe(200)
    const resourceId = createRes.body.id

    const startRes = await request(app)
      .post(`/api/resources/${resourceId}/graphify/start`)
    expect(startRes.status).toBe(200)
    const processId = startRes.body.processId

    const res = await request(app)
      .get(`/api/resources/${resourceId}/graphify/output?processId=${processId}`)

    expect(res.status).toBe(200)
    expect(res.body.content).toContain('Extracting')
  })

  it('GET /api/resources/:id/graphify/output - returns 400 without processId', async () => {
    const res = await request(app)
      .get('/api/resources/some-id/graphify/output')

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('processId is required')
  })
})
