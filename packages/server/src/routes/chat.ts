import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { initDb, schema } from '@sahayak/shared/db'
import { createLocalAIClient } from '../localai'
import { eq, desc } from 'drizzle-orm'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { WorkspaceManager } from '../workspaces/manager'
import { ensureOpencodeSession, streamOpencodeMessage, clearOpenCodeMapping } from '../opencode-chat'
import type { PermissionCallback } from '../opencode-chat'

// Pending permission requests — keyed by sahayak session ID
const pendingPermissions = new Map<string, {
  resolve: (response: 'once' | 'always' | 'reject') => void
  reject: (err: Error) => void
  timeout: ReturnType<typeof setTimeout>
}>()

async function* withTimeout<T>(iter: AsyncGenerator<T>, ms: number, label: string): AsyncGenerator<T> {
  let timeout: NodeJS.Timeout | undefined
  let timedOut = false
  const wait = new Promise<void>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true
      const err = new Error(`${label} timed out after ${ms}ms`)
      err.name = 'TimeoutError'
      reject(err)
    }, ms)
  })
  try {
    const it = iter[Symbol.asyncIterator]()
    while (true) {
      const result = await Promise.race([it.next(), wait])
      if (timedOut) break
      if (result.done) break
      yield result.value
    }
  } finally {
    clearTimeout(timeout)
  }
}

