import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'
import { DEFAULT_SKILLS_DIR } from '@sahayak/shared'
import { resolve } from 'path'

export function skillsRouter() {
  const router = Router()

  router.get('/', (_req, res) => {
    const db = getDb()
    const skills = db.select().from(schema.skills).all()
    res.json(skills)
  })

  router.get('/:id', (req, res) => {
    const db = getDb()
    const skill = db.select().from(schema.skills).where(eq(schema.skills.id, req.params.id)).get()
    if (!skill) return res.status(404).json({ error: 'Skill not found' })
    res.json(skill)
  })

  router.post('/', (req, res) => {
    const { name, description, systemPrompt, model, temperature, maxTokens } = req.body
    if (!name || !systemPrompt) {
      return res.status(400).json({ error: 'name and systemPrompt are required' })
    }
    const db = getDb()
    const id = uuid()
    const now = new Date()
    db.insert(schema.skills).values({
      id,
      name,
      description: description || '',
      systemPrompt,
      model: model || '',
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 2048,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }).run()
    const skill = db.select().from(schema.skills).where(eq(schema.skills.id, id)).get()
    res.json(skill)
  })

  router.put('/:id', (req, res) => {
    const { name, description, systemPrompt, model, temperature, maxTokens, enabled } = req.body
    const db = getDb()
    const existing = db.select().from(schema.skills).where(eq(schema.skills.id, req.params.id)).get()
    if (!existing) return res.status(404).json({ error: 'Skill not found' })
    db.update(schema.skills)
      .set({
        name: name ?? existing.name,
        description: description ?? existing.description,
        systemPrompt: systemPrompt ?? existing.systemPrompt,
        model: model ?? existing.model,
        temperature: temperature ?? existing.temperature,
        maxTokens: maxTokens ?? existing.maxTokens,
        enabled: enabled !== undefined ? enabled : existing.enabled,
        updatedAt: new Date(),
      })
      .where(eq(schema.skills.id, req.params.id))
      .run()
    const skill = db.select().from(schema.skills).where(eq(schema.skills.id, req.params.id)).get()
    res.json(skill)
  })

  router.delete('/:id', (req, res) => {
    const db = getDb()
    db.delete(schema.skills).where(eq(schema.skills.id, req.params.id)).run()
    res.json({ ok: true })
  })

  router.post('/sync', async (_req, res) => {
    const skillsDir = resolve(process.env.SAHAYAK_SKILLS_DIR || DEFAULT_SKILLS_DIR)
    const { syncAllSkills } = await import('../services/skills-watcher')
    syncAllSkills(skillsDir)
    const db = getDb()
    const skills = db.select().from(schema.skills).all()
    res.json({ synced: true, count: skills.length, skills })
  })

  return router
}
