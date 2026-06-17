import { WebSocket } from 'ws'
import { spawn } from 'node-pty'
import path from 'path'

export function handleTerminalConnection(ws: WebSocket, _url: string) {
  let pty: ReturnType<typeof spawn> | undefined

  try {
    const shell = process.env.SHELL || '/bin/zsh'
    pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: path.join(process.cwd(), 'opencodeTmp'),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      } as Record<string, string>,
    })
  } catch (e) {
    console.error('[terminal] failed to spawn pty:', (e as Error).message)
    ws.send('\r\n\x1b[31mFailed to start terminal: ' + (e as Error).message + '\x1b[0m\r\n')
    ws.close()
    return
  }

  pty.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })

  ws.on('message', (raw) => {
    if (!pty) return
    const msg = raw.toString()
    if (msg.startsWith('{') && msg.includes('"type"')) {
      try {
        const json = JSON.parse(msg)
        if (json.type === 'resize') {
          pty.resize(json.cols || 80, json.rows || 24)
          return
        }
      } catch { /* not a control message */ }
    }
    pty.write(msg)
  })

  ws.on('close', () => {
    if (pty) {
      try { pty.kill() } catch { /* already dead */ }
    }
  })
}
