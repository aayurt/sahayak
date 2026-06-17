import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq, desc } from 'drizzle-orm'
import { createLocalAIClient } from './localai'
import { DEFAULT_VAULT_PATH } from '@sahayak/shared'
import { resolve } from 'path'
import { homedir } from 'os'
import { writeAgentReport } from './services/vault'

export function executeSkill(skillId: string, input: Record<string, unknown>) {
  const db = getDb()
  const skill = db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).get()
  if (!skill) throw new Error('Skill not found')
  if (!skill.enabled) throw new Error('Skill is disabled')

  const runId = uuid()
  const now = new Date()
  db.insert(schema.agentRuns).values({
    id: runId,
    skillId,
    status: 'running',
    input: input as any,
    output: null,
    tokens: 0,
    startedAt: now,
    completedAt: null,
  }).run()

  const client = createLocalAIClient()
  const model = skill.model || undefined
  const messages = [
    { role: 'system' as const, content: skill.systemPrompt },
    { role: 'user' as const, content: JSON.stringify(input) },
  ]

  let fullContent = ''

  async function* stream(): AsyncGenerator<string> {
    try {
      const gen = client.chatStream({ model: model || '', messages, temperature: skill.temperature })
      for await (const chunk of gen) {
        fullContent += chunk
        yield chunk
      }
      const tokens = estimateTokens(fullContent)
      const completedAt = new Date()
      db.update(schema.agentRuns)
        .set({
          status: 'completed',
          output: { content: fullContent } as any,
          tokens,
          completedAt,
        })
        .where(eq(schema.agentRuns.id, runId))
        .run()
      await saveToMemory(skill.name, fullContent, input)
      await writeVaultReport({ id: runId, skillName: skill.name, input, output: { content: fullContent }, tokens, startedAt: now, completedAt })
    } catch (err) {
      db.update(schema.agentRuns)
        .set({
          status: 'failed',
          output: { error: (err as Error).message } as any,
          completedAt: new Date(),
        })
        .where(eq(schema.agentRuns.id, runId))
        .run()
      throw err
    }
  }

  return { runId, stream, skill }
}

async function saveToMemory(skillName: string, content: string, input: Record<string, unknown>) {
  const db = getDb()
  const memoryId = uuid()
  const now = new Date()
  db.insert(schema.agentMemory).values({
    id: memoryId,
    key: `skill:${skillName}:${now.toISOString().slice(0, 10)}`,
    value: content.slice(0, 2000),
    metadata: { skillName, inputKeys: Object.keys(input), timestamp: now.toISOString() } as any,
    createdAt: now,
  }).run()
}

async function writeVaultReport(run: {
  id: string
  skillName: string
  input: Record<string, unknown>
  output: { content: string } | { error: string } | null
  tokens: number
  startedAt: Date
  completedAt: Date | null
}) {
  try {
    const vaultPath = resolve(
      (process.env.SAHAYAK_VAULT_PATH || DEFAULT_VAULT_PATH).replace(/^~/, homedir()),
    )
    writeAgentReport({ path: vaultPath }, {
      id: run.id,
      skillName: run.skillName,
      input: run.input,
      output: 'content' in run.output! ? { result: (run.output as any).content } : null,
      tokens: run.tokens,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    })
  } catch (e) {
    console.warn('[agent] failed to write vault report:', (e as Error).message)
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function listAgentRuns(limit = 20) {
  const db = getDb()
  return db.select().from(schema.agentRuns).orderBy(desc(schema.agentRuns.startedAt)).limit(limit).all()
}

export function getAgentRun(id: string) {
  const db = getDb()
  return db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, id)).get() || null
}

export function listAgentMemory(limit = 50) {
  const db = getDb()
  return db.select().from(schema.agentMemory).orderBy(desc(schema.agentMemory.createdAt)).limit(limit).all()
}
