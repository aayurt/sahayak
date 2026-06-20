import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@sahayak/shared/db'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs'
import type { GeminiBrowser } from '../services/gemini'

interface GeminiServices {
  createBrowser: () => Promise<GeminiBrowser>
}

let authBrowser: any = null
let authContext: any = null

function getAuthStatesDir(): string {
  return join(homedir(), '.sahayak', 'gemini-auth-states')
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

  async function saveMessage(sessionId: string, role: string, content: string, model: string, geminiConversationId?: string) {
    const db = getDb()
    await db.insert(schema.messages).values({
      id: uuid(),
      sessionId,
      role,
      content,
      model,
      tokens: 0,
      metadata: geminiConversationId ? { geminiConversationId } : {},
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
        await saveMessage(sessionId, 'user', prompt, 'gemini', result.geminiConversationId)
        await saveMessage(sessionId, 'assistant', result.content, 'gemini', result.geminiConversationId)
      }
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gemini request failed' })
    } finally {
      if (browser) await browser.close()
    }
  })

  router.post('/image', async (req, res) => {
    const { images, prompt, sessionId, conversationId } = req.body as { images?: string[]; prompt?: string; sessionId?: string; conversationId?: string }
    if (!images?.length || !prompt) return res.status(400).json({ error: 'images (array of base64) and prompt are required' })
    let browser: GeminiBrowser | null = null
    try {
      browser = await services.createBrowser()
      const result = await browser.sendImagePrompt(images, prompt, conversationId)
      if (sessionId) {
        await saveMessage(sessionId, 'user', prompt, 'gemini', result.geminiConversationId)
        await saveMessage(sessionId, 'assistant', result.content, 'gemini', result.geminiConversationId)
      }
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gemini request failed' })
    } finally {
      if (browser) await browser.close()
    }
  })

  router.post('/auth/start', async (_req, res) => {
    try {
      if (authBrowser) {
        try { await authBrowser.close() } catch {}
        authBrowser = null
        authContext = null
      }
      const { chromium } = await import('playwright')
      const browser = await chromium.launch({ headless: false })
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto('https://gemini.google.com/app', { waitUntil: 'load', timeout: 30000 })
      authBrowser = browser
      authContext = context
      res.json({ ok: true, message: 'Chrome opened. Sign in to your Google account in the browser window, then click Save Auth.' })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/auth/save', async (_req, res) => {
    try {
      if (!authContext) {
        return res.status(400).json({ error: 'No auth browser running. Start auth first.' })
      }
      const storageState = await authContext.storageState()
      const dir = getAuthStatesDir()
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const existing = readdirSync(dir).filter(f => f.startsWith('gemini-account') && f.endsWith('.json'))
      const accountNum = existing.length + 1
      const outPath = join(dir, `gemini-account${accountNum}.json`)
      writeFileSync(outPath, JSON.stringify(storageState, null, 2))
      try { await authBrowser.close() } catch {}
      authBrowser = null
      authContext = null
      const size = ((await import('fs')).statSync(outPath).size / 1024).toFixed(1)
      res.json({ ok: true, message: `Saved: gemini-account${accountNum}.json (${size} KB)`, accountNum, path: outPath })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
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
