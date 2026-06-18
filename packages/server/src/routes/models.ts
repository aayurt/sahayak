import { Router } from 'express'
import { createLocalAIClient } from '../localai'
import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export function modelsRouter() {
  const router = Router()

  router.get('/', async (_req, res) => {
    const opencodeModel = { id: 'opencode', name: 'OpenCode', backend: 'opencode', context_size: 128000 }
    const geminiModel = { id: 'gemini', name: 'Gemini (Playwright)', backend: 'gemini', context_size: 1000000 }
    const endpoint = process.env.SAHAYAK_AI_ENDPOINT || 'http://localhost:8080'
    try {
      const client = createLocalAIClient(endpoint)
      const models = await client.listModels()
      res.json({ models: [opencodeModel, geminiModel, ...models] })
    } catch (err) {
      res.json({ models: [opencodeModel, geminiModel], error: (err as Error).message })
    }
  })

  router.post('/download', async (req, res) => {
    const { type, name } = req.body || {}

    if (type === 'whisper') {
      const modelsDir = join(homedir(), '.cache', 'sahayak', 'models')
      if (!existsSync(modelsDir)) mkdirSync(modelsDir, { recursive: true })

      const modelName = name || 'ggml-medium.bin'
      const modelPath = join(modelsDir, modelName)

      if (existsSync(modelPath)) {
        return res.json({ ok: true, message: `Model ${modelName} already exists`, path: modelPath })
      }

      const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`

      try {
        execSync(`curl -L -o "${modelPath}" "${url}"`, { stdio: 'pipe', timeout: 300000 })
        return res.json({ ok: true, message: `Model ${modelName} downloaded`, path: modelPath })
      } catch (e) {
        return res.status(500).json({ error: `Download failed: ${(e as Error).message}` })
      }
    }

    return res.status(400).json({ error: `Unknown model type: ${type}` })
  })

  router.get('/download/whisper', async (_req, res) => {
    const modelsDir = join(homedir(), '.cache', 'sahayak', 'models')
    const whisperModels = ['ggml-tiny.bin', 'ggml-base.bin', 'ggml-small.bin', 'ggml-medium.bin', 'ggml-large-v3.bin']
    const installed: string[] = []
    const available: string[] = []

    for (const m of whisperModels) {
      const path = join(modelsDir, m)
      if (existsSync(path)) {
        installed.push(m)
      } else {
        available.push(m)
      }
    }

    res.json({ modelsDir, installed, available })
  })

  return router
}
