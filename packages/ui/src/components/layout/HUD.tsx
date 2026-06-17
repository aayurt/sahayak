import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { CommandPalette } from './CommandPalette'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogCloseButton,
} from '../ui/dialog'
import { SidebarTrigger } from '../ui/sidebar'
import { Command, Sun, Moon, Sparkles, Cpu, X } from 'lucide-solid'
import { useSettings, toggleTheme } from '../../stores/settings'
import { api } from '../../lib/api-client'

interface Workspace {
  id: string; path: string; name?: string; status: string
  port?: number; pid?: number; error?: string; createdAt: string
}

export function HUD() {
  const { settings, setSettings } = useSettings()
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [activeSkill, setActiveSkill] = createSignal<string | null>(null)
  const [workspaces, setWorkspaces] = createSignal<Workspace[]>([])
  const [wsOpen, setWsOpen] = createSignal(false)

  let pollTimer: ReturnType<typeof setInterval> | undefined

  async function fetchWorkspaces() {
    try {
      const data = await api.getWorkspacesSummary()
      setWorkspaces(data.workspaces)
    } catch { /* server might be down */ }
  }

  createEffect(() => {
    fetchWorkspaces()
    pollTimer = setInterval(fetchWorkspaces, 5000)
    onCleanup(() => { if (pollTimer) clearInterval(pollTimer) })
  })

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setPaletteOpen(!paletteOpen())
    }
  }

  createEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown))
  })

  createEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.skill) setActiveSkill(e.detail.skill)
    }
    window.addEventListener('sahayak:active-skill' as any, handler as any)
    onCleanup(() => {
      window.removeEventListener('sahayak:active-skill' as any, handler as any)
    })
  })

  createEffect(() => {
    const handler = () => toggleTheme()
    window.addEventListener('sahayak:toggle-theme', handler)
    onCleanup(() => window.removeEventListener('sahayak:toggle-theme', handler))
  })

  const navigate = useNavigate()
  createEffect(() => {
    const handler = () => navigate('/chat')
    window.addEventListener('sahayak:new-chat', handler)
    onCleanup(() => window.removeEventListener('sahayak:new-chat', handler))
  })

  const activeCount = () => workspaces().filter(w => w.status === 'ready' || w.status === 'starting').length

  async function stopWorkspace(id: string) {
    try {
      await api.stopWorkspace(id)
      await fetchWorkspaces()
    } catch { /* ignore */ }
  }

  const statusColor: Record<string, string> = {
    ready: 'text-green-600 dark:text-green-400',
    starting: 'text-yellow-600 dark:text-yellow-400',
    stopped: 'text-muted-foreground',
    error: 'text-red-600 dark:text-red-400',
  }

  return (
    <>
      <div class="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-9 px-3 border-b bg-background text-muted-foreground text-xs">
        <div class="flex items-center gap-1">
          <SidebarTrigger class="h-7 w-7" />
          <Button variant="ghost" size="sm" onClick={() => setPaletteOpen(true)} class="gap-1.5 text-xs h-7">
            <Command class="h-3.5 w-3.5" />
            <span class="text-muted-foreground">Command...</span>
            <kbd class="hidden sm:inline-flex ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-medium text-muted-foreground">⌘K</kbd>
          </Button>
          <Show when={activeSkill()}>
            <Badge variant="secondary" class="gap-1 text-[10px] h-5">
              <span class="text-amber-500">⚡</span>
              {activeSkill()}
            </Badge>
          </Show>
          <Show when={activeCount() > 0}>
            <Dialog open={wsOpen()} onOpenChange={setWsOpen}>
              <DialogTrigger as="button" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted hover:bg-muted/80 transition-colors">
                <Cpu class="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
                <span>{activeCount()}</span>
              </DialogTrigger>
              <DialogContent class="max-w-md">
                <DialogHeader>
                  <DialogTitle>Active OpenCode Agents</DialogTitle>
                  <DialogCloseButton class="absolute top-3 right-3">
                    <X class="h-4 w-4" />
                  </DialogCloseButton>
                </DialogHeader>
                <div class="max-h-64 overflow-y-auto space-y-2">
                  <For each={workspaces()}>
                    {(ws) => (
                      <div class="flex items-center justify-between gap-2 p-2 rounded border bg-muted/30 text-xs">
                        <div class="flex-1 min-w-0">
                          <div class="font-medium truncate">{ws.path.split('/').pop() || ws.path}</div>
                          <div class="flex items-center gap-2 mt-0.5">
                            <span class={`${statusColor[ws.status] || 'text-muted-foreground'}`}>
                              {ws.status}
                            </span>
                            <span class="text-muted-foreground">{ws.port ? `:${ws.port}` : ''}</span>
                            <Show when={ws.pid}>
                              <span class="text-muted-foreground">PID {ws.pid}</span>
                            </Show>
                          </div>
                          <Show when={ws.error}>
                            <div class="text-red-600 dark:text-red-400 mt-0.5 truncate">{ws.error}</div>
                          </Show>
                        </div>
                        <Show when={ws.status === 'ready' || ws.status === 'starting'}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => stopWorkspace(ws.id)}
                            class="h-6 px-2 text-[10px] text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                          >
                            Stop
                          </Button>
                        </Show>
                      </div>
                    )}
                  </For>
                  <Show when={workspaces().length === 0}>
                    <div class="text-center text-muted-foreground py-4">No active workspaces</div>
                  </Show>
                </div>
              </DialogContent>
            </Dialog>
          </Show>
        </div>

        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            class="gap-1.5 text-xs h-7 text-muted-foreground"
            title={settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Show when={settings.theme === 'dark'} fallback={<Moon class="h-3 w-3" />}>
              <Sun class="h-3 w-3" />
            </Show>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSettings('jarvisEnabled', !settings.jarvisEnabled)}
            class={`gap-1.5 text-xs h-7 ${settings.jarvisEnabled ? 'text-cyan-600 dark:text-cyan-400' : 'text-muted-foreground'}`}
            title={settings.jarvisEnabled ? 'Disable Jarvis' : 'Enable Jarvis'}
          >
            <Sparkles class="h-3 w-3" />
            <span>{settings.jarvisEnabled ? 'Jarvis Mode' : 'Jarvis Off'}</span>
          </Button>
        </div>
      </div>

      <CommandPalette open={paletteOpen()} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
