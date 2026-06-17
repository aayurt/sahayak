import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { getDb, initDb, schema } from '@sahayak/shared/db'
import { v4 as uuid } from 'uuid'

vi.mock('./localai', () => ({
  createLocalAIClient: () => ({
    chatStream: vi.fn(async function* () {
      yield 'Hello '
      yield 'world!'
    }),
  }),
}))

import { executeSkill, listAgentRuns, getAgentRun, listAgentMemory } from './agent'

describe('agent service', () => {
  let skillId: string

  beforeAll(() => {
    process.env.SAHAYAK_DB_PATH = ':memory:'
    initDb()
  })

  beforeEach(() => {
    const db = getDb()
    skillId = uuid()
    const now = new Date()
    db.insert(schema.skills).values({
      id: skillId,
      name: 'test-skill',
      description: 'A test skill',
      systemPrompt: 'You are helpful',
      model: '',
      temperature: 0.7,
      maxTokens: 2048,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }).run()
  })

  it('should execute a skill and stream output', async () => {
    const { runId, stream, skill } = executeSkill(skillId, { prompt: 'test' })
    expect(skill.name).toBe('test-skill')
    expect(runId).toBeDefined()

    let full = ''
    for await (const chunk of stream()) {
      full += chunk
    }
    expect(full).toBe('Hello world!')

    // Check the run was saved
    const run = getAgentRun(runId)
    expect(run).toBeDefined()
    expect(run!.status).toBe('completed')
    expect((run!.output as any).content).toBe('Hello world!')
  })

  it('should throw for non-existent skill', () => {
    expect(() => executeSkill('bad-id', {})).toThrow('Skill not found')
  })

  it('should throw for disabled skill', () => {
    const db = getDb()
    const disabledId = uuid()
    db.insert(schema.skills).values({
      id: disabledId,
      name: 'disabled',
      description: '',
      systemPrompt: 'test',
      model: '',
      temperature: 0.7,
      maxTokens: 2048,
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run()
    expect(() => executeSkill(disabledId, {})).toThrow('Skill is disabled')
  })

  it('should list agent runs', () => {
    const runs = listAgentRuns()
    expect(Array.isArray(runs)).toBe(true)
    expect(runs.length).toBeGreaterThan(0)
  })

  it('should list agent memory', () => {
    const memory = listAgentMemory()
    expect(Array.isArray(memory)).toBe(true)
  })
})
