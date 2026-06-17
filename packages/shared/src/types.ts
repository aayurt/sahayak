export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result'
  content: string
  model: string
  tokens: number
  metadata: Record<string, unknown>
  createdAt: Date
}

export interface ChatSession {
  id: string
  name: string
  projectId: string | null
  model: string
  systemPrompt: string
  tokenUsage: { prompt: number; completion: number; total: number }
  worktreePath: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Skill {
  id: string
  name: string
  description: string
  systemPrompt: string
  model: string
  temperature: number
  maxTokens: number
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AgentRun {
  id: string
  skillId: string
  status: 'running' | 'completed' | 'failed'
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  tokens: number
  startedAt: Date
  completedAt: Date | null
}

export interface CronJob {
  id: string
  name: string
  expression: string
  action: 'digest' | 'agent' | 'research' | 'custom'
  config: Record<string, unknown>
  enabled: boolean
  lastRun: Date | null
  nextRun: Date | null
}

export interface Project {
  id: string
  path: string
  name: string
  language: string
  lastIndexedAt: Date | null
}

export interface KnowledgeNode {
  id: string
  projectId: string
  label: string
  type: string
  content: string
  embedding: Float32Array | null
  metadata: Record<string, unknown>
  createdAt: Date
}

export interface KnowledgeEdge {
  id: string
  sourceId: string
  targetId: string
  relation: string
}

export interface SystemMetrics {
  cpu: number
  ramUsed: number
  ramTotal: number
  diskUsed: number
  diskTotal: number
  networkRx: number
  networkTx: number
}

export interface Sidecar {
  id: string
  name: string
  port: number
  basePath: string
  prefixMode: 'preserve' | 'strip'
  enabled: boolean
}

export interface ResearchSession {
  id: string
  query: string
  result: string
  sources: Array<{ url: string; title: string; snippet: string }>
  screenshots: string[]
  tokens: number
  createdAt: Date
}

export interface JarvisState {
  status: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'
  mode: 'click' | 'vad' | 'text'
  isConnected: boolean
  transcript: Array<{ role: 'user' | 'assistant'; id?: string; text: string }>
  micActive: boolean
}

export interface LocalAIModel {
  id: string
  name: string
  backend: string
  contextSize: number
}

export interface Resource {
  id: string
  name: string
  type: 'folder' | 'ssh'
  path: string | null
  host: string | null
  port: number | null
  username: string | null
  authType: string | null
  authData: string | null
  permissions: 'read-only' | 'read-write'
  rememberPerm: boolean
  gitEnabled: boolean
  graphifyState: 'none' | 'running' | 'done' | 'error'
  graphifyOutPath: string | null
  lastScannedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  aiEndpoint: string
  aiApiKey: string
  openCodePath: string
  serverPort: number
  serverPassword: string
}
