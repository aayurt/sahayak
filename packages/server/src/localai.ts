import { DEFAULT_AI_ENDPOINT } from '@sahayak/shared'

export interface LocalAIChatRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface LocalAIModel {
  id: string
  object: string
  created: number
  backend: string
  context_size: number
  name?: string
}

export function createLocalAIClient(baseUrl: string = DEFAULT_AI_ENDPOINT) {
  async function listModels(): Promise<LocalAIModel[]> {
    const res = await fetch(`${baseUrl}/v1/models`)
    if (!res.ok) throw new Error(`Failed to list models: ${res.status}`)
    const data = await res.json() as { data: LocalAIModel[] }
    return data.data || []
  }

  async function* chatStream(req: LocalAIChatRequest): AsyncGenerator<string> {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, stream: true }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Chat completion failed: ${res.status} ${errBody}`)
    }
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))
            const content = json.choices?.[0]?.delta?.content || ''
            if (content) yield content
          } catch {
            // skip malformed
          }
        }
      }
    }
  }

  async function chatComplete(req: LocalAIChatRequest): Promise<string> {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Chat completion failed: ${res.status} ${errBody}`)
    }
    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices?.[0]?.message?.content || ''
  }

  async function tts(text: string, voice: string = 'en_US-medium', model: string = ''): Promise<ArrayBuffer> {
    const res = await fetch(`${baseUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        voice,
        model: model || undefined,
        response_format: 'wav',
      }),
    })
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`)
    return res.arrayBuffer()
  }

  async function transcribe(audio: Blob, model: string = ''): Promise<string> {
    const form = new FormData()
    form.append('file', audio, 'audio.wav')
    form.append('model', model || 'whisper-1')
    if (model) form.append('model', model)
    const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error(`STT failed: ${res.status}`)
    const data = await res.json() as { text: string }
    return data.text || ''
  }

  return { listModels, chatStream, chatComplete, tts, transcribe }
}
