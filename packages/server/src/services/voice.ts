/**
 * Voice service — wraps voice sidecar with LocalAI fallback
 */

import { createLocalAIClient } from '../localai'

export interface VoiceServiceConfig {
  voiceEndpoint?: string
  aiEndpoint: string
}

export interface TTSOptions {
  text: string
  voice?: string
  model?: string
}

export interface STTOptions {
  audio: Blob
  model?: string
}

export function createVoiceService(config: VoiceServiceConfig) {
  const localAIClient = createLocalAIClient(config.aiEndpoint)
  const voiceBase = config.voiceEndpoint

  async function tts(opts: TTSOptions): Promise<ArrayBuffer> {
    if (voiceBase) {
      try {
        const form = new URLSearchParams()
        form.append('input', opts.text)
        form.append('voice', opts.voice || 'af_heart')
        form.append('model', opts.model || 'kokoro')
        const res = await fetch(`${voiceBase}/v1/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
        })
        if (res.ok) return res.arrayBuffer()
        console.warn('[voice] TTS sidecar failed, falling back to LocalAI')
      } catch {
        console.warn('[voice] TTS sidecar unreachable, falling back to LocalAI')
      }
    }
    return localAIClient.tts(opts.text, opts.voice, opts.model)
  }

  async function stt(audio: Blob): Promise<string> {
    if (voiceBase) {
      try {
        const form = new FormData()
        form.append('file', audio, 'audio.wav')
        form.append('model', 'base')
        const res = await fetch(`${voiceBase}/v1/audio/transcriptions`, {
          method: 'POST',
          body: form,
        })
        if (res.ok) {
          const data = await res.json() as { text: string }
          return data.text
        }
        console.warn('[voice] STT sidecar failed, falling back to LocalAI')
      } catch {
        console.warn('[voice] STT sidecar unreachable, falling back to LocalAI')
      }
    }
    return localAIClient.transcribe(audio)
  }

  async function health(): Promise<boolean> {
    if (!voiceBase) return false
    try {
      const res = await fetch(`${voiceBase}/health`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch {
      return false
    }
  }

  return { tts, stt, health }
}

export type VoiceService = ReturnType<typeof createVoiceService>
