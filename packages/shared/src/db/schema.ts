import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool_call', 'tool_result'] }).notNull(),
  content: text('content').notNull(),
  model: text('model').notNull(),
  tokens: integer('tokens').default(0),
  metadata: text('metadata', { mode: 'json' }).default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  projectId: text('project_id').references(() => projects.id),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt').default(''),
  tokenUsage: text('token_usage', { mode: 'json' }).default('{"prompt":0,"completion":0,"total":0}'),
  worktreePath: text('worktree_path'),
  openCodeSessionId: text('open_code_session_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull(),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
  input: text('input', { mode: 'json' }).notNull(),
  output: text('output', { mode: 'json' }),
  tokens: integer('tokens').default(0),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

export const agentMemory = sqliteTable('agent_memory', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  metadata: text('metadata', { mode: 'json' }).default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const cronJobs = sqliteTable('cron_jobs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  expression: text('expression').notNull(),
  action: text('action', { enum: ['digest', 'agent', 'research', 'custom'] }).notNull(),
  config: text('config', { mode: 'json' }).default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  lastRun: integer('last_run', { mode: 'timestamp' }),
  nextRun: integer('next_run', { mode: 'timestamp' }),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  name: text('name').notNull(),
  language: text('language').default('unknown'),
  lastIndexedAt: integer('last_indexed_at', { mode: 'timestamp' }),
})

export const knowledgeNodes = sqliteTable('knowledge_nodes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  label: text('label').notNull(),
  type: text('type').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata', { mode: 'json' }).default('{}'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const knowledgeEdges = sqliteTable('knowledge_edges', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => knowledgeNodes.id),
  targetId: text('target_id').notNull().references(() => knowledgeNodes.id),
  relation: text('relation').notNull(),
})

export const systemMetrics = sqliteTable('system_metrics', {
  id: text('id').primaryKey(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  cpu: real('cpu').notNull(),
  ramUsed: integer('ram_used').notNull(),
  ramTotal: integer('ram_total').notNull(),
  diskUsed: integer('disk_used').notNull(),
  diskTotal: integer('disk_total').notNull(),
  networkRx: integer('network_rx').default(0),
  networkTx: integer('network_tx').default(0),
})

export const researchSessions = sqliteTable('research_sessions', {
  id: text('id').primaryKey(),
  query: text('query').notNull(),
  result: text('result').notNull(),
  sources: text('sources', { mode: 'json' }).default('[]'),
  screenshots: text('screenshots', { mode: 'json' }).default('[]'),
  tokens: integer('tokens').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').default(''),
  temperature: real('temperature').default(0.7),
  maxTokens: integer('max_tokens').default(2048),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const resources = sqliteTable('resources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['folder', 'ssh'] }).notNull(),
  path: text('path'),
  host: text('host'),
  port: integer('port'),
  username: text('username'),
  authType: text('auth_type'),
  authData: text('auth_data'),
  permissions: text('permissions', { enum: ['read-only', 'read-write'] }).default('read-only'),
  rememberPerm: integer('remember_perm', { mode: 'boolean' }).default(true),
  gitEnabled: integer('git_enabled', { mode: 'boolean' }).default(true),
  graphifyState: text('graphify_state', { enum: ['none', 'running', 'done', 'error'] }).default('none'),
  graphifyOutPath: text('graphify_out_path'),
  lastScannedAt: integer('last_scanned_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const sidecars = sqliteTable('sidecars', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  port: integer('port').notNull(),
  basePath: text('base_path').notNull(),
  prefixMode: text('prefix_mode', { enum: ['preserve', 'strip'] }).default('preserve'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
})
