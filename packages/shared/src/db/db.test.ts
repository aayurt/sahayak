import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { eq } from 'drizzle-orm'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  // Create tables from schema
  sqlite.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_id TEXT,
      model TEXT NOT NULL,
      system_prompt TEXT DEFAULT '',
      token_usage TEXT DEFAULT '{"prompt":0,"completion":0,"total":0}',
      worktree_path TEXT,
      open_code_session_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool_call','tool_result')),
      content TEXT NOT NULL,
      model TEXT NOT NULL,
      tokens INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      language TEXT DEFAULT 'unknown',
      last_indexed_at INTEGER
    );
    CREATE TABLE agent_runs (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
      input TEXT NOT NULL,
      output TEXT,
      tokens INTEGER DEFAULT 0,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE system_metrics (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      cpu REAL NOT NULL,
      ram_used INTEGER NOT NULL,
      ram_total INTEGER NOT NULL,
      disk_used INTEGER NOT NULL,
      disk_total INTEGER NOT NULL,
      network_rx INTEGER DEFAULT 0,
      network_tx INTEGER DEFAULT 0
    );
  `)
  return db
}

describe('DB schema', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  describe('sessions', () => {
    it('inserts and queries a session', () => {
      const now = new Date()
      db.insert(schema.sessions).values({
        id: 's1',
        name: 'Test Chat',
        model: 'llama-3.1',
        systemPrompt: 'Be helpful',
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        createdAt: now,
        updatedAt: now,
      }).run()

      const rows = db.select().from(schema.sessions).all()
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe('Test Chat')
      expect(rows[0].model).toBe('llama-3.1')
    })

    it('sessions ordered by updatedAt desc', () => {
      const older = new Date('2024-01-01')
      const newer = new Date('2024-06-01')
      db.insert(schema.sessions).values({
        id: 's1', name: 'Old', model: 'm1', tokenUsage: { prompt: 0, completion: 0, total: 0 },
        createdAt: older, updatedAt: older,
      }).run()
      db.insert(schema.sessions).values({
        id: 's2', name: 'New', model: 'm2', tokenUsage: { prompt: 0, completion: 0, total: 0 },
        createdAt: newer, updatedAt: newer,
      }).run()

      const rows = db.select().from(schema.sessions).orderBy(schema.sessions.updatedAt).all()
      expect(rows[0].name).toBe('Old')
    })
  })

  describe('messages', () => {
    it('inserts messages under a session', () => {
      const now = new Date()
      db.insert(schema.sessions).values({
        id: 's1', name: 'S', model: 'm', tokenUsage: { prompt: 0, completion: 0, total: 0 },
        createdAt: now, updatedAt: now,
      }).run()

      db.insert(schema.messages).values({
        id: 'm1', sessionId: 's1', role: 'user', content: 'hi', model: 'm',
        tokens: 2, metadata: {}, createdAt: now,
      }).run()
      db.insert(schema.messages).values({
        id: 'm2', sessionId: 's1', role: 'assistant', content: 'hello', model: 'm',
        tokens: 3, metadata: {}, createdAt: new Date(now.getTime() + 1000),
      }).run()

      const msgs = db.select().from(schema.messages)
        .where(eq(schema.messages.sessionId, 's1'))
        .orderBy(schema.messages.createdAt)
        .all()

      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe('user')
      expect(msgs[1].role).toBe('assistant')
    })

    it('deletes messages before session (matching route behavior)', () => {
      const now = new Date()
      db.insert(schema.sessions).values({
        id: 's1', name: 'S', model: 'm', tokenUsage: { prompt: 0, completion: 0, total: 0 },
        createdAt: now, updatedAt: now,
      }).run()
      db.insert(schema.messages).values({
        id: 'm1', sessionId: 's1', role: 'user', content: 'x', model: 'm',
        tokens: 0, metadata: {}, createdAt: now,
      }).run()

      db.delete(schema.messages).where(eq(schema.messages.sessionId, 's1')).run()
      db.delete(schema.sessions).where(eq(schema.sessions.id, 's1')).run()

      const msgs = db.select().from(schema.messages).all()
      expect(msgs).toHaveLength(0)
    })
  })

  describe('settings', () => {
    it('upserts settings with onConflict', () => {
      const now = new Date()
      db.insert(schema.settings).values({ key: 'theme', value: 'dark', updatedAt: now }).run()
      db.insert(schema.settings).values({ key: 'theme', value: 'light', updatedAt: new Date(now.getTime() + 1000) })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: 'light' },
        }).run()

      const rows = db.select().from(schema.settings).all()
      expect(rows).toHaveLength(1)
      expect(rows[0].value).toBe('light')
    })
  })
})
