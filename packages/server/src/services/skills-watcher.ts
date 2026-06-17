/**
 * Skills file watcher — syncs skill.md files from filesystem to DB
 */

import { watch } from 'chokidar'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, basename, dirname } from 'path'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'

interface SkillMd {
  name: string
  description: string
  model: string
  temperature: number
  maxTokens: number
  enabled: boolean
  systemPrompt: string
}

function parseSkillMd(filePath: string): SkillMd | null {
  const content = readFileSync(filePath, 'utf-8')
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) return null
  const frontmatter: Record<string, unknown> = {}
  for (const line of fmMatch[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: unknown = line.slice(colonIdx + 1).trim()
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (!isNaN(Number(value))) value = Number(value)
    frontmatter[key] = value
  }
  const body = fmMatch[2].trim()
  return {
    name: (frontmatter.name as string) || basename(dirname(filePath)),
    description: (frontmatter.description as string) || '',
    model: (frontmatter.model as string) || '',
    temperature: (frontmatter.temperature as number) ?? 0.7,
    maxTokens: (frontmatter.maxTokens as number) ?? 2048,
    enabled: frontmatter.enabled !== false,
    systemPrompt: body,
  }
}

function upsertSkill(data: SkillMd) {
  const db = getDb()
  const existing = db
    .select()
    .from(schema.skills)
    .where(eq(schema.skills.name, data.name))
    .get()
  const now = new Date()
  if (existing) {
    db.update(schema.skills)
      .set({
        description: data.description,
        systemPrompt: data.systemPrompt,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        enabled: data.enabled,
        updatedAt: now,
      })
      .where(eq(schema.skills.id, existing.id))
      .run()
  } else {
    db.insert(schema.skills)
      .values({
        id: uuid(),
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        enabled: data.enabled,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }
}

export function syncAllSkills(skillsDir: string) {
  if (!existsSync(skillsDir)) return
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const skillPath = join(skillsDir, entry.name, 'skill.md')
      if (existsSync(skillPath)) {
        const parsed = parseSkillMd(skillPath)
        if (parsed) upsertSkill(parsed)
      }
    }
  }
}

export function watchSkills(skillsDir: string) {
  syncAllSkills(skillsDir)
  const watcher = watch(join(skillsDir, '**', 'skill.md'), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  })
  watcher.on('add', (path) => {
    const parsed = parseSkillMd(path)
    if (parsed) upsertSkill(parsed)
  })
  watcher.on('change', (path) => {
    const parsed = parseSkillMd(path)
    if (parsed) upsertSkill(parsed)
  })
  watcher.on('unlink', (path) => {
    // We don't auto-delete skills from DB on file delete — user may want to re-create
  })
  return watcher
}
