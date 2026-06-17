import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createLocalAIClient } from './localai'

describe('createLocalAIClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  describe('listModels', () => {
    it('returns model list on success', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'llama-3.1', object: 'model', created: 1, backend: 'llama.cpp', context_size: 8192 },
          ],
        }),
      } as Response)

      const client = createLocalAIClient('http://test:8080')
      const models = await client.listModels()
      expect(models).toHaveLength(1)
      expect(models[0].id).toBe('llama-3.1')
    })

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)

      const client = createLocalAIClient('http://test:8080')
      await expect(client.listModels()).rejects.toThrow('Failed to list models: 500')
    })
  })

  describe('chatComplete', () => {
    it('returns assistant message content', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello!' } }],
        }),
      } as Response)

      const client = createLocalAIClient('http://test:8080')
      const reply = await client.chatComplete({ model: 'llama', messages: [{ role: 'user', content: 'hi' }] })
      expect(reply).toBe('Hello!')
    })

    it('throws on error response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      } as Response)

      const client = createLocalAIClient('http://test:8080')
      await expect(client.chatComplete({ model: 'llama', messages: [] })).rejects.toThrow('Rate limited')
    })
  })

  describe('chatStream', () => {
    async function collectStream(client: ReturnType<typeof createLocalAIClient>, req: Parameters<typeof client.chatStream>[0]) {
      const chunks: string[] = []
      for await (const chunk of client.chatStream(req)) {
        chunks.push(chunk)
      }
      return chunks
    }

    it('yields content chunks from SSE stream', async () => {
      const encoder = new TextEncoder()
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('')

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader() {
            let index = 0
            const bytes = encoder.encode(sseData)
            return {
              read() {
                if (index >= bytes.length) return Promise.resolve({ done: true, value: undefined })
                const chunk = bytes.slice(index, index + 20)
                index += 20
                return Promise.resolve({ done: false, value: chunk })
              },
            }
          },
        },
      } as unknown as Response)

      const client = createLocalAIClient('http://test:8080')
      const chunks = await collectStream(client, { model: 'llama', messages: [] })
      expect(chunks.join('')).toBe('Hello world')
    })

    it('skips non-data lines', async () => {
      const encoder = new TextEncoder()
      const sseData = [
        ':comment\n\n',
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('')

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        body: {
          getReader() {
            const bytes = encoder.encode(sseData)
            let read = false
            return {
              read() {
                if (read) return Promise.resolve({ done: true, value: undefined })
                read = true
                return Promise.resolve({ done: false, value: bytes })
              },
            }
          },
        },
      } as unknown as Response)

      const client = createLocalAIClient('http://test:8080')
      const chunks = await collectStream(client, { model: 'llama', messages: [] })
      expect(chunks).toEqual(['ok'])
    })
  })
})
