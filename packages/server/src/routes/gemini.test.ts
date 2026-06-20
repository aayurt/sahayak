import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { geminiRouter } from './gemini'
import type { GeminiResult } from '../services/gemini'

function createMockApp() {
  const app = express()
  app.use(express.json())

  const mockBrowser = {
    sendTextPrompt: vi.fn().mockResolvedValue({ content: 'Mock response', geminiConversationId: 'conv_123' }),
    sendImagePrompt: vi.fn<[string[], string, string?], Promise<GeminiResult>>().mockResolvedValue({ content: 'Mock image analysis', geminiConversationId: 'conv_img_123' }),
    sendWebSearch: vi.fn().mockResolvedValue('Mock search results'),
    close: vi.fn().mockResolvedValue(undefined),
  }

  const mockServices = {
    createBrowser: vi.fn().mockResolvedValue(mockBrowser),
  }

  app.use('/api/gemini', geminiRouter(mockServices))
  return { app, mockBrowser, mockServices }
}

describe('Gemini API routes', () => {
  it('POST /chat returns content and conversationId', async () => {
    const { app, mockBrowser, mockServices } = createMockApp()

    const res = await request(app)
      .post('/api/gemini/chat')
      .send({ prompt: 'Analyze this stock' })
      .expect(200)

    expect(res.body).toHaveProperty('content', 'Mock response')
    expect(res.body).toHaveProperty('geminiConversationId', 'conv_123')
    expect(mockServices.createBrowser).toHaveBeenCalledOnce()
    expect(mockBrowser.sendTextPrompt).toHaveBeenCalledWith('Analyze this stock', undefined)
    expect(mockBrowser.close).toHaveBeenCalledOnce()
  })

  it('POST /chat passes conversationId', async () => {
    const { app, mockBrowser } = createMockApp()

    await request(app)
      .post('/api/gemini/chat')
      .send({ prompt: 'Follow up', conversationId: 'abc123' })
      .expect(200)

    expect(mockBrowser.sendTextPrompt).toHaveBeenCalledWith('Follow up', 'abc123')
  })

  it('POST /chat returns 400 if prompt missing', async () => {
    const { app, mockBrowser } = createMockApp()

    const res = await request(app)
      .post('/api/gemini/chat')
      .send({})
      .expect(400)

    expect(res.body).toHaveProperty('error', 'prompt is required')
    expect(mockBrowser.sendTextPrompt).not.toHaveBeenCalled()
    expect(mockBrowser.close).not.toHaveBeenCalled()
  })

  it('POST /image returns analysis content', async () => {
    const { app, mockBrowser } = createMockApp()

    const res = await request(app)
      .post('/api/gemini/image')
      .send({ images: ['base64data'], prompt: 'Analyze this chart' })
      .expect(200)

    expect(res.body).toHaveProperty('content', 'Mock image analysis')
    expect(res.body).toHaveProperty('geminiConversationId', 'conv_img_123')
    expect(mockBrowser.sendImagePrompt).toHaveBeenCalledWith(['base64data'], 'Analyze this chart', undefined)
    expect(mockBrowser.close).toHaveBeenCalledOnce()
  })

  it('POST /image returns 400 if images or prompt missing', async () => {
    const { app } = createMockApp()

    await request(app)
      .post('/api/gemini/image')
      .send({ images: ['data'] })
      .expect(400)

    await request(app)
      .post('/api/gemini/image')
      .send({ prompt: 'analyze' })
      .expect(400)

    await request(app)
      .post('/api/gemini/image')
      .send({ images: [] })
      .expect(400)

    await request(app)
      .post('/api/gemini/image')
      .send({})
      .expect(400)
  })

  it('POST /search returns search results', async () => {
    const { app, mockBrowser } = createMockApp()

    const res = await request(app)
      .post('/api/gemini/search')
      .send({ query: 'latest NEPSE index' })
      .expect(200)

    expect(res.body).toHaveProperty('content', 'Mock search results')
    expect(mockBrowser.sendWebSearch).toHaveBeenCalledWith('latest NEPSE index')
    expect(mockBrowser.close).toHaveBeenCalledOnce()
  })

  it('POST /search returns 400 if query missing', async () => {
    const { app } = createMockApp()

    await request(app)
      .post('/api/gemini/search')
      .send({})
      .expect(400)
  })

  it('closes browser even on error', async () => {
    const mockBrowser = {
      sendTextPrompt: vi.fn().mockRejectedValue(new Error('Gemini error')),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const mockServices = {
      createBrowser: vi.fn().mockResolvedValue(mockBrowser),
    }
    const app = express()
    app.use(express.json())
    app.use('/api/gemini', geminiRouter(mockServices))

    await request(app)
      .post('/api/gemini/chat')
      .send({ prompt: 'test' })
      .expect(500)

    expect(mockBrowser.close).toHaveBeenCalledOnce()
  })
})
