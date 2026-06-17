import { Router } from 'express'
import { initDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'

export function settingsRouter() {
  const router = Router()

  router.get('/', async (_req, res) => {
    const db = initDb()
    const all = await db.select().from(schema.settings)
    const result: Record<string, unknown> = {}
    for (const s of all) {
      result[s.key] = s.value
    }
    res.json(result)
  })

  router.put('/', async (req, res) => {
    const db = initDb()
    for (const [key, value] of Object.entries(req.body)) {
      await db
        .insert(schema.settings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value, updatedAt: new Date() },
        })
    }
    res.json({ ok: true })
  })

  return router
}
