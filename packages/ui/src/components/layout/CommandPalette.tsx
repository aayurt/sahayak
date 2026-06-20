import { createSignal, createEffect, createMemo, For, Show, onCleanup } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { cn } from '../../lib/utils'
import { Search, ArrowUpDown } from 'lucide-solid'

interface Command {
  id: string
  label: string
  description: string
  action: () => void
  category: string
}

export function CommandPalette(props: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = createSignal('')
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [visible, setVisible] = createSignal(false)
  const [animating, setAnimating] = createSignal(false)
  const navigate = useNavigate()
  let inputRef: HTMLInputElement | undefined
  let listRef: HTMLDivElement | undefined

  const commands: Command[] = [
    { id: 'chat', label: 'Open Chat', description: 'Go to chat page', action: () => navigate('/chat'), category: 'nav' },
    { id: 'dashboard', label: 'Open Dashboard', description: 'Go to dashboard', action: () => navigate('/dashboard'), category: 'nav' },
    { id: 'terminal', label: 'Open Terminal', description: 'Go to terminal', action: () => navigate('/terminal'), category: 'nav' },
    { id: 'agent', label: 'Open Agent', description: 'Go to agent page', action: () => navigate('/agent'), category: 'nav' },
    { id: 'knowledge', label: 'Open Knowledge', description: 'Go to knowledge graph', action: () => navigate('/knowledge'), category: 'nav' },
    { id: 'settings', label: 'Open Settings', description: 'Go to settings page', action: () => navigate('/settings'), category: 'nav' },
    { id: 'resources', label: 'Open Resources', description: 'Manage attached resources', action: () => { navigate('/resources'); props.onClose() }, category: 'nav' },
    { id: 'toggle-jarvis', label: 'Toggle Jarvis', description: 'Enable/disable voice assistant', action: () => {
      const evt = new CustomEvent('sahayak:toggle-jarvis')
      window.dispatchEvent(evt)
      props.onClose()
    }, category: 'actions' },
    { id: 'toggle-theme', label: 'Toggle Theme', description: 'Switch between light and dark mode', action: () => {
      const evt = new CustomEvent('sahayak:toggle-theme')
      window.dispatchEvent(evt)
      props.onClose()
    }, category: 'actions' },
    { id: 'new-chat', label: 'New Chat', description: 'Start a new chat session', action: () => {
      const evt = new CustomEvent('sahayak:new-chat')
      window.dispatchEvent(evt)
      props.onClose()
    }, category: 'actions' },
    { id: 'run-skill', label: 'Run Skill...', description: 'Run an agent skill', action: () => { navigate('/agent'); props.onClose() }, category: 'actions' },
    { id: 'read-vault', label: 'Read Vault Note...', description: 'Browse vault notes', action: () => { navigate('/knowledge?tab=vault'); props.onClose() }, category: 'actions' },
  ]

  createEffect(() => {
    if (props.open) {
      setVisible(true)
      requestAnimationFrame(() => setAnimating(true))
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef?.focus())
    } else if (visible()) {
      setAnimating(false)
      setTimeout(() => setVisible(false), 150)
    }
  })

  createEffect(() => {
    if (!visible()) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { props.onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered().length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && filtered()[selectedIndex()]) {
        filtered()[selectedIndex()].action()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown))
  })

  const filtered = createMemo(() => {
    const q = query().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    )
  })

  return (
    <Show when={visible()}>
      <div class="fixed inset-0 z-50">
        <div
          class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-150"
          classList={{ 'opacity-100': animating(), 'opacity-0': !animating() }}
          onClick={props.onClose}
        />
        <div class="fixed inset-0 flex items-start justify-center pt-[10vh]">
          <div
            class="w-full max-w-[500px] mx-4 rounded-xl border border-border/50 shadow-2xl bg-background/70 backdrop-blur-xl overflow-hidden transition-all duration-150"
            classList={{
              'opacity-100 scale-100 translate-y-0': animating(),
              'opacity-0 scale-95 translate-y-2': !animating(),
            }}
          >
            <div class="flex items-center gap-2 px-4 py-3 border-b">
              <Search class="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                class="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
                placeholder="Type a command..."
                value={query()}
                onInput={(e) => { setQuery(e.currentTarget.value); setSelectedIndex(0) }}
              />
              <kbd class="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium text-muted-foreground">esc</kbd>
            </div>
            <div ref={listRef} class="max-h-72 overflow-y-auto p-1">
              <For each={filtered()}>
                {(cmd, i) => (
                  <button
                    class={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-left text-sm transition-colors cursor-pointer',
                      i() === selectedIndex() ? 'bg-accent text-accent-foreground' : 'text-foreground',
                    )}
                    onClick={() => cmd.action()}
                    onMouseEnter={() => setSelectedIndex(i())}
                  >
                    <span class="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase min-w-[3rem]"
                      classList={{
                        'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400': cmd.category === 'nav',
                        'bg-purple-500/10 text-purple-600 dark:text-purple-400': cmd.category === 'actions',
                      }}
                    >
                      {cmd.category}
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium truncate">{cmd.label}</div>
                      <div class="text-xs text-muted-foreground truncate">{cmd.description}</div>
                    </div>
                  </button>
                )}
              </For>
              <Show when={filtered().length === 0}>
                <div class="flex flex-col items-center py-8 text-center">
                  <ArrowUpDown class="h-6 w-6 text-muted-foreground/50 mb-2" />
                  <p class="text-sm text-muted-foreground">No commands found</p>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}
