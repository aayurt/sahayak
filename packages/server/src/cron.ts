import * as cron from 'node-cron'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'
import { executeSkill } from './agent'

interface ScheduledTask {
  jobId: string
  task: cron.ScheduledTask
}

const scheduled = new Map<string, ScheduledTask>()

export function loadCronJobs() {
  const db = getDb()
  const jobs = db.select().from(schema.cronJobs).where(eq(schema.cronJobs.enabled, true)).all()
  for (const job of jobs) {
    scheduleJob(job)
  }
  console.log(`[cron] loaded ${jobs.length} jobs`)
}

export function scheduleJob(job: {
  id: string
  expression: string
  action: string
  config: Record<string, unknown>
}) {
  if (!cron.validate(job.expression)) {
    console.error(`[cron] invalid expression "${job.expression}" for job ${job.id}`)
    return
  }

  const task = cron.schedule(job.expression, async () => {
    console.log(`[cron] running job ${job.id}`)

    const db = getDb()
    db.update(schema.cronJobs)
      .set({ lastRun: new Date() })
      .where(eq(schema.cronJobs.id, job.id))
      .run()

    if (job.action === 'agent') {
      const skillId = (job.config as any).skillId
      if (skillId) {
        try {
          const { stream } = executeSkill(skillId, (job.config as any).input || {})
          for await (const _ of stream()) { /* consume */ }
          console.log(`[cron] job ${job.id} completed`)
        } catch (err) {
          console.error(`[cron] job ${job.id} failed:`, err)
        }
      }
    }
  })

  scheduled.set(job.id, { jobId: job.id, task })
  updateNextRun(job.id)
}

function updateNextRun(jobId: string) {
  const task = scheduled.get(jobId)
  if (!task) return
  const now = new Date()
  const nextMinute = new Date(now.getTime() + 60000)
  const db = getDb()
  db.update(schema.cronJobs)
    .set({ nextRun: nextMinute })
    .where(eq(schema.cronJobs.id, jobId))
    .run()
}

export function unscheduleJob(jobId: string) {
  const existing = scheduled.get(jobId)
  if (existing) {
    existing.task.stop()
    scheduled.delete(jobId)
  }
}

export function reloadJob(job: {
  id: string
  expression: string
  action: string
  config: Record<string, unknown>
  enabled: boolean
}) {
  unscheduleJob(job.id)
  if (job.enabled) {
    scheduleJob(job)
  }
}

export function stopAllJobs() {
  for (const [, s] of scheduled) {
    s.task.stop()
  }
  scheduled.clear()
}
