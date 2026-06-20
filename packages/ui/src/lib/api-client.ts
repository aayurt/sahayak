const BASE = '/api'

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API ${res.status}: ${err}`)
  }
  return res.json()
}

export const api = {
  // Models
  listModels: () => request<{ models: Array<{ id: string; name?: string; backend: string; context_size: number }> }>('/models'),

  // Sessions
  listSessions: () => request<Array<{ id: string; name: string; model: string; updatedAt: string }>>('/chat/sessions'),
  getSession: (id: string) => request<{ session: any; messages: any[] }>(`/chat/sessions/${id}`),
  createSession: (model?: string) =>
    request<{ id: string }>('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),
  updateSession: (id: string, name?: string, model?: string) =>
    request<{ ok: boolean }>(`/chat/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, model }),
    }),
  deleteSession: (id: string) => request(`/chat/sessions/${id}`, { method: 'DELETE' }),
  sendMessage: (sessionId: string, message: string, model: string, systemPrompt?: string) =>
    request(`/chat/sessions/${sessionId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, model, systemPrompt, stream: false }),
    }),

  // Stream chat — returns EventSource
  streamChat: (_sessionId: string, _message: string, _model: string, _systemPrompt?: string): EventSource => {
    const url = new URL(`${BASE}/chat/sessions/${_sessionId}/chat`, window.location.origin)
    const es = new EventSource(url.toString())
    return es
  },

  // Settings
  getSettings: () => request<Record<string, unknown>>('/settings'),
  updateSettings: (settings: Record<string, unknown>) =>
    request('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // System
  getSystemMetrics: () => request<any[]>('/system/metrics'),

  // TTS
  speak: async (text: string, voice?: string) => {
    const res = await fetch(`${BASE}/tts/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    })
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`)
    return res.arrayBuffer()
  },

  // Knowledge
  listProjects: () => request<any[]>('/knowledge/projects'),
  addProject: (path: string, name: string, language?: string) =>
    request<any>('/knowledge/projects', { method: 'POST', body: JSON.stringify({ path, name, language }) }),
  deleteProject: (id: string) => request(`/knowledge/projects/${id}`, { method: 'DELETE' }),
  scanProject: (id: string) => request<{ nodes: number; edges: number }>(`/knowledge/projects/${id}/scan`, { method: 'POST' }),
  getGraph: (projectId: string) => request<{ nodes: any[]; edges: any[] }>(`/knowledge/graph?projectId=${projectId}`),
  searchNodes: (projectId: string, q: string) => request<any[]>(`/knowledge/search?projectId=${projectId}&q=${encodeURIComponent(q)}`),

  // Sidecars
  listSidecars: () => request<Array<{ id: string; name: string; port: number; running: boolean }>>('/sidecars'),
  startSidecar: (id: string, command: string, args: string[], env?: Record<string, string>) =>
    request(`/sidecars/${id}/start`, { method: 'POST', body: JSON.stringify({ command, args, env }) }),
  stopSidecar: (id: string) => request(`/sidecars/${id}/stop`, { method: 'POST' }),

  // Skills
  listSkills: () => request<any[]>('/skills'),
  getSkill: (id: string) => request<any>(`/skills/${id}`),
  createSkill: (data: { name: string; description?: string; systemPrompt: string; model?: string; temperature?: number; maxTokens?: number }) =>
    request<any>('/skills', { method: 'POST', body: JSON.stringify(data) }),
  updateSkill: (id: string, data: any) =>
    request<any>(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSkill: (id: string) => request(`/skills/${id}`, { method: 'DELETE' }),

  // Agents
  runSkill: (skillId: string, input: Record<string, unknown>): Promise<Response> =>
    fetch(`/api/agents/run/${skillId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    }),
  runSkillSync: (skillId: string, input: Record<string, unknown>) =>
    request<{ runId: string; output: string }>(`/agents/run/${skillId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    }),
  listAgentRuns: (limit = 20) => request<any[]>(`/agents/runs?limit=${limit}`),
  getAgentRun: (id: string) => request<any>(`/agents/runs/${id}`),
  listAgentMemory: (limit = 50) => request<any[]>(`/agents/memory?limit=${limit}`),

  // Cron
  listCronJobs: () => request<any[]>('/cron'),
  createCronJob: (data: { name: string; expression: string; action: string; config?: any }) =>
    request<any>('/cron', { method: 'POST', body: JSON.stringify(data) }),
  updateCronJob: (id: string, data: any) =>
    request<any>(`/cron/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCronJob: (id: string) => request(`/cron/${id}`, { method: 'DELETE' }),
  toggleCronJob: (id: string) => request<any>(`/cron/${id}/toggle`, { method: 'POST' }),

  // Vault
  listVault: () => request<{ path: string; tree: any[] }>('/vault'),
  readVaultFile: (filePath: string) =>
    request<{ content: string; modifiedAt: string; path: string }>(`/vault/read?path=${encodeURIComponent(filePath)}`),
  getVaultLinks: () => request<Array<{ source: string; target: string }>>('/vault/links'),
  saveToVault: (content: string, title?: string) =>
    request<{ path: string }>('/vault/save', { method: 'POST', body: JSON.stringify({ content, title }) }),

  // Skills sync
  syncSkills: () => request('/skills/sync', { method: 'POST' }),

  // Resources
  listResources: () => request<Array<{ id: string; name: string; type: string; path?: string; host?: string; port?: number; permissions: string; gitEnabled: boolean; graphifyState: string; createdAt: string; updatedAt: string }>>('/resources'),
  getResource: (id: string) => request<any>(`/resources/${id}`),
  createResource: (data: { name: string; type: 'folder' | 'ssh'; path?: string; host?: string; port?: number; username?: string; authType?: string; authData?: string; permissions?: string; gitEnabled?: boolean }) =>
    request<any>('/resources', { method: 'POST', body: JSON.stringify(data) }),
  updateResource: (id: string, data: { name?: string; permissions?: string; gitEnabled?: boolean; rememberPerm?: boolean }) =>
    request<any>(`/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteResource: (id: string) => request<{ ok: boolean }>(`/resources/${id}`, { method: 'DELETE' }),
  testSSH: (id: string) => request<{ ok: boolean; host?: string; error?: string }>(`/resources/${id}/ssh/test`, { method: 'POST' }),
  sshExec: (id: string, command: string) =>
    request<{ stdout: string; stderr: string; code: number | null }>(`/resources/${id}/ssh/exec`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),

  // Graphify
  startGraphify: (id: string) =>
    request<{ processId: string; graphifyState: string }>(`/resources/${id}/graphify/start`, { method: 'POST' }),
  stopGraphify: (id: string, processId: string) =>
    request<{ ok: boolean }>(`/resources/${id}/graphify/stop`, {
      method: 'POST',
      body: JSON.stringify({ processId }),
    }),
  getGraphifyStatus: (id: string, processId?: string) =>
    request<any>(`/resources/${id}/graphify/status${processId ? `?processId=${processId}` : ''}`),
  getGraphifyOutput: (id: string, processId: string, method?: string) =>
    request<{ content: string; truncated: boolean }>(`/resources/${id}/graphify/output?processId=${processId}${method ? `&method=${method}` : ''}`),
  getGraphifyFile: (id: string, filename: string) =>
    request<string>(`/resources/${id}/graphify/file/${filename}`),

  // Voice
  voiceHealth: () => request<{ voiceEndpoint: boolean }>('/tts/health'),

  // System backends
  checkBackends: () => request<{ backends: Array<{ name: string; url: string; status: 'online' | 'offline'; error?: string }> }>('/system/backends'),

  // Model download
  downloadModel: (type: string, name?: string) =>
    request<{ ok: boolean; message: string; path?: string }>('/models/download', {
      method: 'POST',
      body: JSON.stringify({ type, name }),
    }),
  listWhisperModels: () => request<{ modelsDir: string; installed: string[]; available: string[] }>('/models/download/whisper'),

  // Attachments
  uploadAttachments: async (sessionId: string, files: File[]) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    const res = await fetch(`${BASE}/chat/sessions/${sessionId}/attachments`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    return res.json() as Promise<{ attachments: Array<{ id: string; filename: string; mimeType: string; size: number; url: string }> }>
  },
  listAttachments: (sessionId: string) =>
    request<Array<{ id: string; sessionId: string; filename: string; mimeType: string; size: number; createdAt: string }>>(`/chat/sessions/${sessionId}/attachments`),
  deleteAttachment: (sessionId: string, attachmentId: string) =>
    request<{ ok: boolean }>(`/chat/sessions/${sessionId}/attachments/${attachmentId}`, { method: 'DELETE' }),
  getAttachmentDataUrl: (sessionId: string, attachmentId: string) =>
    `${BASE}/chat/sessions/${sessionId}/attachments/${attachmentId}/data`,

  // Gemini Auth
  startGeminiAuth: () =>
    request<{ ok: boolean; message: string }>('/gemini/auth/start', { method: 'POST' }),
  saveGeminiAuth: () =>
    request<{ ok: boolean; message: string; accountNum?: number; path?: string }>('/gemini/auth/save', { method: 'POST' }),

  // OpenCode
  restoreOpencodeSession: (sessionId: string) =>
    request<{ port: number; ocSessionId: string }>(`/chat/sessions/${sessionId}/opencode/restore`, { method: 'POST' }),
  listWorkspaces: () => request<{ workspaces: Array<{ id: string; path: string; name?: string; status: string; port?: number; binaryPath: string; error?: string; createdAt: string }> }>('/opencode/workspaces'),
  getWorkspacesSummary: () =>
    request<{
      total: number
      ready: number
      starting: number
      error: number
      workspaces: Array<{ id: string; path: string; name?: string; status: string; port?: number; pid?: number; binaryPath: string; error?: string; createdAt: string }>
    }>('/opencode/workspaces/summary'),
  createWorkspace: (folder: string, binaryPath?: string, name?: string) =>
    request<any>('/opencode/workspaces', {
      method: 'POST',
      body: JSON.stringify({ folder, binaryPath, name }),
    }),
  stopWorkspace: (id: string) =>
    request<{ ok: boolean }>(`/opencode/workspaces/${id}/stop`, { method: 'POST' }),

  // Preview
  createPreview: (payload: { sessionId: string; url: string }) =>
    request<{ token: string; sessionId: string; targetUrl: string; proxyUrl: string; createdAt: string }>('/previews', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deletePreview: (token: string) =>
    request<void>(`/previews/${encodeURIComponent(token)}`, { method: 'DELETE' }),

  // Resources: Git Tree
  getGitTree: (id: string) => request<{ isGitRepo: boolean; branches: string[]; branchCommits: Record<string, any[]> }>(`/resources/${id}/git/tree`),

  // Google Sheets
  googleAuthUrl: () => request<{ url: string }>('/google/auth/url'),
  googleAuthStatus: () => request<{ connected: boolean; email?: string }>('/google/auth/status'),
  googleDisconnect: () => request<{ ok: boolean }>('/google/auth', { method: 'DELETE' }),
  listSheets: () => request<{ sheets: Array<{ id: string; name: string; updatedAt: string; owner?: string }> }>('/google/sheets'),
  getSheetData: (id: string, range?: string) => request<{ meta: any; values: string[][] }>(`/google/sheets/${id}${range ? `?range=${encodeURIComponent(range)}` : ''}`),
  getSheetSummary: (id: string) => request<{ title: string; sheets: Array<{ name: string; rowCount: number; colCount: number; headers: string[]; sampleRow: string[] }> }>(`/google/sheets/${id}/summary`),
  updateSheetRange: (id: string, range: string, values: string[][]) =>
    request<{ ok: boolean }>(`/google/sheets/${id}/update`, { method: 'POST', body: JSON.stringify({ range, values }) }),
  appendSheetRows: (id: string, range: string, values: string[][]) =>
    request<{ ok: boolean }>(`/google/sheets/${id}/append`, { method: 'POST', body: JSON.stringify({ range, values }) }),

  // Worktrees
  qp: (folder?: string) => folder ? `?folder=${encodeURIComponent(folder)}` : '',

  listWorktrees: (folder?: string) =>
    request<{ worktrees: Array<{ slug: string; directory: string; kind: string; branch?: string }>; isGitRepo: boolean }>(
      `/worktrees${api.qp(folder)}`,
    ),
  createWorktree: (slug: string, branch?: string, folder?: string) =>
    request<{ slug: string; directory: string; branch?: string }>(`/worktrees${api.qp(folder)}`, {
      method: 'POST',
      body: JSON.stringify({ slug, branch }),
    }),
  deleteWorktree: (slug: string, folder?: string) =>
    request<void>(`/worktrees/${encodeURIComponent(slug)}${api.qp(folder)}`, { method: 'DELETE' }),
  getWorktreeStatus: (slug: string, folder?: string) =>
    request<Array<{ path: string; originalPath: string | null; stagedStatus: string | null; unstagedStatus: string | null; stagedAdditions: number; stagedDeletions: number; unstagedAdditions: number; unstagedDeletions: number }>>(
      `/worktrees/${encodeURIComponent(slug)}/status${api.qp(folder)}`,
    ),
  getWorktreeDiff: (slug: string, path: string, scope: 'staged' | 'unstaged', folder?: string) =>
    request<{ path: string; originalPath: string | null; scope: string; before: string; after: string; isBinary: boolean }>(
      `/worktrees/${encodeURIComponent(slug)}/diff?path=${encodeURIComponent(path)}&scope=${scope}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`,
    ),
  stageWorktreePaths: (slug: string, paths: string[], folder?: string) =>
    request<{ ok: boolean }>(`/worktrees/${encodeURIComponent(slug)}/stage${api.qp(folder)}`, {
      method: 'POST',
      body: JSON.stringify({ paths }),
    }),
  unstageWorktreePaths: (slug: string, paths: string[], folder?: string) =>
    request<{ ok: boolean }>(`/worktrees/${encodeURIComponent(slug)}/unstage${api.qp(folder)}`, {
      method: 'POST',
      body: JSON.stringify({ paths }),
    }),
  commitWorktree: (slug: string, message: string, folder?: string) =>
    request<{ ok: boolean; commitSha?: string }>(`/worktrees/${encodeURIComponent(slug)}/commit${api.qp(folder)}`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
}
