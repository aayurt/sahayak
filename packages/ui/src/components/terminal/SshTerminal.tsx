import { onMount, onCleanup } from 'solid-js'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface SshTerminalProps {
  resourceId: string
  label: string
}

export function SshTerminal(props: SshTerminalProps) {
  let containerRef: HTMLDivElement | undefined

  onMount(() => {
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

    term.open(containerRef!)
    setTimeout(() => fitAddon.fit(), 50)

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws/ssh-terminal/${props.resourceId}`)

    ws.onopen = () => {
      term.write(`\r\n\x1b[32mConnected to ${props.label}\x1b[0m\r\n`)
      term.focus()
    }

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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    const ro = new ResizeObserver(() => fitAddon.fit())
    ro.observe(containerRef!)

    onCleanup(() => {
      ws.close()
      term.dispose()
      ro.disconnect()
    })
  })

  return (
    <div ref={containerRef!} class="flex-1 p-1" style="min-height:0" />
  )
}
