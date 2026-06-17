import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { settingsRouter } from './settings'
import { closeDb } from '@sahayak/shared/db'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/settings', settingsRouter())
  return app
}

describe('settings routes', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    closeDb()
    app = createApp()
  })

  afterEach(() => {
    closeDb()
  })

  describe('GET /api/settings', () => {
    it('returns empty object initially', async () => {
      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({})
    })
  })

  describe('PUT /api/settings', () => {
    it('stores settings and returns ok', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({ theme: 'dark', port: 9090 })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('retrieves stored settings', async () => {
      await request(app).put('/api/settings').send({ theme: 'dark', aiEndpoint: 'http://localhost:8080' })

      const res = await request(app).get('/api/settings')
      expect(res.status).toBe(200)
      expect(res.body.theme).toBe('dark')
      expect(res.body.aiEndpoint).toBe('http://localhost:8080')
    })

    it('upserts over existing keys', async () => {
      await request(app).put('/api/settings').send({ theme: 'dark' })
      await request(app).put('/api/settings').send({ theme: 'light' })

      const res = await request(app).get('/api/settings')
      expect(res.body.theme).toBe('light')
    })
  })
})
