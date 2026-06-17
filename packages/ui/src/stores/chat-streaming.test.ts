import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useChatStore, sendMessage, addPermissionToQueue, removePermissionFromQueue } from './chat'

vi.mock('../lib/api-client', () => ({
  api: {
    listSessions: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    updateSession: vi.fn(),
  },
}))

function makeMockBody(chunks: string[], endAfter: boolean): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]))
        i++
      } else if (endAfter) {
        controller.close()
      }
      // If not endAfter, never close — simulates hanging stream
    },
    cancel() {
      // noop
    },
  })
}

describe('chat store streaming state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { setState } = useChatStore()
    setState('currentSessionId', 'test-session')
    setState('sessionStates', {
      'test-session': {
        messages: [],
        streaming: false,
        streamingContent: '',
        permissionQueue: [],
        activePermissionId: null,
      },
      'session-a': {
        messages: [],
        streaming: false,
        streamingContent: '',
        permissionQueue: [],
        activePermissionId: null,
      },
      'session-b': {
        messages: [],
        streaming: false,
        streamingContent: '',
        permissionQueue: [],
        activePermissionId: null,
      },
    })
    setState('streaming', false)
    setState('streamingContent', '')
    setState('permissionQueue', [])
    setState('activePermissionId', null)
    setState('messages', [])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('streaming goes back to false after normal SSE completion', async () => {
    const chunks = [
      'data: {"content":"Hello"}\n\n',
      'data: {"content":" world"}\n\n',
      'data: [DONE]\n\n',
    ]
    const mockRes = {
      ok: true,
      body: makeMockBody(chunks, true),
    }
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockRes)

    const p = sendMessage('hi', 'test-model')
    // Wait for the async function to complete
    await p

    const { state } = useChatStore()
    expect(state.streaming).toBe(false)
    expect(state.streamingContent).toBe('')
    expect(state.messages.length).toBe(2) // user msg + assistant msg
    expect(state.messages[1].content).toBe('Hello world')
  })

  it('streaming goes back to false after fetch error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await sendMessage('hi', 'test-model')

    const { state } = useChatStore()
    expect(state.streaming).toBe(false)
    expect(state.streamingContent).toBe('')
  })

  it('streaming goes back to false after network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network failure'))

    await sendMessage('hi', 'test-model')

    const { state } = useChatStore()
    expect(state.streaming).toBe(false)
    expect(state.streamingContent).toBe('')
  })

  it('streaming goes back to false after read error mid-stream', async () => {
    // Simulate a stream that encounters an error on the second read
    let callCount = 0
    const throwingStream = new ReadableStream({
      pull(controller) {
        callCount++
        if (callCount === 1) {
          controller.enqueue(new TextEncoder().encode('data: {"content":"hello"}\n\n'))
        } else {
          controller.error(new Error('Stream corrupted'))
        }
      },
      cancel() { /* noop */ },
    })
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: throwingStream,
    })

    await sendMessage('hi', 'test-model')

    const { state } = useChatStore()
    expect(state.streaming).toBe(false)
  })

  it('can send a new message even if streaming is stuck on previous call', async () => {
    // Simulate a deferred stream — first read returns a chunk, subsequent reads
    // are controlled by a deferred promise
    const hangingStream = new ReadableStream({
      pull(controller) {
        return new Promise((_resolve) => {
          controller.enqueue(new TextEncoder().encode('data: {"content":"stuck"}\n\n'))
          // Never resolve this promise — simulates a stuck read
        })
      },
      cancel() { /* noop */ },
    })
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: hangingStream,
    })

    // Start first send — it will get stuck after the first chunk
    sendMessage('first msg', 'test-model')
    // Give it a tick to start and get stuck
    await new Promise(r => setTimeout(r, 20))

    const { state } = useChatStore()
    expect(state.streaming).toBe(true)

    // Second send — should abort the stuck first call
    const normalChunks = ['data: {"content":"new response"}\n\n', 'data: [DONE]\n\n']
    const normalRes = {
      ok: true,
      body: makeMockBody(normalChunks, true),
    }
    globalThis.fetch = vi.fn().mockResolvedValueOnce(normalRes)

    await sendMessage('second msg', 'test-model')

    expect(state.streaming).toBe(false)
    const lastMsg = state.messages[state.messages.length - 1]
    expect(lastMsg.role).toBe('assistant')
    expect(lastMsg.content).toBe('new response')
  })

  it('streaming goes back to false after malformed SSE data', async () => {
    const chunks = [
      'data: {"content":"hello"}\n\n',
      'data: NOT JSON\n\n',
      'data: {"content":" world"}\n\n',
      'data: [DONE]\n\n',
    ]
    const mockRes = {
      ok: true,
      body: makeMockBody(chunks, true),
    }
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockRes)

    await sendMessage('hi', 'test-model')

    const { state } = useChatStore()
    expect(state.streaming).toBe(false)
    expect(state.messages[1]?.content).toBe('hello world')
  })

  it('permission queue operations work correctly', () => {
    const { state } = useChatStore()

    expect(state.permissionQueue.length).toBe(0)

    addPermissionToQueue('test-session', { id: 'p1', title: 'test', permission: 'bash', time: { created: 1 } })
    expect(state.permissionQueue.length).toBe(1)
    expect(state.activePermissionId).toBe('p1')

    addPermissionToQueue('test-session', { id: 'p2', title: 'test2', permission: 'read', time: { created: 2 } })
    expect(state.permissionQueue.length).toBe(2)

    removePermissionFromQueue('test-session', 'p1')
    expect(state.permissionQueue.length).toBe(1)
    expect(state.activePermissionId).toBe('p2')

    removePermissionFromQueue('test-session', 'p2')
    expect(state.permissionQueue.length).toBe(0)
    expect(state.activePermissionId).toBeNull()
  })

  it('streaming resets even if dispatchEvent throws', async () => {
    // Force dispatchEvent to throw
    const orig = window.dispatchEvent.bind(window)
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    dispatchSpy.mockImplementation(() => { throw new Error('dispatch crash') })

    const chunks = ['data: {"content":"hello"}\n\n', 'data: [DONE]\n\n']
    const mockRes = {
      ok: true,
      body: makeMockBody(chunks, true),
    }
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockRes)

    await sendMessage('hi', 'test-model')

    dispatchSpy.mockRestore()

    const { state } = useChatStore()
    expect(state.streaming).toBe(false)
    expect(state.messages[1]?.content).toBe('hello')
  })

  it('two sessions can stream independently', async () => {
    // Set up session A and B with different current sessions
    const { state, setState } = useChatStore()
    setState('currentSessionId', 'session-a')

    // Start a stream for session A
    const chunksA = ['data: {"content":"response from A"}\n\n', 'data: [DONE]\n\n']
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: makeMockBody(chunksA, true),
    })
    const sendA = sendMessage('msg A', 'test-model')

    // While A is streaming, switch to session B and start another stream
    setState('currentSessionId', 'session-b')
    const chunksB = ['data: {"content":"response from B"}\n\n', 'data: [DONE]\n\n']
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: makeMockBody(chunksB, true),
    })
    const sendB = sendMessage('msg B', 'test-model')

    // Switch back to A and wait for it to finish
    setState('currentSessionId', 'session-a')
    await sendA

    // Check A's state
    expect(state.sessionStates['session-a']?.streaming).toBe(false)
    const msgsA = state.sessionStates['session-a']?.messages ?? []
    expect(msgsA.length).toBeGreaterThanOrEqual(2)
    expect(msgsA[msgsA.length - 1]?.content).toBe('response from A')

    // Switch to B and check B's state
    setState('currentSessionId', 'session-b')
    await sendB

    expect(state.sessionStates['session-b']?.streaming).toBe(false)
    const msgsB = state.sessionStates['session-b']?.messages ?? []
    expect(msgsB.length).toBeGreaterThanOrEqual(2)
    expect(msgsB[msgsB.length - 1]?.content).toBe('response from B')
  })

  it('permission is cleared after streaming ends', async () => {
    // Add a pending permission
    addPermissionToQueue('test-session', { id: 'p1', title: 'test', permission: 'bash', time: { created: 1 } })

    const chunks = ['data: {"content":"done"}\n\n', 'data: [DONE]\n\n']
    const mockRes = {
      ok: true,
      body: makeMockBody(chunks, true),
    }
    globalThis.fetch = vi.fn().mockResolvedValueOnce(mockRes)

    await sendMessage('hi', 'test-model')

    const { state } = useChatStore()
    expect(state.streaming).toBe(false)
    expect(state.permissionQueue.length).toBe(0)
    expect(state.activePermissionId).toBeNull()
  })
})
