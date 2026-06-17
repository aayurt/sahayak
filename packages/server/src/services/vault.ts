/**
 * Vault service — manages Obsidian-compatible markdown vault for long-term memory
 */

import { watch } from 'chokidar'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'fs'
import { join, extname, relative } from 'path'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq, and } from 'drizzle-orm'

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export interface VaultConfig {
  path: string
}

/** Auto-create vault directory if it doesn't exist */
export function ensureVaultDir(config: VaultConfig) {
  if (!existsSync(config.path)) {
    mkdirSync(config.path, { recursive: true })
    writeFileSync(
      join(config.path, '_index.md'),
      `# Sahayak Vault\n\nAuto-generated long-term memory vault.\n\n## Structure\n\n- \`daily/\` — Daily digests and summaries\n- \`agents/\` — Agent run reports\n- \`cron/\` — Cron job outputs\n- \`metrics/\` — System metrics snapshots\n- \`research/\` — Research session reports\n`,
    )
  }
  // Ensure subdirectories
  for (const sub of ['daily', 'agents', 'cron', 'metrics', 'research', 'chat-exports']) {
    const subPath = join(config.path, sub)
    if (!existsSync(subPath)) mkdirSync(subPath, { recursive: true })
  }
}

/** Write a markdown report to the vault */
export function writeVaultNote(
  config: VaultConfig,
  category: string,
  slug: string,
  title: string,
  body: string,
  tags: string[] = [],
): string {
  const filePath = join(config.path, category, `${slug}.md`)
  const date = new Date().toISOString().split('T')[0]
  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: ${date}`,
    tags.length ? `tags: [${tags.map((t) => `"${t}"`).join(', ')}]` : '',
    '---',
    '',
  ]
    .filter(Boolean)
    .join('\n')
  writeFileSync(filePath, frontmatter + body, 'utf-8')
  return filePath
}

/** Write an agent run report */
export function writeAgentReport(config: VaultConfig, run: {
  id: string
  skillName: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  tokens: number
  startedAt: Date
  completedAt: Date | null
}) {
  const title = `Agent Run: ${run.skillName}`
  const body = [
    `## Run ${run.id.slice(0, 8)}`,
    '',
    `- **Skill:** ${run.skillName}`,
    `- **Started:** ${run.startedAt.toISOString()}`,
    `- **Completed:** ${run.completedAt?.toISOString() || 'N/A'}`,
    `- **Tokens:** ${run.tokens}`,
    `- **Status:** ${run.output ? 'completed' : 'failed'}`,
    '',
    '### Input',
    '',
    '```json',
    JSON.stringify(run.input, null, 2),
    '```',
    '',
    '### Output',
    '',
    run.output
      ? (typeof run.output.result === 'string'
          ? run.output.result
          : '```json\n' + JSON.stringify(run.output, null, 2) + '\n```')
      : '*No output*',
    '',
    `---`,
    `[[daily/${new Date().toISOString().split('T')[0]}]]`,
  ].join('\n')
  return writeVaultNote(config, 'agents', run.id.slice(0, 12), title, body, [
    'agent-run',
    run.skillName.toLowerCase().replace(/\s+/g, '-'),
  ])
}

/** Save a chat message export to the vault and index it */
export function saveChatVaultNote(config: VaultConfig, content: string, title: string): string {
  const slug = `chat-${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`
  const filePath = writeVaultNote(config, 'chat-exports', slug, title, content, ['chat-export'])
  indexVaultFile(config, filePath)
  return filePath
}

/** Write a daily digest to the vault */
export function writeDailyDigest(
  config: VaultConfig,
  content: string,
  metrics?: { cpu: number; ramUsed: number; ramTotal: number },
) {
  const date = new Date().toISOString().split('T')[0]
  const title = `Daily Digest — ${date}`
  const body = [
    `## ${title}`,
    '',
    content,
    '',
    metrics
      ? [
          '### System Snapshot',
          '',
          `- CPU: ${metrics.cpu.toFixed(1)}%`,
          `- RAM: ${(metrics.ramUsed / 1024 / 1024 / 1024).toFixed(1)}GB / ${(metrics.ramTotal / 1024 / 1024 / 1024).toFixed(1)}GB`,
        ].join('\n')
      : '',
    '',
    '---',
    'Tags: #daily-digest',
  ].join('\n')
  return writeVaultNote(config, 'daily', date, title, body, ['daily-digest'])
}

