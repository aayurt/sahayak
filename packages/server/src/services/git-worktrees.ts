import { spawn } from 'child_process'
import { readFile, mkdir, stat, rename as renameAsync } from 'fs/promises'
import { existsSync, readdirSync } from 'fs'
import path from 'path'

export interface WorktreeDescriptor {
  slug: string
  directory: string
  kind: 'root' | 'worktree'
  branch?: string
}

export interface WorktreeGitStatusEntry {
  path: string
  originalPath: string | null
  stagedStatus: string | null
  stagedAdditions: number
  stagedDeletions: number
  unstagedStatus: string | null
  unstagedAdditions: number
  unstagedDeletions: number
}

export interface WorktreeGitDiffResponse {
  path: string
  originalPath: string | null
  scope: 'staged' | 'unstaged'
  before: string
  after: string
  isBinary: boolean
}

type GitResult = { ok: true; stdout: string } | { ok: false; error: Error; stdout?: string; stderr?: string }

function runGit(args: string[], cwd: string, acceptedExitCodes: number[] = [0]): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.once('error', (error) => resolve({ ok: false, error, stdout, stderr }))
    child.once('close', (code) => {
      if (acceptedExitCodes.includes(code ?? 0)) {
        resolve({ ok: true, stdout })
      } else {
        resolve({ ok: false, error: new Error(stderr.trim() || `git ${args.join(' ')} failed with code ${code}`), stdout, stderr })
      }
    })
  })
}

