import type { WorkspaceManager } from './workspaces/manager'
import { initDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'

function authHeaders(): Record<string, string> {
  const username = 'sahayak'
  const password = process.env.SAHAYAK_SERVER_PASSWORD || 'sahayak'
  const encoded = Buffer.from(`${username}:${password}`).toString('base64')
  return { Authorization: `Basic ${encoded}` }
}

interface OpenCodeMapping {
  workspaceId: string
  ocSessionId: string
}

const sessionMap = new Map<string, OpenCodeMapping>()

export function getOpenCodeMapping(sahayakSessionId: string): OpenCodeMapping | undefined {
  return sessionMap.get(sahayakSessionId)
}

export function clearOpenCodeMapping(sahayakSessionId: string): void {
  sessionMap.delete(sahayakSessionId)
  try {
    const db = initDb()
    db.update(schema.sessions)
      .set({ openCodeSessionId: null })
      .where(eq(schema.sessions.id, sahayakSessionId))
      .run()
  } catch { /* db not ready */ }
}

async function checkSessionAlive(port: number, ocSessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/session/${ocSessionId}`, {
      headers: { ...authHeaders() },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function ensureOpencodeSession(
  workspaceManager: WorkspaceManager,
  sahayakSessionId: string,
  projectPath: string,
): Promise<{ port: number; ocSessionId: string }> {
  // 1. Check in-memory map
  const existing = sessionMap.get(sahayakSessionId)
  if (existing) {
    const ws = workspaceManager.get(existing.workspaceId)
    if (ws?.port) {
      const alive = await checkSessionAlive(ws.port, existing.ocSessionId)
      if (alive) return { port: ws.port, ocSessionId: existing.ocSessionId }
    }
    sessionMap.delete(sahayakSessionId)
  }

  // 2. Check DB for persisted ocSessionId
  let persistedOcSessionId: string | undefined
  try {
    const db = initDb()
    const [row] = await db
      .select({ openCodeSessionId: schema.sessions.openCodeSessionId })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sahayakSessionId))
      .limit(1)
    persistedOcSessionId = row?.openCodeSessionId ?? undefined
  } catch { /* db not ready */ }

  if (persistedOcSessionId) {
    const ocSessionId = persistedOcSessionId
    let ws = workspaceManager.list().find(w => w.path === projectPath && w.status === 'ready')
    if (ws?.port) {
      const alive = await checkSessionAlive(ws.port, ocSessionId)
      if (alive) {
        sessionMap.set(sahayakSessionId, { workspaceId: ws.id, ocSessionId })
        return { port: ws.port, ocSessionId }
      }
    }
    // Workspace dead — create new one, session will be re-created below
  }

  // 3. Create workspace
  let ws = workspaceManager.list().find(w => w.path === projectPath && w.status === 'ready')
  if (!ws) {
    ws = await workspaceManager.create({
      folder: projectPath,
      binaryPath: process.env.OPENCODE_PATH || 'opencode',
    })
  }

  if (!ws.port) {
    throw new Error('OpenCode workspace started but no port detected')
  }

  const ocSessionId = await createOpencodeSession(ws.port, projectPath)

  // 4. Persist to DB
  try {
    const db = initDb()
    await db
      .update(schema.sessions)
      .set({ openCodeSessionId: ocSessionId })
      .where(eq(schema.sessions.id, sahayakSessionId))
  } catch { /* db not ready */ }

  sessionMap.set(sahayakSessionId, { workspaceId: ws.id, ocSessionId })

  return { port: ws.port, ocSessionId }
}

async function createOpencodeSession(port: number, directory?: string): Promise<string> {
  const url = new URL(`http://127.0.0.1:${port}/session`)
  if (directory) url.searchParams.set('directory', directory)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      title: 'Sahayak Chat',
      permission: [
        { permission: 'read', pattern: '*', action: 'ask' },
        { permission: 'write', pattern: '*', action: 'ask' },
        { permission: 'edit', pattern: '*', action: 'ask' },
        { permission: 'bash', pattern: '*', action: 'ask' },
        { permission: 'glob', pattern: '*', action: 'ask' },
        { permission: 'grep', pattern: '*', action: 'ask' },
        { permission: 'search', pattern: '*', action: 'ask' },
        { permission: 'file', pattern: '*', action: 'ask' },
        { permission: 'tool', pattern: '*', action: 'ask' },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to create opencode session (${res.status}): ${text}`)
  }

  const data = await res.json() as { id: string }
  return data.id
}

export type PermissionCallback = (
  sessionId: string,
  permissionId: string,
  title: string,
  metadata: Record<string, unknown>,
  permission?: string,
  patterns?: string[],
) => Promise<'once' | 'always' | 'reject'>

async function sendPermissionResponse(
  port: number,
  ocSessionId: string,
  permissionId: string,
  response: 'once' | 'always' | 'reject',
): Promise<void> {
  const res = await fetch(
    `http://127.0.0.1:${port}/session/${ocSessionId}/permissions/${permissionId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ response }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    console.warn(`[opencode] permission response failed (${res.status}): ${text}`)
  }
}

// Parse SSE lines from a buffer into events
function parseSSEBuffer(buffer: string): Array<{ eventType: string; data: string }> {
  const events: Array<{ eventType: string; data: string }> = []
  const rawEvents = buffer.split('\n\n')
  const incomplete = rawEvents.pop() || ''

  for (const raw of rawEvents) {
    let eventType = ''
    let dataStr = ''
    for (const line of raw.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice(6)
      }
    }
    if (dataStr) {
      events.push({ eventType, data: dataStr })
    }
  }

  return { events, rest: incomplete } as any
}

