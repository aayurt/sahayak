import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { initDb, closeDb } from '@sahayak/shared/db'
import { cronRouter } from './cron'

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/cron', cronRouter())
  return app
}

describe('Cron API', () => {
  beforeAll(() => {
    process.env.SAHAYAK_DB_PATH = ':memory:'
    initDb()
  })

  afterEach(() => {
    closeDb()
    initDb()
  })

  it('should list cron jobs (empty)', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/cron')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('should create a cron job', async () => {
    const app = createTestApp()
    const res = await request(app)
      .post('/api/cron')
      .send({ name: 'test-job', expression: '0 8 * * *', action: 'agent' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('test-job')
    expect(res.body.expression).toBe('0 8 * * *')
    expect(res.body.action).toBe('agent')
    expect(res.body.enabled).toBe(true)
  })

  it('should reject cron job without name', async () => {
    const app = createTestApp()
    const res = await request(app)
      .post('/api/cron')
      .send({ expression: '0 8 * * *', action: 'agent' })
    expect(res.status).toBe(400)
  })

  it('should update a cron job', async () => {
    const app = createTestApp()
    const createRes = await request(app)
      .post('/api/cron')
      .send({ name: 'old-job', expression: '0 8 * * *', action: 'agent' })
    const created = createRes.body

    const res = await request(app)
      .put(`/api/cron/${created.id}`)
      .send({ name: 'new-job', enabled: false })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('new-job')
    expect(res.body.enabled).toBe(false)
  })

  it('should toggle a cron job', async () => {
    const app = createTestApp()
    const createRes = await request(app)
      .post('/api/cron')
      .send({ name: 'toggle-job', expression: '*/5 * * * *', action: 'agent' })
    const created = createRes.body
    expect(created.enabled).toBe(true)

    const toggleRes = await request(app).post(`/api/cron/${created.id}/toggle`)
    expect(toggleRes.status).toBe(200)
    expect(toggleRes.body.enabled).toBe(false)

    const toggleBack = await request(app).post(`/api/cron/${created.id}/toggle`)
    expect(toggleBack.body.enabled).toBe(true)
  })

  it('should delete a cron job', async () => {
    const app = createTestApp()
    const createRes = await request(app)
      .post('/api/cron')
      .send({ name: 'delete-job', expression: '0 0 * * *', action: 'agent' })
    const created = createRes.body

    const delRes = await request(app).delete(`/api/cron/${created.id}`)
    expect(delRes.status).toBe(200)

    const listRes = await request(app).get('/api/cron')
    expect(listRes.body.length).toBe(0)
  })
})
