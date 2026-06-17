export type PermissionReply = 'once' | 'always' | 'reject'

export interface PermissionRequest {
  id: string
  sessionID?: string
  permission?: string
  type?: string
  pattern?: string
  patterns?: string[]
  title?: string
  metadata?: Record<string, unknown>
  time?: { created: number }
}