interface PermissionRequest {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  tool?: { messageID: string; callID: string }
}

export async function* streamOpencodeMessage(
  port: number,
  ocSessionId: string,
  message: string,
  directory?: string,
  systemPrompt?: string,
  onPermission?: PermissionCallback,
): AsyncGenerator<string> {
  // 1. Subscribe to global event stream FIRST (before sending the message)
  const eventUrl = new URL(`http://127.0.0.1:${port}/event`)
  const eventRes = await fetch(eventUrl.toString(), { headers: authHeaders() })
  if (!eventRes.ok || !eventRes.body) {
    throw new Error(`Failed to subscribe to opencode events (${eventRes.status})`)
  }

  const reader = eventRes.body.getReader()

  // 2. Send message asynchronously (fire-and-forget)
  const msgUrl = new URL(`http://127.0.0.1:${port}/session/${ocSessionId}/prompt_async`)
  if (directory) msgUrl.searchParams.set('directory', directory)
  const body: Record<string, unknown> = {
    parts: [{ type: 'text' as const, text: message }],
  }
  if (systemPrompt) body.system = systemPrompt
  const msgRes = await fetch(msgUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!msgRes.ok) {
    try { reader.cancel() } catch { /* ignore */ }
    const errText = await msgRes.text()
    throw new Error(`Opencode prompt_async failed (${msgRes.status}): ${errText}`)
  }
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const rawEvents = buffer.split('\n\n')
    buffer = rawEvents.pop() || ''

    for (const raw of rawEvents) {
      let eventType = ''
      let dataStr = ''

      for (const line of raw.split('\n')) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim()
        else if (line.startsWith('data: ')) dataStr = line.slice(6)
      }

      if (!dataStr) continue

      let parsed: any
      try { parsed = JSON.parse(dataStr) } catch { continue }

      const eventName = eventType || parsed?.type || ''
      const p = parsed?.properties || parsed

      if (eventName === 'permission.asked') {
        if (p.sessionID === ocSessionId && onPermission) {
          const title = `${p.permission} ${(p.patterns || []).join(', ')}`
          const response = await onPermission(ocSessionId, p.id, title, p.metadata || {}, p.permission, p.patterns)
          await sendPermissionResponse(port, ocSessionId, p.id, response)
        }
      } else if (eventName === 'message.part.delta') {
        if (p.field === 'text' && p.delta) {
          yield p.delta
        }
      } else if (eventName === 'message.updated') {
        if (p?.info?.error) {
          throw new Error(`Opencode error: ${JSON.stringify(p.info.error)}`)
        }
        // OpenCode sets time.completed when the assistant message is fully processed.
        // This signals the end of the current message stream so the generator
        // can stop rather than waiting indefinitely on the persistent SSE connection.
        if (p?.info?.sessionID === ocSessionId && p?.info?.role === 'assistant' && typeof p?.info?.time?.completed === 'number' && p.info.time.completed > 0) {
          try { reader.cancel() } catch { /* ignore */ }
          return
        }
      } else if (eventName === 'session.status') {
        if (p?.sessionID === ocSessionId && p?.status?.type === 'idle') {
          try { reader.cancel() } catch { /* ignore */ }
          return
        }
      }
    }
  }

  try { reader.cancel() } catch { /* ignore */ }
}
