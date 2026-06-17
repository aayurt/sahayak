import { Router } from 'express'
import { collectSystemMetrics, getLatestMetrics } from '../services'

async function checkBackend(url: string, label: string): Promise<{ name: string; url: string; status: 'online' | 'offline'; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (res.ok) return { name: label, url, status: 'online' }
    return { name: label, url, status: 'offline', error: `HTTP ${res.status}` }
  } catch (e) {
    return { name: label, url, status: 'offline', error: (e as Error).message }
  }
}

export function systemRouter() {
  const router = Router()

  router.get('/metrics', async (_req, res) => {
    const metrics = await getLatestMetrics()
    res.json(metrics)
  })

  router.post('/metrics/collect', async (_req, res) => {
    const metrics = await collectSystemMetrics()
    res.json(metrics)
  })

  router.get('/backends', async (_req, res) => {
    const results = await Promise.all([
      checkBackend('http://localhost:8080/v1/models', 'LocalAI'),
      checkBackend('http://localhost:11434/api/tags', 'Ollama'),
      checkBackend('http://localhost:1234/v1/models', 'LM Studio'),
    ])
    res.json({ backends: results })
  })

  return router
}
