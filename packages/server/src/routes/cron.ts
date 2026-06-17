import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'
import { scheduleJob, unscheduleJob, reloadJob } from '../cron'

export function cronRouter() {
  const router = Router()

  router.get('/', (_req, res) => {
    const db = getDb()
    const jobs = db.select().from(schema.cronJobs).all()
    res.json(jobs)
  })

  router.post('/', (req, res) => {
    const { name, expression, action, config } = req.body
    if (!name || !expression || !action) {
      return res.status(400).json({ error: 'name, expression, and action are required' })
    }
    const db = getDb()
    const id = uuid()
    db.insert(schema.cronJobs).values({
      id,
      name,
      expression,
      action,
      config: (config || {}) as any,
      enabled: true,
      lastRun: null,
      nextRun: null,
    }).run()
    const job = db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, id)).get()!
    if (job.enabled) scheduleJob(job as any)
    res.json(job)
  })

  router.put('/:id', (req, res) => {
    const { name, expression, action, config, enabled } = req.body
    const db = getDb()
    const existing = db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, req.params.id)).get()
    if (!existing) return res.status(404).json({ error: 'Cron job not found' })
    db.update(schema.cronJobs)
      .set({
        name: name ?? existing.name,
        expression: expression ?? existing.expression,
        action: action ?? existing.action,
        config: config !== undefined ? (config as any) : existing.config,
        enabled: enabled !== undefined ? enabled : existing.enabled,
      })
      .where(eq(schema.cronJobs.id, req.params.id))
      .run()
    const job = db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, req.params.id)).get()!
    reloadJob(job as any)
    res.json(job)
  })

  router.delete('/:id', (req, res) => {
    unscheduleJob(req.params.id)
    const db = getDb()
    db.delete(schema.cronJobs).where(eq(schema.cronJobs.id, req.params.id)).run()
    res.json({ ok: true })
  })

  router.post('/:id/toggle', (req, res) => {
    const db = getDb()
    const job = db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, req.params.id)).get()
    if (!job) return res.status(404).json({ error: 'Cron job not found' })
    const newEnabled = !job.enabled
    db.update(schema.cronJobs)
      .set({ enabled: newEnabled })
      .where(eq(schema.cronJobs.id, req.params.id))
      .run()
    const updated = db.select().from(schema.cronJobs).where(eq(schema.cronJobs.id, req.params.id)).get()!
    reloadJob(updated as any)
    res.json(updated)
  })

  return router
}