/** Extract wikilinks from markdown content */
export function extractWikilinks(content: string): Array<{ target: string; alias?: string }> {
  const links: Array<{ target: string; alias?: string }> = []
  let match: RegExpExecArray | null
  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    links.push({ target: match[1].trim(), alias: match[2]?.trim() })
  }
  return links
}

/** Index a vault MD file into the knowledge graph */
export function indexVaultFile(config: VaultConfig, filePath: string) {
  const db = getDb()
  const content = readFileSync(filePath, 'utf-8')
  const relativePath = relative(config.path, filePath)
  const label = relativePath.replace(/\.md$/, '').replace(/\//g, '/')
  const type = 'vault-note'

  // Upsert node
  const existing = db
    .select()
    .from(schema.knowledgeNodes)
    .where(
      and(
        eq(schema.knowledgeNodes.projectId, 'vault'),
        eq(schema.knowledgeNodes.label, label),
      ),
    )
    .get()

  const now = new Date()
  if (existing) {
    db.update(schema.knowledgeNodes)
      .set({ content, metadata: { path: relativePath }, updatedAt: now })
      .where(eq(schema.knowledgeNodes.id, existing.id))
      .run()
  } else {
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, 'vault'))
      .get()
    if (!project) {
      db.insert(schema.projects)
        .values({
          id: 'vault',
          path: config.path,
          name: 'Vault',
          language: 'markdown',
          lastIndexedAt: now,
        })
        .run()
    }

    db.insert(schema.knowledgeNodes)
      .values({
        id: uuid(),
        projectId: 'vault',
        label,
        type,
        content,
        metadata: { path: relativePath },
        createdAt: now,
      })
      .run()
  }

  // Create edges from wikilinks
  const links = extractWikilinks(content)
  const sourceNode = db
    .select()
    .from(schema.knowledgeNodes)
    .where(
      and(
        eq(schema.knowledgeNodes.projectId, 'vault'),
        eq(schema.knowledgeNodes.label, label),
      ),
    )
    .get()

  if (sourceNode) {
    for (const link of links) {
      const target = link.target.replace(/\.md$/, '')
      const targetNode = db
        .select()
        .from(schema.knowledgeNodes)
        .where(
          and(
            eq(schema.knowledgeNodes.projectId, 'vault'),
            eq(schema.knowledgeNodes.label, target),
          ),
        )
        .get()
      if (targetNode) {
        const existingEdge = db
          .select()
          .from(schema.knowledgeEdges)
          .where(
            and(
              eq(schema.knowledgeEdges.sourceId, sourceNode.id),
              eq(schema.knowledgeEdges.targetId, targetNode.id),
            ),
          )
          .get()
        if (!existingEdge) {
          db.insert(schema.knowledgeEdges)
            .values({
              id: uuid(),
              sourceId: sourceNode.id,
              targetId: targetNode.id,
              relation: 'wikilink',
            })
            .run()
        }
      }
    }
  }
}

/** Scan all existing vault files and index them */
export function indexAllVaultFiles(config: VaultConfig) {
  if (!existsSync(config.path)) return
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(fullPath)
      } else if (entry.isFile() && extname(entry.name) === '.md') {
        try {
          indexVaultFile(config, fullPath)
        } catch (e) {
          console.error(`[vault] failed to index ${fullPath}:`, e)
        }
      }
    }
  }
  walk(config.path)
}

/** Watch vault for changes and index automatically */
export function watchVault(config: VaultConfig) {
  indexAllVaultFiles(config)
  const watcher = watch(join(config.path, '**', '*.md'), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
  })
  watcher.on('add', (path) => indexVaultFile(config, path))
  watcher.on('change', (path) => indexVaultFile(config, path))
  watcher.on('unlink', () => {
    // TODO: remove node + edges on file delete
  })
  return watcher
}
