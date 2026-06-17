import { WebSocket } from 'ws'
import { getDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'

export async function handleSSHTerminalConnection(ws: WebSocket, url: string) {
  const resourceId = url.split('/ws/ssh-terminal/')[1]
  if (!resourceId) {
    ws.send('\r\n\x1b[31mMissing resource ID\x1b[0m\r\n')
    ws.close()
    return
  }

  const db = getDb()
  const resource = db.select().from(schema.resources).where(eq(schema.resources.id, resourceId)).get()
  if (!resource || resource.type !== 'ssh') {
    ws.send('\r\n\x1b[31mSSH resource not found\x1b[0m\r\n')
    ws.close()
    return
  }

  let shellChannel: Awaited<ReturnType<typeof import('./services/ssh').SSHConnection['shell']>> | undefined

  try {
    const { connect } = await import('./services/ssh')
    const conn = await connect({
      host: resource.host!,
      port: resource.port || 22,
      username: resource.username || 'root',
      authType: resource.authType || 'key',
      authData: resource.authData || undefined,
    })

    shellChannel = await conn.shell({ cols: 80, rows: 24 })

    shellChannel.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    shellChannel.onClose(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('\r\n\x1b[31mConnection closed\x1b[0m\r\n')
        ws.close()
      }
    })

    ws.on('message', (raw) => {
      if (!shellChannel) return
      const msg = raw.toString()
      if (msg.startsWith('{') && msg.includes('"type"')) {
        try {
          const json = JSON.parse(msg)
          if (json.type === 'resize') {
            shellChannel.resize(json.cols || 80, json.rows || 24)
            return
          }
        } catch { /* not a control message */ }
      }
      shellChannel.write(msg)
    })

    ws.on('close', () => {
      if (shellChannel) {
        try { shellChannel.close() } catch { /* already closed */ }
      }
      try { conn.disconnect() } catch { /* already disconnected */ }
    })
  } catch (e) {
    ws.send(`\r\n\x1b[31mSSH connection failed: ${(e as Error).message}\x1b[0m\r\n`)
    ws.close()
  }
}
