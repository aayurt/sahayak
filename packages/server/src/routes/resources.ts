import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'
import { execSync } from 'child_process'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import type { BackgroundProcessManager } from '../background-processes/manager'

export function resourcesRouter(bgProcessManager?: BackgroundProcessManager) {
  const router = Router()

  // List all resources
  router.get('/', (_req, res) => {
    const db = getDb()
    const list = db.select().from(schema.resources).all()
    res.json(list)
  })

  // Get a single resource
  router.get('/:id', (req, res) => {
    const db = getDb()
    const resource = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    if (!resource) return res.status(404).json({ error: 'Resource not found' })
    res.json(resource)
  })

  // Create a resource
  router.post('/', (req, res) => {
    const { name, type, path, host, port, username, authType, authData, permissions, gitEnabled } = req.body
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' })
    if (!['folder', 'ssh'].includes(type)) return res.status(400).json({ error: 'type must be folder or ssh' })
    if (type === 'folder' && !path) return res.status(400).json({ error: 'path is required for folder resources' })
    if (type === 'ssh' && !host) return res.status(400).json({ error: 'host is required for SSH resources' })

    const db = getDb()
    const now = new Date()
    const id = uuid()

    db.insert(schema.resources).values({
      id,
      name,
      type,
      path: path || null,
      host: host || null,
      port: port || null,
      username: username || null,
      authType: authType || null,
      authData: authData || null,
      permissions: permissions || 'read-only',
      rememberPerm: true,
      gitEnabled: gitEnabled !== false,
      graphifyState: 'none',
      graphifyOutPath: null,
      lastScannedAt: null,
      createdAt: now,
      updatedAt: now,
    }).run()

    const resource = db.select().from(schema.resources).where(eq(schema.resources.id, id)).get()
    res.json(resource)
  })

  // Update a resource
  router.put('/:id', (req, res) => {
    const db = getDb()
    const existing = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    if (!existing) return res.status(404).json({ error: 'Resource not found' })

    const { name, permissions, gitEnabled, rememberPerm } = req.body
    const now = new Date()

    db.update(schema.resources).set({
      ...(name !== undefined && { name }),
      ...(permissions !== undefined && { permissions }),
      ...(gitEnabled !== undefined && { gitEnabled }),
      ...(rememberPerm !== undefined && { rememberPerm }),
      updatedAt: now,
    }).where(eq(schema.resources.id, req.params.id)).run()

    const updated = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    res.json(updated)
  })

  // Delete a resource
  router.delete('/:id', (req, res) => {
    const db = getDb()
    const existing = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    if (!existing) return res.status(404).json({ error: 'Resource not found' })
    db.delete(schema.resources).where(eq(schema.resources.id, req.params.id)).run()
    res.json({ ok: true })
  })

  // Execute a command on SSH resource
  router.post('/:id/ssh/exec', async (req, res) => {
    const db = getDb()
    const resource = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    if (!resource) return res.status(404).json({ error: 'Resource not found' })
    if (resource.type !== 'ssh') return res.status(400).json({ error: 'Not an SSH resource' })

    const { command } = req.body
    if (!command) return res.status(400).json({ error: 'command is required' })

    try {
      const { connect } = await import('../services/ssh')
      const conn = await connect({
        host: resource.host!,
        port: resource.port || 22,
        username: resource.username || 'root',
        authType: resource.authType || 'key',
        authData: resource.authData || undefined,
      })
      const result = await conn.exec(command)
      conn.disconnect()
      res.json(result)
    } catch (err) {
      res.status(502).json({ error: (err as Error).message })
    }
  })

  // Test SSH connection
  router.post('/:id/ssh/test', async (req, res) => {
    const db = getDb()
    const resource = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    if (!resource) return res.status(404).json({ error: 'Resource not found' })
    if (resource.type !== 'ssh') return res.status(400).json({ error: 'Not an SSH resource' })

    try {
      const { connect } = await import('../services/ssh')
      const result = await connect({
        host: resource.host!,
        port: resource.port || 22,
        username: resource.username || 'root',
        authType: resource.authType || 'key',
        authData: resource.authData || undefined,
      })
      result.disconnect()
      res.json({ ok: true, host: resource.host })
    } catch (err) {
      res.status(502).json({ error: (err as Error).message })
    }
  })

  // ── Git Tree ──

  // Get git tree data for a folder resource
  router.get('/:id/git/tree', async (req, res) => {
    const db = getDb()
    const resource = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    if (!resource) return res.status(404).json({ error: 'Resource not found' })
    if (resource.type !== 'folder') return res.status(400).json({ error: 'Git tree only supports folder resources' })
    if (!resource.path) return res.status(400).json({ error: 'Resource has no path' })



    try {
      // Check if it's a git repo
      execSync('git rev-parse --git-dir', { cwd: resource.path, stdio: 'pipe' })
    } catch {
      return res.json({ isGitRepo: false, branches: [], commits: [] })
    }

    try {
      // Get branches
      const branchOutput = execSync('git branch -a', { cwd: resource.path, encoding: 'utf-8' })
      const branches = branchOutput.split('\n')
        .filter(Boolean)
        .map((b: string) => b.trim().replace(/^\* /, ''))
        .filter((b: string) => !b.includes('->')) // filter out remote HEAD refs

      // Get recent commits for each branch
      const branchCommits: Record<string, Array<{ hash: string; message: string; author: string; date: string }>> = {}
      for (const branch of branches) {
        try {
          const logOutput = execSync(`git log "${branch}" --oneline --format="%H|%s|%an|%ai" -20`, {
            cwd: resource.path, encoding: 'utf-8',
          })
          branchCommits[branch] = logOutput.split('\n')
            .filter(Boolean)
            .map((line: string) => {
              const [hash, ...rest] = line.split('|')
              return { hash: hash.slice(0, 7), fullHash: hash, message: rest.join('|'), author: rest[1] || '', date: rest[2] || '' }
            })
        } catch { /* branch may have been deleted between listing and logging */ }
      }

      res.json({ isGitRepo: true, branches, branchCommits })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ── Graphify ──

  // Start graphify on a folder resource
  router.post('/:id/graphify/start', async (req, res) => {
    if (!bgProcessManager) return res.status(500).json({ error: 'Background process manager not available' })

    const db = getDb()
    const resource = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    if (!resource) return res.status(404).json({ error: 'Resource not found' })
    if (resource.type !== 'folder') return res.status(400).json({ error: 'Graphify only supports folder resources' })
    if (!resource.path) return res.status(400).json({ error: 'Resource has no path' })

    // Update state to running
    db.update(schema.resources).set({
      graphifyState: 'running',
      updatedAt: new Date(),
    }).where(eq(schema.resources.id, req.params.id)).run()

    try {
      const graphifyBase = join(homedir(), '.sahayak', 'graphify', resource.id)
      if (!existsSync(graphifyBase)) mkdirSync(graphifyBase, { recursive: true })
      const outPath = join(graphifyBase, 'graphify-out')

      const bgProc = await bgProcessManager.create(
        `graphify: ${resource.name}`,
        `graphify "${resource.path}"`,
        graphifyBase,
      )

      // Poll for completion and update resource state
      const pollInterval = setInterval(() => {
        const proc = bgProcessManager.get(bgProc.id)
        if (!proc) {
          clearInterval(pollInterval)
          return
        }
        if (proc.process.status === 'stopped' && proc.process.exitCode === 0) {
          clearInterval(pollInterval)
          db.update(schema.resources).set({
            graphifyState: 'done',
            graphifyOutPath: outPath,
            lastScannedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(schema.resources.id, req.params.id)).run()
        } else if (proc.process.status === 'error' || (proc.process.status === 'stopped' && proc.process.exitCode !== 0)) {
          clearInterval(pollInterval)
          db.update(schema.resources).set({
            graphifyState: 'error',
            updatedAt: new Date(),
          }).where(eq(schema.resources.id, req.params.id)).run()
        }
      }, 2000)

      res.json({ processId: bgProc.id, graphifyState: 'running' })
    } catch (err) {
      db.update(schema.resources).set({
        graphifyState: 'error',
        updatedAt: new Date(),
      }).where(eq(schema.resources.id, req.params.id)).run()
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Stop graphify
  router.post('/:id/graphify/stop', async (req, res) => {
    const { processId } = req.body
    if (!processId) return res.status(400).json({ error: 'processId is required' })
    if (!bgProcessManager) return res.status(500).json({ error: 'Background process manager not available' })

    try {
      await bgProcessManager.stop(processId)

      const db = getDb()
      db.update(schema.resources).set({
        graphifyState: 'error',
        updatedAt: new Date(),
      }).where(eq(schema.resources.id, req.params.id)).run()

      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Get graphify status
  router.get('/:id/graphify/status', (req, res) => {
    const { processId } = req.query
    if (!processId || !bgProcessManager) {
      // Just return resource state
      const db = getDb()
      const resource = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
      if (!resource) return res.status(404).json({ error: 'Resource not found' })
      return res.json({ graphifyState: resource.graphifyState, graphifyOutPath: resource.graphifyOutPath })
    }

    try {
      const proc = bgProcessManager.get(processId as string)
      if (!proc) return res.status(404).json({ error: 'Process not found' })
      res.json({
        processId: proc.process.id,
        status: proc.process.status,
        exitCode: proc.process.exitCode,
        startedAt: proc.process.startedAt,
        stoppedAt: proc.process.stoppedAt,
      })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Get graphify output
  router.get('/:id/graphify/output', (req, res) => {
    const { processId } = req.query
    if (!processId || !bgProcessManager) return res.status(400).json({ error: 'processId is required' })
    try {
      const method = (req.query.method as 'full' | 'head' | 'tail' | 'grep') || 'tail'
      const pattern = req.query.pattern as string | undefined
      const lines = req.query.lines ? parseInt(req.query.lines as string, 10) : undefined
      const output = bgProcessManager.readOutput(processId as string, method, pattern, lines)
      res.json(output)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Serve graphify output files (report, graph.html, etc.)
  router.get('/:id/graphify/file/:filename', (req, res) => {
    const db = getDb()
    const resource = db.select().from(schema.resources).where(eq(schema.resources.id, req.params.id)).get()
    if (!resource) return res.status(404).json({ error: 'Resource not found' })
    if (!resource.graphifyOutPath) return res.status(400).json({ error: 'Graphify output not available' })

    const filePath = join(resource.graphifyOutPath, req.params.filename)
    // Basic path traversal protection
    if (!filePath.startsWith(resource.graphifyOutPath)) {
      return res.status(403).json({ error: 'access denied' })
    }
    try {
      const content = readFileSync(filePath, 'utf-8')
      const ext = req.params.filename.split('.').pop()?.toLowerCase()
      const mime: Record<string, string> = {
        md: 'text/markdown',
        html: 'text/html',
        json: 'application/json',
        svg: 'image/svg+xml',
      }
      res.type(mime[ext || ''] || 'text/plain').send(content)
    } catch {
      res.status(404).json({ error: 'File not found' })
    }
  })

  return router
}
