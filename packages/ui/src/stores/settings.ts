import { createStore } from 'solid-js/store'

interface SettingsState {
  aiEndpoint: string
  aiApiKey: string
  openCodePath: string
  sidebarCollapsed: boolean
  jarvisEnabled: boolean
  theme: 'light' | 'dark'
  permissionMode: 'allow' | 'prompt'
}

const [settings, setSettings] = createStore<SettingsState>({
  aiEndpoint: 'http://localhost:8080',
  aiApiKey: '',
  openCodePath: 'opencode',
  sidebarCollapsed: false,
  jarvisEnabled: true,
  theme: 'dark',
  permissionMode: 'prompt',
})

const THEME_KEY = 'sahayak:theme'

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
  } catch {}
  document.documentElement.className = theme === 'dark' ? 'dark' : ''
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
