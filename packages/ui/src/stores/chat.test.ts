import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChatStore, loadSessions, createSession, selectSession } from './chat'

// Mock the api module
vi.mock('../lib/api-client', () => ({
  api: {
    listSessions: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
  },
}))

import { api } from '../lib/api-client'

const mockApi = vi.mocked(api)

describe('chat store', () => {
  beforeEach(() => {
    // Reset store state by re-importing
    vi.clearAllMocks()
  })

  it('initial state is empty', () => {
    const { state } = useChatStore()
    expect(state.sessions).toEqual([])
    expect(state.currentSessionId).toBeNull()
    expect(state.messages).toEqual([])
    expect(state.streaming).toBe(false)
    expect(state.streamingContent).toBe('')
  })

  it('loadSessions populates state', async () => {
    const sessions = [{ id: 's1', name: 'Chat 1', model: 'llama', updatedAt: new Date().toISOString() }]
    mockApi.listSessions.mockResolvedValueOnce(sessions)

    await loadSessions()

    const { state } = useChatStore()
    expect(state.sessions).toEqual(sessions)
  })

  it('createSession creates and selects new session', async () => {
    mockApi.createSession.mockResolvedValueOnce({ id: 'new-id' })
    mockApi.listSessions.mockResolvedValueOnce([])

    const id = await createSession()

    expect(id).toBe('new-id')
    const { state } = useChatStore()
    expect(state.currentSessionId).toBe('new-id')
    expect(state.messages).toEqual([])
  })

  it('selectSession loads messages for session', async () => {
    const sessionData = {
      session: { id: 's1', name: 'Test' },
      messages: [
        { id: 'm1', role: 'user', content: 'hi', model: 'llama', createdAt: new Date().toISOString() },
        { id: 'm2', role: 'assistant', content: 'hello', model: 'llama', createdAt: new Date().toISOString() },
      ],
    }
    mockApi.getSession.mockResolvedValueOnce(sessionData)

    await selectSession('s1')

    const { state } = useChatStore()
    expect(state.currentSessionId).toBe('s1')
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0].role).toBe('user')
    expect(state.messages[1].role).toBe('assistant')
  })
})
