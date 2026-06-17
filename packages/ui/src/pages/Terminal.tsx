import { createResource, createSignal, For, Show, onMount, onCleanup } from 'solid-js'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '../lib/api-client'
import { SshTerminal } from '../components/terminal/SshTerminal'

interface TerminalTab {
  id: string
  label: string
  kind: 'local' | 'ssh'
  resourceId?: string
}

export function TerminalPage() {
  const [resources] = createResource(() => api.listResources())
  const [tabs, setTabs] = createSignal<TerminalTab[]>([{ id: 'local', label: 'Local', kind: 'local' }])
  const [activeTabId, setActiveTabId] = createSignal('local')
  const [showConfirm, setShowConfirm] = createSignal(true)
  const [started, setStarted] = createSignal(false)

  let localRef: HTMLDivElement | undefined
  let termRef: Terminal | undefined
  let wsRef: WebSocket | undefined

  const openSSHTerminal = (r: any) => {
    const id = `ssh-${r.id}`
    const exists = tabs().find((t) => t.id === id)
    if (exists) {
      setActiveTabId(id)
      return
    }
    setTabs([...tabs(), { id, label: r.name, kind: 'ssh', resourceId: r.id }])
    setActiveTabId(id)
  }

  const closeTab = (tabId: string) => {
    if (tabId === 'local') return
    const newTabs = tabs().filter((t) => t.id !== tabId)
    setTabs(newTabs)
    if (activeTabId() === tabId) {
      setActiveTabId(newTabs[0]?.id || 'local')
    }
  }

  const startOpencode = () => {
    setShowConfirm(false)
    setStarted(true)
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      wsRef.send('opencode\n')
    }
  }

  const skipOpencode = () => {
    setShowConfirm(false)
    setStarted(true)
  }

  // Local terminal — always mounted, hidden when inactive
  onMount(() => {
    if (!localRef) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Cascadia Code", monospace',
      theme: {
        background: '#09090b',
        foreground: '#d4d4d4',
        cursor: '#666',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      allowTransparency: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(localRef)
    setTimeout(() => fitAddon.fit(), 50)

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal`)
    wsRef = ws
    termRef = term

    ws.onopen = () => term.focus()
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        term.write(ev.data)
      } else {
        ev.data.text().then((text: string) => term.write(text))
      }
    }
    ws.onclose = () => {
      term.write('\r\n\x1b[31mConnection closed\x1b[0m\r\n')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    const ro = new ResizeObserver(() => fitAddon.fit())
    ro.observe(localRef)

    onCleanup(() => {
      ws.close()
      term.dispose()
      ro.disconnect()
    })
  })

  return (
    <div class="flex flex-col h-full overflow-hidden bg-background">
      {/* Tab bar */}
      <div class="flex items-center gap-0 px-2 border-b shrink-0" style="background:var(--bg-secondary);border-color:var(--border)">
        <For each={tabs()}>
          {(tab) => (
            <div
              class="flex items-center gap-1 px-3 py-1.5 text-xs border-b-2 cursor-pointer shrink-0"
              style={{
                'border-color': activeTabId() === tab.id ? 'var(--accent)' : 'transparent',
                color: activeTabId() === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              }}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.kind === 'local' ? null : (
                <button class="btn-ghost text-xs p-0 leading-none" style="color:var(--text-muted)" onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}>&times;</button>
              )}
            </div>
          )}
        </For>

        {/* SSH resource dropdown */}
        <div class="ml-auto relative group">
          <button class="btn-ghost text-xs px-2 py-1" style="color:var(--text-muted)">+ SSH</button>
          <div class="absolute right-0 top-full mt-0.5 w-48 rounded-lg shadow-lg border z-50 hidden group-hover:block" style="background:var(--bg-secondary);border-color:var(--border)">
            <div class="p-1 max-h-48 overflow-y-auto">
              <Show when={resources.loading}>
                <p class="text-xs px-2 py-1" style="color:var(--text-muted)">Loading...</p>
              </Show>
              <For each={resources()?.filter((r: any) => r.type === 'ssh')}>
                {(r: any) => (
                  <button
                    class="w-full text-xs text-left px-2 py-1.5 rounded hover:bg-muted"
                    onClick={() => openSSHTerminal(r)}
                  >
                    {r.name}
                  </button>
                )}
              </For>
              <Show when={resources()?.filter((r: any) => r.type === 'ssh').length === 0}>
                <p class="text-xs px-2 py-1" style="color:var(--text-muted)">No SSH resources</p>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal area */}
      <div class="flex-1 relative" style="min-height:0">
        {/* Local terminal */}
        <div class="absolute inset-0" style={{ display: activeTabId() === 'local' ? 'flex' : 'none' }}>
          <Show when={showConfirm()}>
            <div class="absolute inset-0 flex items-center justify-center z-10" style="background:rgba(0,0,0,0.6)">
              <div class="rounded-xl border p-6 max-w-sm w-full mx-4 text-center" style="background:var(--bg-secondary);border-color:var(--border)">
                <p class="text-sm font-medium mb-1">Start AI assistant?</p>
                <p class="text-xs mb-4" style="color:var(--text-muted)">
                  opencode will help you run commands and answer questions in this terminal.
                </p>
                <div class="flex gap-2 justify-center">
                  <button
                    class="px-4 py-1.5 text-sm font-medium rounded-lg border transition-all hover:opacity-80"
                    style="background:var(--accent);border-color:var(--accent);color:white"
                    onClick={startOpencode}
                  >
                    Start opencode
                  </button>
                  <button
                    class="px-4 py-1.5 text-sm rounded-lg border transition-all hover:opacity-80"
                    style="border-color:var(--border);color:var(--text-muted)"
                    onClick={skipOpencode}
                  >
                    Just a shell
                  </button>
                </div>
              </div>
            </div>
          </Show>
          <div ref={localRef!} class="flex-1 p-1" style="min-height:0" />
        </div>

        {/* SSH terminals */}
        <For each={tabs().filter((t) => t.kind === 'ssh')}>
          {(tab) => (
            <div class="absolute inset-0" style={{ display: activeTabId() === tab.id ? 'flex' : 'none' }}>
              <SshTerminal resourceId={tab.resourceId!} label={tab.label} />
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
