import { createStore } from 'solid-js/store'
import { api } from '../lib/api-client'
import type { PermissionRequest, PermissionReply } from '../types/permission'
import { isPermissionAutoAcceptEnabled, togglePermissionAutoAccept } from './permission-auto-accept'

export interface ResourceAttachment {
  id: string
  name: string
  type: 'folder' | 'ssh'
  path?: string
  host?: string
  permissions: string
  graphifyState?: 'none' | 'running' | 'done' | 'error'
}

interface ChatMessage {
  id: string
  role: string
  content: string
  model: string
  createdAt: string
  resources?: ResourceAttachment[]
}

interface Session {
  id: string
  name: string
  model: string
  updatedAt: string
}

export interface SessionStreamState {
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
  permissionQueue: PermissionRequest[]
  activePermissionId: string | null
  attachedResources: ResourceAttachment[]
}

function defaultSessionState(): SessionStreamState {
  return {
    messages: [],
    streaming: false,
    streamingContent: '',
    permissionQueue: [],
    activePermissionId: null,
    attachedResources: [],
  }
}

interface ChatState {
  sessions: Session[]
  currentSessionId: string | null
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
  permissionQueue: PermissionRequest[]
  autoAcceptEnabled: boolean
  activePermissionId: string | null
  attachedResources: ResourceAttachment[]
  sessionStates: Record<string, SessionStreamState>
}

const [state, setState] = createStore<ChatState>({
  sessions: [],
  currentSessionId: null,
  messages: [],
  streaming: false,
  streamingContent: '',
  permissionQueue: [],
  autoAcceptEnabled: false,
  activePermissionId: null,
  attachedResources: [],
  sessionStates: {},
})

export function useChatStore() {
  return { state, setState }
}

// Per-session readers and generation counters for concurrent streaming
const sessionReaders = new Map<string, {
  reader: ReadableStreamDefaultReader<Uint8Array> | null
  generation: number
}>()

/** Copy a session's per-session state into the flat top-level fields */
function syncFlatFields(sid: string | null) {
  if (!sid) {
    setState('messages', [])
    setState('streaming', false)
    setState('streamingContent', '')
    setState('permissionQueue', [])
    setState('activePermissionId', null)
    setState('attachedResources', [])
    return
  }
  if (sid !== state.currentSessionId) return
  const s = state.sessionStates[sid]
  if (!s) return
  setState('messages', s.messages)
  setState('streaming', s.streaming)
  setState('streamingContent', s.streamingContent)
  setState('permissionQueue', s.permissionQueue)
  setState('activePermissionId', s.activePermissionId)
  setState('attachedResources', s.attachedResources)
}

function ensureSessionState(sid: string): SessionStreamState {
  if (!state.sessionStates[sid]) {
    setState('sessionStates', sid, defaultSessionState())
  }
  return state.sessionStates[sid]
}

export async function loadSessions() {
  const data = await api.listSessions()
  setState('sessions', data)
}

export async function createSession() {
  const { id } = await api.createSession()
  await loadSessions()
  ensureSessionState(id)
  setState('currentSessionId', id)
  syncFlatFields(id)
  const auto = isPermissionAutoAcceptEnabled(id)
  setState('autoAcceptEnabled', auto)
  return id
}

export async function selectSession(id: string) {
  // Save current session's flat state back into sessionStates
  const oldId = state.currentSessionId
  if (oldId && oldId !== id) {
    ensureSessionState(oldId)
    setState('sessionStates', oldId, {
      messages: state.messages,
      streaming: state.streaming,
      streamingContent: state.streamingContent,
      permissionQueue: state.permissionQueue,
      activePermissionId: state.activePermissionId,
    })
  }

  setState('currentSessionId', id)
  ensureSessionState(id)

  // Load messages from server
  const data = await api.getSession(id)
  setState('sessionStates', id, 'messages', data.messages || [])

  syncFlatFields(id)

  const auto = isPermissionAutoAcceptEnabled(id)
  setState('autoAcceptEnabled', auto)
}

export async function renameSession(id: string, name: string) {
  await api.updateSession(id, name)
  setState('sessions', (s) => s.id === id, 'name', name)
}

export async function syncAutoAccept() {
  const sid = state.currentSessionId
  if (sid) {
    const auto = isPermissionAutoAcceptEnabled(sid)
    setState('autoAcceptEnabled', auto)
  }
}

export function toggleAutoAccept() {
  const sid = state.currentSessionId
  if (!sid) return
  const next = !state.autoAcceptEnabled
  togglePermissionAutoAccept(sid, next)
  setState('autoAcceptEnabled', next)
}

export function addPermissionToQueue(sessionId: string, permission: PermissionRequest) {
  ensureSessionState(sessionId)
  setState('sessionStates', sessionId, 'permissionQueue', (q) => {
    const existing = q.findIndex((p) => p.id === permission.id)
    if (existing >= 0) {
      const updated = [...q]
      updated[existing] = { ...updated[existing], ...permission }
      return updated
    }
    const withTime = { ...permission, time: permission.time || { created: Date.now() } }
    return [...q, withTime].sort(
      (a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0),
    )
  })

  const currentQueue = state.sessionStates[sessionId].permissionQueue
  if (!state.sessionStates[sessionId].activePermissionId && currentQueue.length > 0) {
    setState('sessionStates', sessionId, 'activePermissionId', currentQueue[0].id)
  }

  if (sessionId === state.currentSessionId) {
    syncFlatFields(sessionId)
  }

  drainAutoAccept()
}

