import type { ClientChannel } from 'ssh2'

export interface SSHConfig {
  host: string
  port: number
  username: string
  authType: string | null
  authData: string | undefined
}

export interface SSHConnection {
  host: string
  port: number
  exec: (command: string) => Promise<{ stdout: string; stderr: string; code: number | null }>
  shell: (opts?: { cols?: number; rows?: number }) => Promise<SSHShellChannel>
  disconnect: () => void
}

export interface SSHShellChannel {
  onData: (cb: (data: string) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  onClose: (cb: () => void) => void
  close: () => void
}

export async function connect(config: SSHConfig): Promise<SSHConnection> {
  const { Client } = await import('ssh2')
  const client = new Client()

  const conn = new Promise<SSHConnection>((resolve, reject) => {
    client.on('ready', () => {
      resolve({
        host: config.host,
        port: config.port,
        exec: (command: string) =>
          new Promise((res, rej) => {
            client.exec(command, (err, stream) => {
              if (err) return rej(err)
              let stdout = ''
              let stderr = ''
              stream.on('data', (data: Buffer) => { stdout += data.toString() })
              stream.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
              stream.on('close', (code: number | null) => res({ stdout, stderr, code }))
            })
          }),
        shell: (opts) =>
          new Promise((res, rej) => {
            client.shell({ term: 'xterm-256color', cols: opts?.cols ?? 80, rows: opts?.rows ?? 24 }, (err, stream) => {
              if (err) return rej(err)
              const dataHandlers: Array<(data: string) => void> = []
              const closeHandlers: Array<() => void> = []
              stream.on('data', (data: Buffer) => {
                const str = data.toString()
                for (const h of dataHandlers) h(str)
              })
              stream.stderr.on('data', (data: Buffer) => {
                const str = data.toString()
                for (const h of dataHandlers) h(str)
              })
              stream.on('close', () => {
                for (const h of closeHandlers) h()
              })
              res({
                onData: (cb) => { dataHandlers.push(cb) },
                write: (data) => stream.write(data),
                resize: (cols, rows) => stream.setWindow(rows, cols, 0, 0),
                onClose: (cb) => { closeHandlers.push(cb) },
                close: () => stream.close(),
              })
            })
          }),
        disconnect: () => client.end(),
      })
    })
    client.on('error', reject)

    const connectConfig: any = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 10000,
    }

    if (config.authType === 'key' && config.authData) {
      connectConfig.privateKey = config.authData
    } else if (config.authType === 'password' && config.authData) {
      connectConfig.password = config.authData
    } else {
      connectConfig.agent = process.env.SSH_AUTH_SOCK
    }

    client.connect(connectConfig)
  })

  return conn
}