function isGitUnavailableResult(result: GitResult): boolean {
  return !result.ok && (result.error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

export async function isGitAvailable(): Promise<boolean> {
  const result = await runGit(['--version'], process.cwd())
  return result.ok || !isGitUnavailableResult(result)
}

export async function resolveRepoRoot(folder: string): Promise<{ repoRoot: string; isGitRepo: boolean }> {
  const result = await runGit(['rev-parse', '--show-toplevel'], folder)
  if (isGitUnavailableResult(result)) throw new Error('Git is not installed or not available in PATH')
  if (!result.ok) return { repoRoot: folder, isGitRepo: false }
  const repoRoot = result.stdout.trim()
  if (!repoRoot) return { repoRoot: folder, isGitRepo: false }
  return { repoRoot, isGitRepo: true }
}

function parseWorktreePorcelain(output: string): Array<{ worktree: string; branch?: string; head?: string; detached?: boolean }> {
  const records: Array<{ worktree: string; branch?: string; head?: string; detached?: boolean }> = []
  const lines = output.split(/\r?\n/)
  let current: Record<string, string | boolean> = {}
  const flush = () => {
    if (current.worktree) {
      records.push({ worktree: current.worktree as string, branch: current.branch as string | undefined, head: current.head as string | undefined, detached: current.detached as boolean | undefined })
      current = {}
    }
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { flush(); continue }
    const [key, ...rest] = trimmed.split(' ')
    const value = rest.join(' ').trim()
    if (key === 'worktree') current.worktree = value
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '')
    else if (key === 'HEAD') current.head = value
    else if (key === 'detached') current.detached = true
  }
  flush()
  return records
}

export async function listWorktrees(params: { repoRoot: string; workspaceFolder: string }): Promise<WorktreeDescriptor[]> {
  const { repoRoot, workspaceFolder } = params
  const result = await runGit(['worktree', 'list', '--porcelain'], workspaceFolder)
  if (!result.ok) return [{ slug: 'root', directory: workspaceFolder, kind: 'root' }]

  const records = parseWorktreePorcelain(result.stdout)
  const rootRecord = records.find((r) => path.resolve(r.worktree) === path.resolve(repoRoot))
  const descriptors: WorktreeDescriptor[] = [{ slug: 'root', directory: workspaceFolder, kind: 'root', branch: rootRecord?.branch }]
  const seen = new Set<string>(['root'])

  for (const record of records) {
    const abs = record.worktree
    if (!abs) continue
    if (path.resolve(abs) === path.resolve(repoRoot)) continue
    const branch = (record.branch ?? '').trim()
    const slug = branch || `worktree-${path.basename(abs)}`
    if (!slug || slug === 'root' || seen.has(slug)) continue
    seen.add(slug)
    descriptors.push({ slug, directory: abs, kind: 'worktree', branch: record.branch })
  }
  return descriptors
}

export async function createManagedWorktree(params: { repoRoot: string; workspaceFolder: string; slug: string }): Promise<{ slug: string; directory: string; branch?: string }> {
  const { repoRoot, workspaceFolder } = params
  const branch = params.slug.trim()
  if (!branch || branch === 'root') throw new Error('Invalid worktree slug')

  const sanitizeDirName = (input: string): string =>
    input.trim().replace(/[\\/]+/g, '-').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'worktree'

  const worktreesDir = path.join(repoRoot, '.sahayak', 'worktrees')
  const targetDir = path.join(worktreesDir, sanitizeDirName(branch))
  await mkdir(worktreesDir, { recursive: true })

  try {
    const st = await stat(targetDir)
    if (st.isDirectory()) throw new Error('Worktree directory already exists')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
  }

  const first = await runGit(['worktree', 'add', '-b', branch, targetDir, 'HEAD'], workspaceFolder)
  if (first.ok) return { slug: branch, directory: targetDir, branch }

  const msg = (first.stderr ?? first.error.message).toLowerCase()
  if (msg.includes('already exists')) {
    const second = await runGit(['worktree', 'add', targetDir, branch], workspaceFolder)
    if (second.ok) return { slug: branch, directory: targetDir, branch }
    throw second.error
  }
  throw first.error
}

export async function removeWorktree(params: { workspaceFolder: string; directory: string; force?: boolean }): Promise<void> {
  const { workspaceFolder, directory } = params
  if (!directory.trim()) throw new Error('Invalid worktree directory')
  const args = ['worktree', 'remove']
  if (params.force) args.push('--force')
  args.push(directory)
  const result = await runGit(args, workspaceFolder)
  if (!result.ok) throw result.error
  await runGit(['worktree', 'prune'], workspaceFolder).catch(() => undefined)
}

// Git status
function ensureEntry(map: Map<string, WorktreeGitStatusEntry>, p: string): WorktreeGitStatusEntry {
  const existing = map.get(p)
  if (existing) return existing
  const next: WorktreeGitStatusEntry = { path: p, originalPath: null, stagedStatus: null, stagedAdditions: 0, stagedDeletions: 0, unstagedStatus: null, unstagedAdditions: 0, unstagedDeletions: 0 }
  map.set(p, next)
  return next
}

function parseGitChangeKind(code: string): string | null {
  const n = code.trim().toUpperCase()
  if (!n) return null
  if (n === 'A') return 'added'
  if (n === 'M') return 'modified'
  if (n === 'D') return 'deleted'
  if (n.startsWith('R')) return 'renamed'
  if (n.startsWith('C')) return 'copied'
  if (n === 'U') return 'unmerged'
  return null
}

function applyNameStatusOutput(map: Map<string, WorktreeGitStatusEntry>, output: string, target: 'stagedStatus' | 'unstagedStatus') {
  const tokens = output.split('\0')
  let i = 0
  while (i < tokens.length) {
    const record = tokens[i++] ?? ''
    if (!record) continue
    const parts = record.split('\t')
    const statusCode = parseGitChangeKind(parts[0] ?? '')
    if (!statusCode) continue
    const inlinePath = parts.slice(1).join('\t')
    const firstPath = inlinePath || tokens[i++] || ''
    const isRename = statusCode === 'renamed' || statusCode === 'copied'
    const secondPath = isRename ? tokens[i++] || '' : ''
    const p = isRename ? secondPath || firstPath : firstPath
    const pn = p.trim().replace(/\\+/g, '/')
    if (!pn) continue
    const entry = ensureEntry(map, pn)
    entry[target] = statusCode
    if (isRename) entry.originalPath = firstPath.trim().replace(/\\+/g, '/') || entry.originalPath
  }
}

function applyUntrackedOutput(map: Map<string, WorktreeGitStatusEntry>, output: string) {
  for (const line of output.split(/\r?\n/)) {
    const p = line.trim().replace(/\\+/g, '/')
    if (!p) continue
    ensureEntry(map, p).unstagedStatus = 'untracked'
  }
}

export async function getWorktreeGitStatus(workspaceFolder: string): Promise<WorktreeGitStatusEntry[]> {
  const [staged, unstaged, untracked] = await Promise.all([
    runGit(['diff', '--name-status', '-z', '--cached', '--find-renames', '--find-copies'], workspaceFolder),
    runGit(['diff', '--name-status', '-z', '--find-renames', '--find-copies'], workspaceFolder),
    runGit(['ls-files', '--others', '--exclude-standard'], workspaceFolder),
  ])
  for (const r of [staged, unstaged, untracked]) {
    if (!r.ok) throw r.error
  }
  const entries = new Map<string, WorktreeGitStatusEntry>()
  applyNameStatusOutput(entries, (staged as GitResult & { ok: true }).stdout, 'stagedStatus')
  applyNameStatusOutput(entries, (unstaged as GitResult & { ok: true }).stdout, 'unstagedStatus')
  applyUntrackedOutput(entries, (untracked as GitResult & { ok: true }).stdout)
  return Array.from(entries.values()).sort((a, b) => a.path.localeCompare(b.path))
}

export async function getWorktreeGitDiff(params: { workspaceFolder: string; path: string; originalPath?: string | null; scope: 'staged' | 'unstaged' }): Promise<WorktreeGitDiffResponse> {
  const { workspaceFolder, path: filePath, originalPath, scope } = params
  const normalizedPath = filePath.trim().replace(/\\+/g, '/').replace(/^\.\//, '')

  if (scope === 'staged') {
    const [beforeResult, afterResult] = await Promise.all([
      runGit(['show', `HEAD:${originalPath ?? normalizedPath}`], workspaceFolder, [0, 1]),
      runGit(['cat-file', '-p', `:${normalizedPath}`], workspaceFolder, [0, 1]),
    ])
    return {
      path: normalizedPath,
      originalPath: originalPath ?? null,
      scope,
      before: (beforeResult as GitResult & { ok: true }).stdout ?? '',
      after: (afterResult as GitResult & { ok: true }).stdout ?? '',
      isBinary: false,
    }
  }

  const beforeResult = await runGit(['cat-file', '-p', `:${normalizedPath}`], workspaceFolder, [0, 1])
  let before = (beforeResult as GitResult & { ok: true }).stdout ?? ''
  let after = ''
  try {
    after = await readFile(path.join(workspaceFolder, normalizedPath), 'utf-8')
  } catch { after = '' }
  return { path: normalizedPath, originalPath: originalPath ?? null, scope, before, after, isBinary: false }
}

export async function stageWorktreePaths(params: { workspaceFolder: string; paths: string[] }): Promise<void> {
  const paths = [...new Set(params.paths.map((p) => p.trim().replace(/\\+/g, '/').replace(/^\.\//, '')))]
    .filter(Boolean)
  if (paths.length === 0) throw new Error('At least one path is required')
  await ensureGitOk(runGit(['add', '--', ...paths], params.workspaceFolder), 'Failed to stage files')
}

export async function unstageWorktreePaths(params: { workspaceFolder: string; paths: string[] }): Promise<void> {
  const paths = [...new Set(params.paths.map((p) => p.trim().replace(/\\+/g, '/').replace(/^\.\//, '')))]
    .filter(Boolean)
  if (paths.length === 0) throw new Error('At least one path is required')
  const headResult = await runGit(['rev-parse', '--verify', 'HEAD'], params.workspaceFolder)
  if (headResult.ok) {
    await ensureGitOk(runGit(['restore', '--staged', '--', ...paths], params.workspaceFolder), 'Failed to unstage files')
  } else {
    await ensureGitOk(runGit(['rm', '--cached', '--quiet', '--', ...paths], params.workspaceFolder), 'Failed to unstage files')
  }
}

export async function commitWorktreeChanges(params: { workspaceFolder: string; message: string }): Promise<{ commitSha?: string }> {
  const message = params.message.trim()
  if (!message) throw new Error('Commit message is required')
  await ensureGitOk(runGit(['commit', '-m', message], params.workspaceFolder), 'Failed to create commit')
  const shaResult = await runGit(['rev-parse', 'HEAD'], params.workspaceFolder)
  if (!shaResult.ok) return {}
  const commitSha = shaResult.stdout.trim()
  return commitSha ? { commitSha } : {}
}

async function ensureGitOk(resultPromise: Promise<GitResult>, fallbackMessage: string): Promise<void> {
  const result = await resultPromise
  if (!result.ok) throw new Error(result.stderr?.trim() || result.error.message || fallbackMessage)
}
