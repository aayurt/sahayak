/**
 * Vault route — browse, read, and manage vault notes
 */

import { Router } from 'express'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname, relative } from 'path'
import { homedir } from 'os'
import { resolve } from 'path'
import { DEFAULT_VAULT_PATH } from '@sahayak/shared'
import { ensureVaultDir, extractWikilinks, saveChatVaultNote } from '../services/vault'

function getVaultPath(): string {
  const raw = process.env.SAHAYAK_VAULT_PATH || DEFAULT_VAULT_PATH
  return resolve(raw.replace(/^~/, homedir()))
}

function walkDir(dir: string, baseDir: string): any[] {
  const entries: any[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        entries.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          relativePath: relative(baseDir, fullPath),
          children: walkDir(fullPath, baseDir),
        })
      } else if (extname(entry.name) === '.md') {
        const stats = statSync(fullPath)
        entries.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
          relativePath: relative(baseDir, fullPath),
          size: stats.size,
          modifiedAt: stats.mtime,
        })
      }
    }
  } catch { /* ignore */ }
  return entries
}

export function vaultRouter() {
  const router = Router()

  router.get('/', (_req, res) => {
    const vaultPath = getVaultPath()
    const tree = walkDir(vaultPath, vaultPath)
    res.json({ path: vaultPath, tree })
  })

  router.get('/read', (req, res) => {
    const vaultPath = getVaultPath()
    const filePath = req.query.path as string
    if (!filePath) return res.status(400).json({ error: 'path query param required' })
    // Basic path traversal protection
    const resolved = resolve(vaultPath, filePath)
    if (!resolved.startsWith(vaultPath)) {
      return res.status(403).json({ error: 'access denied' })
    }
    try {
      const content = readFileSync(resolved, 'utf-8')
      const stats = statSync(resolved)
      res.json({ content, modifiedAt: stats.mtime, path: filePath })
    } catch (e) {
      res.status(404).json({ error: 'file not found' })
    }
  })

  router.get('/links', (_req, res) => {
    const vaultPath = getVaultPath()
    const links: Array<{ source: string; target: string }> = []
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) walk(fullPath)
        else if (extname(entry.name) === '.md') {
          const content = readFileSync(fullPath, 'utf-8')
          const extracted = extractWikilinks(content)
          const relPath = relative(vaultPath, fullPath)
          for (const link of extracted) {
            links.push({ source: relPath, target: link.target })
          }
        }
      }
    }
    walk(vaultPath)
    res.json(links)
  })

  router.post('/save', (req, res) => {
    const { content, title } = req.body as { content: string; title?: string }
    if (!content) return res.status(400).json({ error: 'content is required' })

    const vaultPath = getVaultPath()
    const config = { path: vaultPath }
    ensureVaultDir(config)
    const finalTitle = title || `Chat Export — ${new Date().toISOString().split('T')[0]}`
    const filePath = saveChatVaultNote(config, content, finalTitle)
    res.json({ path: filePath })
  })

  return router
}