export function removePermissionFromQueue(sessionId: string, id: string) {
  ensureSessionState(sessionId)
  setState('sessionStates', sessionId, 'permissionQueue', (q) => q.filter((p) => p.id !== id))

  const s = state.sessionStates[sessionId]
  if (s.activePermissionId === id) {
    const next = s.permissionQueue.length > 0 ? s.permissionQueue[0].id : null
    setState('sessionStates', sessionId, 'activePermissionId', next)
  }

  if (sessionId === state.currentSessionId) {
    syncFlatFields(sessionId)
  }
}

export function getActivePermission(): PermissionRequest | null {
  const sid = state.currentSessionId
  if (!sid) return null
  const s = state.sessionStates[sid]
  if (!s?.activePermissionId) return null
  return s.permissionQueue.find((p) => p.id === s.activePermissionId) ?? null
}

function drainAutoAccept() {
  if (!state.autoAcceptEnabled) return
  const sid = state.currentSessionId
  if (!sid) return
  const s = state.sessionStates[sid]
  if (!s) return
  const queue = [...s.permissionQueue]
  for (const perm of queue) {
    if (perm.id === s.activePermissionId) {
      sendPermissionResponse(sid, perm.id, 'once')
    }
  }
}

export async function sendMessage(message: string, model: string, systemPrompt?: string, resources?: ResourceAttachment[]) {
  const sid = state.currentSessionId
  if (!sid) return

  ensureSessionState(sid)

  if (!sessionReaders.has(sid)) {
    sessionReaders.set(sid, { reader: null, generation: 0 })
  }
  const sessionReader = sessionReaders.get(sid)!

  // Abort any previous stream for THIS session only
  if (sessionReader.reader) {
    try { sessionReader.reader.cancel() } catch { /* ignore */ }
    sessionReader.reader = null
  }

  sessionReader.generation++
  const gen = sessionReader.generation

  setState('sessionStates', sid, {
    streaming: true,
    streamingContent: '',
    permissionQueue: [],
    activePermissionId: null,
  })
  syncFlatFields(sid)

  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message,
    model,
    createdAt: new Date().toISOString(),
    resources,
  }
  setState('sessionStates', sid, 'messages', (m) => [...m, userMsg])
  syncFlatFields(sid)

  let fullContent = ''
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  try {
    const body = JSON.stringify({ message, model, systemPrompt, stream: true, resources })
    const res = await fetch(`/api/chat/sessions/${sid}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!res.ok) {
      setState('sessionStates', sid, 'streaming', false)
      syncFlatFields(sid)
      return
    }

    reader = res.body!.getReader()
    sessionReader.reader = reader
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
            if (json.type === 'permission') {
              const perm: PermissionRequest = {
                id: json.permissionId,
                sessionID: sid,
                title: json.title || json.permission || 'opencode action',
                permission: json.permission,
                patterns: json.patterns || [],
                metadata: json.metadata,
                time: { created: Date.now() },
              }
              addPermissionToQueue(sid, perm)
              continue
            }
            if (json.content) {
              fullContent += json.content
              setState('sessionStates', sid, 'streamingContent', fullContent)
              if (sid === state.currentSessionId) {
                setState('streamingContent', fullContent)
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    }
  } catch (err) {
    console.error('[chat] streaming error:', err)
  } finally {
    if (sessionReader.reader === reader) {
      sessionReader.reader = null
    }
    if (reader) {
      try { reader.cancel() } catch { /* ignore */ }
    }
  }

  try {
    if (gen !== sessionReaders.get(sid)?.generation) return

    if (fullContent.trim()) {
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        model,
        createdAt: new Date().toISOString(),
      }
      setState('sessionStates', sid, 'messages', (m) => [...m, assistantMsg])
      try {
        window.dispatchEvent(new CustomEvent('sahayak:assistant-response', { detail: { content: fullContent.trim() } }))
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('[chat] failed to finalize streaming response:', err)
  } finally {
    if (gen === sessionReaders.get(sid)?.generation) {
      setState('sessionStates', sid, {
        streaming: false,
        streamingContent: '',
        permissionQueue: [],
        activePermissionId: null,
      })
      syncFlatFields(sid)
    }
  }

  const currentSession = state.sessions.find(s => s.id === sid)
  if (currentSession && currentSession.name === 'New Chat') {
    const title = message.length > 60 ? message.slice(0, 57) + '\u2026' : message
    renameSession(sid, title)
  }
}

export async function sendPermissionResponse(sessionId: string, requestId: string, response: PermissionReply) {
  await fetch(`/api/chat/sessions/${sessionId}/permission-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response, permissionId: requestId }),
  })
  removePermissionFromQueue(sessionId, requestId)
}

export function setAttachedResources(sessionId: string, resources: ResourceAttachment[] | ((prev: ResourceAttachment[]) => ResourceAttachment[])) {
  ensureSessionState(sessionId)
  if (typeof resources === 'function') {
    const prev = state.sessionStates[sessionId]?.attachedResources ?? []
    const next = resources(prev)
    setState('sessionStates', sessionId, 'attachedResources', next)
  } else {
    setState('sessionStates', sessionId, 'attachedResources', resources)
  }
  if (sessionId === state.currentSessionId) {
    syncFlatFields(sessionId)
  }
}

export function abortStream(sessionId?: string) {
  const sid = sessionId || state.currentSessionId
  if (!sid) return
  const sr = sessionReaders.get(sid)
  if (sr?.reader) {
    sr.reader.cancel()
    sr.reader = null
  }
  setState('sessionStates', sid, {
    streaming: false,
    streamingContent: '',
    permissionQueue: [],
    activePermissionId: null,
  })
  if (sid === state.currentSessionId) {
    syncFlatFields(sid)
  }
}
