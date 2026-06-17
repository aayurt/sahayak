import { Router } from 'express'
import type { VoiceService } from '../services/voice'
import type { UploadedFile } from 'express-fileupload'

export function ttsRouter(voiceService?: VoiceService) {
  const router = Router()

  router.post('/speak', async (req, res) => {
    const { text, voice, model } = req.body
    if (!text) return res.status(400).json({ error: 'text required' })
    try {
      if (voiceService) {
        const audio = await voiceService.tts({ text, voice, model })
        res.setHeader('Content-Type', 'audio/wav')
        return res.send(Buffer.from(audio))
      }
    } catch {
      // fall through to LocalAI fallback
    }
    const endpoint = process.env.SAHAYAK_AI_ENDPOINT || 'http://localhost:8080'
    const { createLocalAIClient } = await import('../localai')
    const client = createLocalAIClient(endpoint)
    const audio = await client.tts(text, voice, model)
    res.setHeader('Content-Type', 'audio/wav')
    res.send(Buffer.from(audio))
  })

  router.post('/transcribe', async (req, res) => {
    const uploadedFile = req.files?.file as UploadedFile | undefined
    if (!uploadedFile) return res.status(400).json({ error: 'audio file required' })
    const audioBlob = new Blob([uploadedFile.data], { type: uploadedFile.mimetype || 'audio/webm' })
    try {
      if (voiceService) {
        const text = await voiceService.stt(audioBlob)
        return res.json({ text })
      }
    } catch {
      // fall through
    }
    const endpoint = process.env.SAHAYAK_AI_ENDPOINT || 'http://localhost:8080'
    const { createLocalAIClient } = await import('../localai')
    const client = createLocalAIClient(endpoint)
    const text = await client.transcribe(audioBlob)
    res.json({ text })
  })

  router.get('/health', async (_req, res) => {
    let voiceOk = false
    if (voiceService) {
      voiceOk = await voiceService.health()
    }
    res.json({ voiceEndpoint: voiceOk })
  })

  return router
}
