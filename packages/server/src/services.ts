import si from 'systeminformation'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq, desc } from 'drizzle-orm'

export async function collectSystemMetrics() {
  const [cpu, mem, fs] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
  ])
  const db = getDb()
  const id = uuid()
  await db.insert(schema.systemMetrics).values({
    id,
    timestamp: new Date(),
    cpu: cpu.currentLoad,
    ramUsed: Math.round(mem.used / 1024 / 1024),
    ramTotal: Math.round(mem.total / 1024 / 1024),
    diskUsed: Math.round((fs[0]?.used || 0) / 1024 / 1024),
    diskTotal: Math.round((fs[0]?.size || 0) / 1024 / 1024),
    networkRx: 0,
    networkTx: 0,
  })
  return {
    cpu: cpu.currentLoad,
    ramUsed: mem.used,
    ramTotal: mem.total,
    diskUsed: fs[0]?.used || 0,
    diskTotal: fs[0]?.size || 0,
    timestamp: Date.now(),
  }
}

export async function getLatestMetrics() {
  const db = getDb()
  const last20 = await db
    .select()
    .from(schema.systemMetrics)
    .orderBy(desc(schema.systemMetrics.timestamp))
    .limit(20)
  return last20
}

export async function loadSession(id: string) {
  const db = getDb()
  const session = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, id))
    .limit(1)
  if (!session.length) return null
  const msgs = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.sessionId, id))
    .orderBy(schema.messages.createdAt)
  return { session: session[0], messages: msgs }
}

export async function saveMessage(msg: {
  id: string
  sessionId: string
  role: string
  content: string
  model: string
  tokens?: number
}) {
  const db = getDb()
  await db.insert(schema.messages).values({
    id: msg.id,
    sessionId: msg.sessionId,
    role: msg.role as any,
    content: msg.content,
    model: msg.model,
    tokens: msg.tokens || 0,
    metadata: {},
    createdAt: new Date(),
  })
}
