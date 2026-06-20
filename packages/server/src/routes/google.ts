import { Router } from 'express'
import {
  getAuthUrl,
  handleCallback,
  getAuthStatus,
  disconnect,
  hasCredentials,
} from '../services/google/auth'
import {
  listSpreadsheets,
  readRange,
  getSheetSummary,
  updateRange,
  appendRows,
} from '../services/google/sheets'

const UI_REDIRECT = 'http://localhost:5173/settings?google=connected'

export function googleRouter() {
  const router = Router()

  router.get('/auth/url', (_req, res) => {
    if (!hasCredentials()) {
      return res.status(400).json({
        error: 'Google Client ID and Secret not configured. Set them in Settings > Google Drive.',
      })
    }
    res.json({ url: getAuthUrl() })
  })

  router.get('/auth/callback', async (req, res) => {
    const { code } = req.query
    if (!code || typeof code !== 'string') {
      return res.redirect(`${UI_REDIRECT}&error=missing_code`)
    }
    try {
      const { email } = await handleCallback(code)
      res.redirect(`${UI_REDIRECT}&email=${encodeURIComponent(email)}`)
    } catch (err: any) {
      res.redirect(`${UI_REDIRECT}&error=${encodeURIComponent(err.message)}`)
    }
  })

  router.get('/auth/status', async (_req, res) => {
    res.json(await getAuthStatus())
  })

  router.delete('/auth', async (_req, res) => {
    await disconnect()
    res.json({ ok: true })
  })

  router.get('/sheets', async (_req, res) => {
    try {
      const sheets = await listSpreadsheets()
      res.json({ sheets })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/sheets/:id', async (req, res) => {
    try {
      const range = req.query.range as string | undefined
      const data = await readRange(req.params.id, range)
      res.json(data)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/sheets/:id/summary', async (req, res) => {
    try {
      const summary = await getSheetSummary(req.params.id)
      res.json(summary)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/sheets/:id/update', async (req, res) => {
    const { range, values } = req.body
    if (!range || !values) {
      return res.status(400).json({ error: 'range and values are required' })
    }
    try {
      await updateRange(req.params.id, range, values)
      res.json({ ok: true })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/sheets/:id/append', async (req, res) => {
    const { range, values } = req.body
    if (!range || !values) {
      return res.status(400).json({ error: 'range and values are required' })
    }
    try {
      await appendRows(req.params.id, range, values)
      res.json({ ok: true })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}
