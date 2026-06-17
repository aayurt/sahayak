import { describe, it, expect } from 'vitest'
import type {
  ChatMessage,
  ChatSession,
  JarvisState,
  LocalAIModel,
  AppSettings,
} from './types'

describe('types', () => {
  it('ChatMessage shape is valid', () => {
    const msg: ChatMessage = {
      id: '1',
      sessionId: 's1',
      role: 'user',
      content: 'hello',
      model: 'gpt-4',
      tokens: 5,
      metadata: { source: 'test' },
      createdAt: new Date(),
    }
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('hello')
  })

  it('ChatSession tracks token usage', () => {
    const session: ChatSession = {
      id: 's1',
      name: 'Test',
      projectId: null,
      model: 'default',
      systemPrompt: '',
      tokenUsage: { prompt: 10, completion: 20, total: 30 },
      worktreePath: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(session.tokenUsage.total).toBe(30)
  })

  it('JarvisState has all status options', () => {
    const states: JarvisState['status'][] = ['idle', 'connecting', 'listening', 'thinking', 'speaking']
    const state: JarvisState = {
      status: 'idle',
      mode: 'click',
      isConnected: false,
      transcript: [],
      micActive: false,
    }
    for (const s of states) {
      state.status = s
      expect(state.status).toBe(s)
    }
  })

  it('LocalAIModel has required fields', () => {
    const model: LocalAIModel = {
      id: 'llama-3.1',
      name: 'Llama 3.1',
      backend: 'llama.cpp',
      contextSize: 8192,
    }
    expect(model.contextSize).toBeGreaterThan(0)
  })

  it('AppSettings defaults to dark mode', () => {
    const settings: AppSettings = {
      theme: 'dark',
      aiEndpoint: 'http://localhost:8080',
      aiApiKey: '',
      openCodePath: 'opencode',
      serverPort: 9090,
      serverPassword: '',
    }
    expect(settings.theme).toBe('dark')
  })
})
