import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'

export { schema }

let db: ReturnType<typeof drizzle<typeof schema>> | null = null
let sqlite: Database.Database | null = null

export function getDb(dbPath?: string, existingSqlite?: Database.Database) {
  if (db && !existingSqlite) return db
  const resolvedPath = resolve(dbPath || process.env.SAHAYAK_DB_PATH || './data/sahayak.db')
  const dir = dirname(resolvedPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  sqlite = existingSqlite || new Database(resolvedPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  return db
}

export function closeDb() {
  sqlite?.close()
  db = null
  sqlite = null
}

/** Create all schema tables if they don't exist. Safe to call repeatedly. */
export function syncSchema() {
  if (!sqlite) return
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, project_id TEXT,
      model TEXT NOT NULL, system_prompt TEXT DEFAULT '',
      token_usage TEXT DEFAULT '{"prompt":0,"completion":0,"total":0}',
      worktree_path TEXT, open_code_session_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool_call','tool_result')),
      content TEXT NOT NULL, model TEXT NOT NULL, tokens INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      language TEXT DEFAULT 'unknown', last_indexed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY, skill_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
      input TEXT NOT NULL, output TEXT, tokens INTEGER DEFAULT 0,
      started_at INTEGER NOT NULL, completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS agent_memory (
      id TEXT PRIMARY KEY, key TEXT NOT NULL, value TEXT NOT NULL,
      metadata TEXT DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, expression TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('digest','agent','research','custom')),
      config TEXT DEFAULT '{}', enabled INTEGER DEFAULT 1,
      last_run INTEGER, next_run INTEGER
    );
    CREATE TABLE IF NOT EXISTS system_metrics (
      id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL,
      cpu REAL NOT NULL, ram_used INTEGER NOT NULL, ram_total INTEGER NOT NULL,
      disk_used INTEGER NOT NULL, disk_total INTEGER NOT NULL,
      network_rx INTEGER DEFAULT 0, network_tx INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      label TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
      target_id TEXT NOT NULL REFERENCES knowledge_nodes(id), relation TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS research_sessions (
      id TEXT PRIMARY KEY, query TEXT NOT NULL, result TEXT NOT NULL,
      sources TEXT DEFAULT '[]', screenshots TEXT DEFAULT '[]',
      tokens INTEGER DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
      system_prompt TEXT NOT NULL, model TEXT DEFAULT '',
      temperature REAL DEFAULT 0.7, max_tokens INTEGER DEFAULT 2048,
      enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sidecars (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, port INTEGER NOT NULL,
      base_path TEXT NOT NULL, prefix_mode TEXT DEFAULT 'preserve', enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('folder','ssh')),
      path TEXT, host TEXT, port INTEGER, username TEXT,
      auth_type TEXT, auth_data TEXT,
      permissions TEXT DEFAULT 'read-only' CHECK(permissions IN ('read-only','read-write')),
      remember_perm INTEGER DEFAULT 1, git_enabled INTEGER DEFAULT 1,
      graphify_state TEXT DEFAULT 'none' CHECK(graphify_state IN ('none','running','done','error')),
      graphify_out_path TEXT, last_scanned_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `)
  try { sqlite.exec(`ALTER TABLE sessions ADD COLUMN open_code_session_id TEXT`) } catch { /* column may already exist */ }
}

export function initDb(dbPath?: string) {
  const d = getDb(dbPath)
  syncSchema()
  return d
}
