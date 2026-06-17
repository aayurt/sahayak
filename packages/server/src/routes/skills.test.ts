import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { initDb, closeDb } from '@sahayak/shared/db'
import { skillsRouter } from './skills'

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/skills', skillsRouter())
  return app
}

describe('Skills API', () => {
  beforeAll(() => {
    process.env.SAHAYAK_DB_PATH = ':memory:'
    initDb()
  })

  afterEach(() => {
    closeDb()
    initDb()
  })

  it('should list skills (empty)', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/skills')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('should create a skill', async () => {
    const app = createTestApp()
    const res = await request(app)
      .post('/api/skills')
      .send({ name: 'test-skill', systemPrompt: 'You are a test assistant' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('test-skill')
    expect(res.body.systemPrompt).toBe('You are a test assistant')
    expect(res.body.id).toBeDefined()
  })

  it('should reject skill without name', async () => {
    const app = createTestApp()
    const res = await request(app)
      .post('/api/skills')
      .send({ systemPrompt: 'test' })
    expect(res.status).toBe(400)
  })

  it('should get a skill by id', async () => {
    const app = createTestApp()
    const createRes = await request(app)
      .post('/api/skills')
      .send({ name: 'get-test', systemPrompt: 'hello' })
    const created = createRes.body

    const res = await request(app).get(`/api/skills/${created.id}`)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('get-test')
  })

  it('should return 404 for unknown skill', async () => {
    const app = createTestApp()
    const res = await request(app).get('/api/skills/nonexistent')
    expect(res.status).toBe(404)
  })

  it('should update a skill', async () => {
    const app = createTestApp()
    const createRes = await request(app)
      .post('/api/skills')
      .send({ name: 'old-name', systemPrompt: 'old prompt' })
    const created = createRes.body

    const res = await request(app)
      .put(`/api/skills/${created.id}`)
      .send({ name: 'new-name' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('new-name')
    expect(res.body.systemPrompt).toBe('old prompt')
  })

  it('should delete a skill', async () => {
    const app = createTestApp()
    const createRes = await request(app)
      .post('/api/skills')
      .send({ name: 'delete-me', systemPrompt: 'bye' })
    const created = createRes.body

    const delRes = await request(app).delete(`/api/skills/${created.id}`)
    expect(delRes.status).toBe(200)

    const getRes = await request(app).get(`/api/skills/${created.id}`)
    expect(getRes.status).toBe(404)
  })
})
