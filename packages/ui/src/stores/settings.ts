import { createStore } from 'solid-js/store'

interface SettingsState {
  aiEndpoint: string
  aiApiKey: string
  openCodePath: string
  sidebarCollapsed: boolean
  jarvisEnabled: boolean
  theme: 'light' | 'dark'
  permissionMode: 'allow' | 'prompt'
  googleClientId: string
  googleClientSecret: string
}

const [settings, setSettings] = createStore<SettingsState>({
  aiEndpoint: 'http://localhost:8080',
  aiApiKey: '',
  openCodePath: 'opencode',
  sidebarCollapsed: false,
  jarvisEnabled: true,
  theme: 'dark',
  permissionMode: 'prompt',
  googleClientId: '',
  googleClientSecret: '',
})

const THEME_KEY = 'sahayak:theme'
const JARVIS_KEY = 'sahayak:jarvis-enabled'

let themeInitialized = false

export function useSettings() {
  return { settings, setSettings }
}

export function toggleTheme() {
  const next = settings.theme === 'dark' ? 'light' : 'dark'
  setSettings('theme', next)
  try { localStorage.setItem(THEME_KEY, next) } catch {}
}

export function initTheme() {
  if (themeInitialized) return
  themeInitialized = true
  let theme = settings.theme
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') {
      theme = saved
      setSettings('theme', theme)
    }
    const jarvisSaved = localStorage.getItem(JARVIS_KEY)
    if (jarvisSaved === 'true' || jarvisSaved === 'false') {
      setSettings('jarvisEnabled', jarvisSaved === 'true')
    }
  } catch {}
  document.documentElement.className = theme === 'dark' ? 'dark' : ''
}

export function toggleJarvis() {
  const next = !settings.jarvisEnabled
  setSettings('jarvisEnabled', next)
  try { localStorage.setItem(JARVIS_KEY, String(next)) } catch {}
}

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.className = theme === 'dark' ? 'dark' : ''
  try { localStorage.setItem(THEME_KEY, theme) } catch {}
}

export async function loadPermissionMode() {
  try {
    const res = await fetch('/api/settings')
    const data = await res.json() as Record<string, unknown>
    if (data.permissionMode === 'allow' || data.permissionMode === 'prompt') {
      setSettings('permissionMode', data.permissionMode as 'allow' | 'prompt')
    }
    if (typeof data.google_client_id === 'string') {
      setSettings('googleClientId', data.google_client_id)
    }
    if (typeof data.google_client_secret === 'string') {
      setSettings('googleClientSecret', data.google_client_secret)
    }
  } catch { /* ignore */ }
}

export async function savePermissionMode(mode: 'allow' | 'prompt') {
  setSettings('permissionMode', mode)
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissionMode: mode }),
    })
  } catch { /* ignore */ }
}
