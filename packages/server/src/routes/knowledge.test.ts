import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { initDb, closeDb } from '@sahayak/shared/db'
import { knowledgeRouter } from './knowledge'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/knowledge', knowledgeRouter())
  return app
}

describe('Knowledge API', () => {
  beforeAll(() => {
    process.env.SAHAYAK_DB_PATH = ':memory:'
    initDb()
  })

  afterEach(() => {
    closeDb()
    initDb()
  })

  it('should list projects (empty)', async () => {
    const res = await request(createApp()).get('/api/knowledge/projects')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('should create a project', async () => {
    const res = await request(createApp())
      .post('/api/knowledge/projects')
      .send({ path: '/tmp/test-project', name: 'test' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('test')
    expect(res.body.path).toBe('/tmp/test-project')
    expect(res.body.id).toBeDefined()
  })

  it('should reject project without path', async () => {
    const res = await request(createApp())
      .post('/api/knowledge/projects')
      .send({ name: 'test' })
    expect(res.status).toBe(400)
  })

  it('should reject duplicate project path', async () => {
    const app = createApp()
    await request(app).post('/api/knowledge/projects').send({ path: '/dup', name: 'first' })
    const res = await request(app).post('/api/knowledge/projects').send({ path: '/dup', name: 'second' })
    expect(res.status).toBe(409)
  })

  it('should delete a project', async () => {
    const app = createApp()
    const createRes = await request(app).post('/api/knowledge/projects').send({ path: '/del-test', name: 'delete-me' })
    const project = createRes.body

    const delRes = await request(app).delete(`/api/knowledge/projects/${project.id}`)
    expect(delRes.status).toBe(200)

    const listRes = await request(app).get('/api/knowledge/projects')
    expect(listRes.body.length).toBe(0)
  })

  it('should return 400 for graph without projectId', async () => {
    const res = await request(createApp()).get('/api/knowledge/graph')
    expect(res.status).toBe(400)
  })

  it('should return empty graph for project with no scan', async () => {
    const app = createApp()
    const createRes = await request(app).post('/api/knowledge/projects').send({ path: '/no-scan', name: 'no-scan' })
    const project = createRes.body
    const res = await request(app).get(`/api/knowledge/graph?projectId=${project.id}`)
    expect(res.status).toBe(200)
    expect(res.body.nodes).toEqual([])
    expect(res.body.edges).toEqual([])
  })

  it('should return 400 for search without params', async () => {
    const res = await request(createApp()).get('/api/knowledge/search')
    expect(res.status).toBe(400)
  })
})
