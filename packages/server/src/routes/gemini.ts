import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@sahayak/shared/db'
import type { GeminiBrowser } from '../services/gemini'

interface GeminiServices {
  createBrowser: () => Promise<GeminiBrowser>
}

export function geminiRouter(services: GeminiServices) {
  const router = Router()

  async function handleRequest<T>(
    req: any,
    res: any,
    fn: (browser: GeminiBrowser) => Promise<T>,
  ) {
    const browser = await services.createBrowser()
    try {
      const result = await fn(browser)
      res.json(result as any)
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gemini request failed' })
    } finally {
      await browser.close()
    }
  }

  async function saveMessage(sessionId: string, role: string, content: string, model: string) {
    const db = getDb()
    await db.insert(schema.messages).values({
      id: uuid(),
      sessionId,
      role,
      content,
      model,
      tokens: 0,
      metadata: {},
      createdAt: new Date(),
    })
    if (role === 'assistant') {
      await db.update(schema.sessions).set({ model, updatedAt: new Date() }).where(eq(schema.sessions.id, sessionId))
    }
  }

  router.post('/chat', async (req, res) => {
    const { prompt, conversationId, sessionId } = req.body as { prompt?: string; conversationId?: string; sessionId?: string }
    if (!prompt) return res.status(400).json({ error: 'prompt is required' })
    let browser: GeminiBrowser | null = null
    try {
      browser = await services.createBrowser()
      const result = await browser.sendTextPrompt(prompt, conversationId)
      if (sessionId) {
        await saveMessage(sessionId, 'user', prompt, 'gemini')
        await saveMessage(sessionId, 'assistant', result.content, 'gemini')
      }
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gemini request failed' })
    } finally {
      if (browser) await browser.close()
    }
  })

  router.post('/image', async (req, res) => {
    const { images, prompt, sessionId } = req.body as { images?: string[]; prompt?: string; sessionId?: string }
    if (!images?.length || !prompt) return res.status(400).json({ error: 'images (array of base64) and prompt are required' })
    let browser: GeminiBrowser | null = null
    try {
      browser = await services.createBrowser()
      const content = await browser.sendImagePrompt(images, prompt)
      if (sessionId) {
        await saveMessage(sessionId, 'user', prompt, 'gemini')
        await saveMessage(sessionId, 'assistant', content, 'gemini')
      }
      res.json({ content })
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gemini request failed' })
    } finally {
      if (browser) await browser.close()
    }
  })

  router.post('/search', async (req, res) => {
    const { query } = req.body as { query?: string }
    if (!query) return res.status(400).json({ error: 'query is required' })
    await handleRequest(req, res, async (b) => {
      const content = await b.sendWebSearch(query)
      return { content }
    })
  })

  return router
}
