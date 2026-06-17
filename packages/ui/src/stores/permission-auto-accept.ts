const STORAGE_KEY = 'sahayak:permission-auto-accept:v1'

function loadAutoAccept(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveAutoAccept(data: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* storage full */ }
}

export function isPermissionAutoAcceptEnabled(
  sessionId: string,
): boolean {
  const data = loadAutoAccept()
  return data[sessionId] ?? false
}

export function togglePermissionAutoAccept(
  sessionId: string,
  enabled: boolean,
) {
  const data = loadAutoAccept()
  if (enabled) {
    data[sessionId] = true
  } else {
    delete data[sessionId]
  }
  saveAutoAccept(data)
}

export function getAutoAcceptSessions(): string[] {
  const data = loadAutoAccept()
  return Object.keys(data).filter((k) => data[k])
}
