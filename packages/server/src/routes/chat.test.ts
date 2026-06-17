import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { chatRouter } from './chat'
import { closeDb } from '@sahayak/shared/db'
import { getDb, schema } from '@sahayak/shared/db'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/chat', chatRouter())
  return app
}

describe('chat routes', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    closeDb()
    app = createApp()
  })

  afterEach(() => {
    closeDb()
  })

  describe('POST /api/chat/sessions', () => {
    it('creates a new session', async () => {
      const res = await request(app).post('/api/chat/sessions').send()
      expect(res.status).toBe(200)
      expect(res.body.id).toBeDefined()
    })
  })

  describe('GET /api/chat/sessions', () => {
    it('returns empty list initially', async () => {
      const res = await request(app).get('/api/chat/sessions')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('returns created sessions', async () => {
      await request(app).post('/api/chat/sessions').send()
      const res = await request(app).get('/api/chat/sessions')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].name).toBe('New Chat')
    })
  })

  describe('GET /api/chat/sessions/:id', () => {
    it('returns 404 for unknown session', async () => {
      const res = await request(app).get('/api/chat/sessions/unknown')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Session not found')
    })

    it('returns session with messages', async () => {
      const create = await request(app).post('/api/chat/sessions').send()
      const sid = create.body.id

      // Add a message
      await request(app)
        .post(`/api/chat/sessions/${sid}/messages`)
        .send({ content: 'hello', role: 'user', model: 'llama' })

      const res = await request(app).get(`/api/chat/sessions/${sid}`)
      expect(res.status).toBe(200)
      expect(res.body.session.id).toBe(sid)
      expect(res.body.messages).toHaveLength(1)
      expect(res.body.messages[0].content).toBe('hello')
    })
  })

  describe('POST /api/chat/sessions/:id/messages', () => {
    it('adds a message to a session', async () => {
      const create = await request(app).post('/api/chat/sessions').send()
      const sid = create.body.id

      const res = await request(app)
        .post(`/api/chat/sessions/${sid}/messages`)
        .send({ content: 'test message', role: 'user', model: 'llama' })

      expect(res.status).toBe(200)
      expect(res.body.id).toBeDefined()
    })
  })

  describe('POST /api/chat/sessions/:id/chat (non-streaming)', () => {
    it('saves user message and returns assistant reply', async () => {
      // Mock fetch for LocalAI
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello from AI!' } }],
        }),
      } as Response)

      const create = await request(app).post('/api/chat/sessions').send()
      const sid = create.body.id

      const res = await request(app)
        .post(`/api/chat/sessions/${sid}/chat`)
        .send({ message: 'hi', model: 'llama', stream: false })

      expect(res.status).toBe(200)
      expect(res.body.message.role).toBe('assistant')
      expect(res.body.message.content).toBe('Hello from AI!')

      // Verify messages were saved
      const session = await request(app).get(`/api/chat/sessions/${sid}`)
      expect(session.body.messages).toHaveLength(2) // user + assistant
    })
  })

  describe('DELETE /api/chat/sessions/:id', () => {
    it('deletes session and its messages', async () => {
      const create = await request(app).post('/api/chat/sessions').send()
      const sid = create.body.id

      await request(app).delete(`/api/chat/sessions/${sid}`).expect(200)

      const get = await request(app).get(`/api/chat/sessions/${sid}`)
      expect(get.status).toBe(404)
    })
  })
})