function loadGraphifyContext(resources: any[]): string {
  const db = initDb()
  const sections: string[] = []
  for (const r of resources) {
    if (r.graphifyState !== 'done') continue
    const resource = db.select().from(schema.resources).where(eq(schema.resources.id, r.id)).get()
    if (!resource?.graphifyOutPath) continue
    const reportPath = join(resource.graphifyOutPath, 'GRAPH_REPORT.md')
    if (!existsSync(reportPath)) continue
    try {
      const content = readFileSync(reportPath, 'utf-8')
      // Extract key sections: God Nodes, Surprising Connections, Suggested Questions
      const godSection = content.match(/## God Nodes[\s\S]*?(?=## |$)/)?.[0]?.trim() || ''
      const surpriseSection = content.match(/## Surprising Connections[\s\S]*?(?=## |$)/)?.[0]?.trim() || ''
      const questionsSection = content.match(/## Suggested Questions[\s\S]*?(?=## |$)/)?.[0]?.trim() || ''
      sections.push(
        `--- Knowledge Graph for "${resource.name}" ---\n${
          [godSection, surpriseSection, questionsSection].filter(Boolean).join('\n\n')
        }`
      )
    } catch { /* skip unreadable */ }
  }
  return sections.length > 0
    ? `\n[Graphify Knowledge Graph context]\n${sections.join('\n\n')}\n[/Graphify Knowledge Graph context]\n`
    : ''
}

export function chatRouter(workspaceManager?: WorkspaceManager) {
  const router = Router()

  router.post('/sessions', async (_req, res) => {
    const db = initDb()
    const id = uuid()
    await db.insert(schema.sessions).values({
      id,
      name: 'New Chat',
      model: 'default',
      systemPrompt: '',
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    res.json({ id })
  })

  router.get('/sessions', async (_req, res) => {
    const db = initDb()
    const sessions = await db
      .select()
      .from(schema.sessions)
      .orderBy(desc(schema.sessions.updatedAt))
    res.json(sessions)
  })

  router.get('/sessions/:id', async (req, res) => {
    const db = initDb()
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, req.params.id))
      .limit(1)
    if (!session) return res.status(404).json({ error: 'Session not found' })
    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, req.params.id))
      .orderBy(schema.messages.createdAt)
    res.json({ session, messages })
  })

  router.post('/sessions/:id/messages', async (req, res) => {
    const { content, role, model } = req.body
    const db = initDb()
    const msgId = uuid()
    const msg = {
      id: msgId,
      sessionId: req.params.id,
      role: role || 'user',
      content,
      model: model || 'default',
    }
    await db.insert(schema.messages).values({
      ...msg,
      tokens: 0,
      metadata: {},
      createdAt: new Date(),
    })
    res.json({ id: msgId })
  })

  function buildInstruction(permissionMode: string): string {
    const askFirst = permissionMode !== 'allow'
    return `You can output structured data using JSON codeblocks.

## Plan format
Use this to show a task plan:
\`\`\`json
{
  "type": "plan",
  "tasks": [
    {
      "id": "unique-id",
      "title": "short task name",
      "description": "detailed description",
      "status": "pending",
      "priority": "high",
      "level": 0,
      "dependencies": [],
      "subtasks": [
        {
          "id": "unique-id",
          "title": "short subtask name",
          "description": "detailed description",
          "status": "pending",
          "priority": "high",
          "tools": ["tool-name"]
        }
      ]
    }
  ]
}
\`\`\`
Status: "pending", "in-progress", "completed", "need-help", "failed".
Priority: "high", "medium", "low".

## Question format
${askFirst
  ? 'You can access files freely. But before running ANY terminal command — including ls, cat, grep, or any shell operation — you MUST ask the user first using a structured question. Do NOT run terminal commands without explicit user approval. For code modifications, ask before deleting files or making risky changes.'
  : 'When you need the user\'s input, ask them using structured questions.'} There are three question kinds:

### single (pick one)
\`\`\`json
{
  "type": "question",
  "questions": [
    {
      "kind": "single",
      "title": "Which direction should I take?",
      "options": [
        { "id": "small", "label": "Small patch" },
        { "id": "full", "label": "Full refactor" }
      ]
    }
  ]
}
\`\`\`

### multiple (select any number)
\`\`\`json
{
  "type": "question",
  "questions": [
    {
      "kind": "multiple",
      "title": "Which areas need attention?",
      "options": [
        { "id": "ui", "label": "UI/UX" },
        { "id": "backend", "label": "Backend" },
        { "id": "db", "label": "Database" },
        { "id": "ops", "label": "DevOps" }
      ]
    }
  ]
}
\`\`\`

### text (freeform input)
\`\`\`json
{
  "type": "question",
  "questions": [
    {
      "kind": "text",
      "title": "Describe the issue",
      "description": "Please provide as much detail as possible"
    }
  ]
}
\`\`\`
Set "allowCustom": true on any kind to let the user type a custom answer.
Use "description" for optional longer explanations.`
  }

  router.post('/sessions/:id/chat', async (req, res) => {
    const { message, model: reqModel, systemPrompt, stream, projectPath, resources: rawResources } = req.body
    const graphifyCtx = (rawResources && Array.isArray(rawResources))
      ? loadGraphifyContext(rawResources)
      : ''
    const model = reqModel || 'default'
    const db = initDb()
    const sessionId = req.params.id

    // Read permission mode from settings
    let permissionMode = 'prompt'
    try {
      const setting = db.select().from(schema.settings).where(eq(schema.settings.key, 'permissionMode')).get()
      if (setting?.value && (setting.value === 'allow' || setting.value === 'prompt')) {
        permissionMode = setting.value as string
      }
    } catch { /* use default */ }
    const instruction = buildInstruction(permissionMode)

    const userMsg = {
      id: uuid(),
      sessionId,
      role: 'user' as const,
      content: message,
      model,
      tokens: 0,
      createdAt: new Date(),
    }
    await db.insert(schema.messages).values(userMsg)

    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, sessionId))
      .orderBy(schema.messages.createdAt)

    const resolvedProjectPath = projectPath || (workspaceManager ? process.cwd() : undefined)
    const tryOpencode = workspaceManager && resolvedProjectPath

    // Build context from previous messages for opencode (which doesn't have message history)
    // Build system prompt for opencode (instruction + graphify context + user custom system prompt)
    const systemParts = [instruction]
    if (graphifyCtx) systemParts.push(`[Graphify Knowledge Graph]\n${graphifyCtx}`)
    if (systemPrompt) systemParts.push(systemPrompt)
    const opencodeSystem = systemParts.join('\n\n')

    // Build conversation history context
    const previousMessages = messages.slice(0, -1).filter(m => m.role !== 'system')
    const opencodeMessage = previousMessages.length > 0
      ? previousMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + `\n\nUser: ${message}`
      : message

    const sessionTimeout = (promise: Promise<any>, ms: number) =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('Session setup timed out'), { name: 'TimeoutError' })), ms)
        ),
      ])

    if (!stream) {
      let reply: string

      if (tryOpencode) {
        try {
          const oc = await sessionTimeout(ensureOpencodeSession(workspaceManager!, sessionId, resolvedProjectPath!), 30000)
          let full = ''
          const rejectPerm: PermissionCallback = async () => { throw new Error('Permission needed but non-streaming chat cannot handle it') }
          for await (const chunk of withTimeout(streamOpencodeMessage(oc.port, oc.ocSessionId, opencodeMessage, resolvedProjectPath, opencodeSystem, rejectPerm), 60000, 'opencode streaming')) {
            full += chunk
          }
          reply = full
        } catch (err) {
          console.warn('[chat] opencode failed, falling back to LocalAI:', (err as Error).message)
          clearOpenCodeMapping(sessionId)
          try {
            const client = createLocalAIClient(process.env.SAHAYAK_AI_ENDPOINT || 'http://localhost:8080')
            const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }))
            apiMessages.unshift({ role: 'system', content: instruction })
            if (graphifyCtx) apiMessages.unshift({ role: 'system', content: `[Graphify Knowledge Graph]\n${graphifyCtx}` })
            if (systemPrompt) apiMessages.unshift({ role: 'system', content: systemPrompt })
            reply = await client.chatComplete({ model, messages: apiMessages })
          } catch (fallbackErr) {
            console.error('[chat] LocalAI fallback also failed:', (fallbackErr as Error).message)
            reply = 'I encountered an error processing your request.'
          }
        }
      } else {
        try {
          const client = createLocalAIClient(process.env.SAHAYAK_AI_ENDPOINT || 'http://localhost:8080')
          const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }))
          apiMessages.unshift({ role: 'system', content: instruction })
          if (graphifyCtx) apiMessages.unshift({ role: 'system', content: `[Graphify Knowledge Graph]\n${graphifyCtx}` })
          if (systemPrompt) apiMessages.unshift({ role: 'system', content: systemPrompt })
          reply = await client.chatComplete({ model, messages: apiMessages })
        } catch (err) {
          console.error('[chat] LocalAI failed:', (err as Error).message)
          reply = 'I encountered an error processing your request.'
        }
      }

      try {
        const assistantMsg = {
          id: uuid(),
          sessionId,
          role: 'assistant' as const,
          content: reply,
          model,
          tokens: 0,
          createdAt: new Date(),
        }
        await db.insert(schema.messages).values(assistantMsg)
        return res.json({ message: assistantMsg })
      } catch (saveErr) {
        console.error('[chat] failed to save assistant message:', saveErr)
        return res.json({ message: { id: uuid(), sessionId, role: 'assistant', content: reply, model, tokens: 0, createdAt: new Date() } })
      }
    }

    // Streaming
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    let fullContent = ''

    if (tryOpencode) {
      try {
        const oc = await sessionTimeout(ensureOpencodeSession(workspaceManager!, sessionId, resolvedProjectPath!), 30000)
        const onPermission: PermissionCallback = async (_ocSessionId, permissionId, title, _metadata, permission, patterns) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              pendingPermissions.delete(sessionId)
              pendingPermissions.delete(permissionId)
              reject(new Error('Permission response timed out'))
            }, 120000)
            // Key by both session ID and permission ID for flexible resolution
            pendingPermissions.set(sessionId, { resolve, reject, timeout })
            pendingPermissions.set(permissionId, { resolve, reject, timeout })
            res.write(`data: ${JSON.stringify({ type: 'permission', permissionId, title, permission, patterns })}\n\n`)
          })
        }
        const stream = streamOpencodeMessage(oc.port, oc.ocSessionId, opencodeMessage, resolvedProjectPath, opencodeSystem, onPermission)
        for await (const chunk of withTimeout(stream, 60000, 'opencode streaming')) {
          fullContent += chunk
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
        }
      } catch (err) {
        console.warn('[chat] opencode failed, falling back to LocalAI:', (err as Error).message)
        clearOpenCodeMapping(sessionId)
        const client = createLocalAIClient(process.env.SAHAYAK_AI_ENDPOINT || 'http://localhost:8080')
        const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }))
        apiMessages.unshift({ role: 'system', content: instruction })
        if (graphifyCtx) apiMessages.unshift({ role: 'system', content: `[Graphify Knowledge Graph]\n${graphifyCtx}` })
        if (systemPrompt) apiMessages.unshift({ role: 'system', content: systemPrompt })
        try {
          const fallbackStream = client.chatStream({ model, messages: apiMessages })
          for await (const chunk of withTimeout(fallbackStream, 120000, 'LocalAI streaming')) {
            fullContent += chunk
            res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
          }
        } catch (fallbackErr) {
          res.write(`data: ${JSON.stringify({ error: (fallbackErr as Error).message })}\n\n`)
        }
      }
    } else {
      const client = createLocalAIClient(process.env.SAHAYAK_AI_ENDPOINT || 'http://localhost:8080')
      const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }))
      apiMessages.unshift({ role: 'system', content: instruction })
      if (graphifyCtx) apiMessages.unshift({ role: 'system', content: `[Graphify Knowledge Graph]\n${graphifyCtx}` })
      if (systemPrompt) apiMessages.unshift({ role: 'system', content: systemPrompt })
      try {
        const directStream = client.chatStream({ model, messages: apiMessages })
        for await (const chunk of withTimeout(directStream, 120000, 'LocalAI streaming')) {
          fullContent += chunk
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
        }
      } catch (err) {
        res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`)
      }
    }

    try {
      const assistantMsg = {
        id: uuid(),
        sessionId,
        role: 'assistant' as const,
        content: fullContent,
        model,
        tokens: 0,
        createdAt: new Date(),
      }
      await db.insert(schema.messages).values(assistantMsg)
    } catch (saveErr) {
      console.error('[chat] failed to save assistant message:', saveErr)
    }
    res.write(`data: [DONE]\n\n`)
    res.end()
  })

  router.post('/sessions/:id/opencode/restore', async (req, res) => {
    if (!workspaceManager) {
      return res.status(400).json({ error: 'Workspace manager not available' })
    }
    const projectPath = req.body.projectPath || process.cwd()
    try {
      const oc = await ensureOpencodeSession(workspaceManager, req.params.id, projectPath)
      res.json(oc)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  router.put('/sessions/:id', async (req, res) => {
    const { name } = req.body
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' })
    }
    const db = initDb()
    await db
      .update(schema.sessions)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.sessions.id, req.params.id))
    res.json({ ok: true })
  })

  router.delete('/sessions/:id', async (req, res) => {
    const db = initDb()
    await db.delete(schema.messages).where(eq(schema.messages.sessionId, req.params.id))
    await db.delete(schema.sessions).where(eq(schema.sessions.id, req.params.id))
    clearOpenCodeMapping(req.params.id)
    res.json({ ok: true })
  })

  router.post('/sessions/:id/permission-response', (req, res) => {
    const { response, permissionId } = req.body
    if (!response || !['once', 'always', 'reject'].includes(response)) {
      return res.status(400).json({ error: 'response must be "once", "always", or "reject"' })
    }
    // Support both legacy (session-keyed) and new (permissionId-keyed) lookups
    let pending = pendingPermissions.get(req.params.id)
    if (!pending && permissionId) {
      pending = pendingPermissions.get(permissionId)
    }
    if (!pending) {
      return res.status(404).json({ error: 'No pending permission request' })
    }
    clearTimeout(pending.timeout)
    pendingPermissions.delete(req.params.id)
    pending.resolve(response as 'once' | 'always' | 'reject')
    res.json({ ok: true })
  })

  return router
}
