import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { validate, validateQuery } from '../validation'
import {
  isGitAvailable, resolveRepoRoot, listWorktrees, createManagedWorktree, removeWorktree,
  getWorktreeGitStatus, getWorktreeGitDiff, stageWorktreePaths, unstageWorktreePaths, commitWorktreeChanges,
} from '../services/git-worktrees'

const WorktreeCreateSchema = z.object({
  slug: z.string().trim().min(1),
  branch: z.string().trim().min(1).optional(),
})

const WorktreeGitDiffQuerySchema = z.object({
  path: z.string().trim().min(1),
  originalPath: z.string().optional(),
  scope: z.enum(['staged', 'unstaged']),
})

const WorktreeGitPathsSchema = z.object({
  paths: z.array(z.string().trim().min(1)).min(1),
})

const WorktreeGitCommitSchema = z.object({
  message: z.string().trim().min(1),
})

const ForceQuerySchema = z.object({
  force: z.coerce.boolean().optional(),
})

export function worktreeRouter(): Router {
  const router = Router()

  // GET /api/worktrees — list worktrees for a repo path
  router.get('/api/worktrees', async (req: Request, res: Response) => {
    const folder = (req.query.folder as string) || process.cwd()
    try {
      const gitAvail = await isGitAvailable()
      if (!gitAvail) {
        res.status(503).json({ error: 'Git is not installed or not available in PATH' })
        return
      }
      const { repoRoot, isGitRepo } = await resolveRepoRoot(folder)
      const worktrees = await listWorktrees({ repoRoot, workspaceFolder: folder })
      res.json({ worktrees, isGitRepo })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to list worktrees' })
    }
  })

  // POST /api/worktrees — create a new worktree
  router.post('/api/worktrees', validate(WorktreeCreateSchema), async (req: Request, res: Response) => {
    const folder = (req.query.folder as string) || process.cwd()
    try {
      const gitAvail = await isGitAvailable()
      if (!gitAvail) { res.status(503).json({ error: 'Git is not installed' }); return }
      const { repoRoot, isGitRepo } = await resolveRepoRoot(folder)
      if (!isGitRepo) { res.status(400).json({ error: 'Not a Git repository' }); return }
      const created = await createManagedWorktree({ repoRoot, workspaceFolder: folder, slug: req.body.slug })
      res.status(201).json(created)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create worktree' })
    }
  })

  // DELETE /api/worktrees/:slug — remove a worktree
  router.delete('/api/worktrees/:slug', validateQuery(ForceQuerySchema), async (req: Request, res: Response) => {
    const folder = (req.query.folder as string) || process.cwd()
    const slug = req.params.slug
    try {
      const gitAvail = await isGitAvailable()
      if (!gitAvail) { res.status(503).json({ error: 'Git is not installed' }); return }
      const { repoRoot, isGitRepo } = await resolveRepoRoot(folder)
      if (!isGitRepo) { res.status(400).json({ error: 'Not a Git repository' }); return }
      const worktrees = await listWorktrees({ repoRoot, workspaceFolder: folder })
      const match = worktrees.find((wt) => wt.slug === slug)
      if (!match || match.kind === 'root') { res.status(404).json({ error: 'Worktree not found' }); return }
      await removeWorktree({ workspaceFolder: folder, directory: match.directory, force: req.query.force === 'true' })
      res.status(204).end()
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to remove worktree' })
    }
  })

  // GET /api/worktrees/:slug/status — git status
  router.get('/api/worktrees/:slug/status', async (req: Request, res: Response) => {
    const folder = (req.query.folder as string) || process.cwd()
    try {
      const status = await getWorktreeGitStatus(folder)
      res.json(status)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to get git status' })
    }
  })

  // GET /api/worktrees/:slug/diff — git diff
  router.get('/api/worktrees/:slug/diff', validateQuery(WorktreeGitDiffQuerySchema), async (req: Request, res: Response) => {
    const folder = (req.query.folder as string) || process.cwd()
    try {
      const diff = await getWorktreeGitDiff({
        workspaceFolder: folder,
        path: req.query.path as string,
        originalPath: (req.query.originalPath as string) ?? null,
        scope: req.query.scope as 'staged' | 'unstaged',
      })
      res.json(diff)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to get git diff' })
    }
  })

  // POST /api/worktrees/:slug/stage
  router.post('/api/worktrees/:slug/stage', validate(WorktreeGitPathsSchema), async (req: Request, res: Response) => {
    const folder = (req.query.folder as string) || process.cwd()
    try {
      await stageWorktreePaths({ workspaceFolder: folder, paths: req.body.paths })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to stage files' })
    }
  })

  // POST /api/worktrees/:slug/unstage
  router.post('/api/worktrees/:slug/unstage', validate(WorktreeGitPathsSchema), async (req: Request, res: Response) => {
    const folder = (req.query.folder as string) || process.cwd()
    try {
      await unstageWorktreePaths({ workspaceFolder: folder, paths: req.body.paths })
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to unstage files' })
    }
  })

  // POST /api/worktrees/:slug/commit
  router.post('/api/worktrees/:slug/commit', validate(WorktreeGitCommitSchema), async (req: Request, res: Response) => {
    const folder = (req.query.folder as string) || process.cwd()
    try {
      const result = await commitWorktreeChanges({ workspaceFolder: folder, message: req.body.message })
      res.json({ ok: true, ...result })
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to commit' })
    }
  })

  return router
}
