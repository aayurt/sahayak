import { ChildProcess, spawn } from 'child_process'
import { randomPort } from './utils'

interface SidecarProcess {
  id: string
  name: string
  port: number
  process: ChildProcess
  basePath: string
}

const running = new Map<string, SidecarProcess>()

export async function startSidecar(
  id: string,
  name: string,
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<SidecarProcess> {
  const port = await randomPort()
  const basePath = `/sidecar/${id}`

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PORT: String(port),
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const proc: SidecarProcess = { id, name, port, process: child, basePath }

    child.on('error', reject)

    child.on('spawn', () => {
      running.set(id, proc)
      resolve(proc)
    })

    child.stdout?.on('data', (data: Buffer) => {
      console.log(`[sidecar:${id}]`, data.toString().trim())
    })

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[sidecar:${id}]`, data.toString().trim())
    })

    child.on('exit', (code) => {
      running.delete(id)
      console.log(`[sidecar:${id}] exited with code ${code}`)
    })
  })
}

export function stopSidecar(id: string) {
  const proc = running.get(id)
  if (proc) {
    proc.process.kill()
    running.delete(id)
  }
}

export function getSidecar(id: string) {
  return running.get(id) || null
}

export function listSidecars() {
  return Array.from(running.values()).map((p) => ({
    id: p.id,
    name: p.name,
    port: p.port,
    basePath: p.basePath,
    running: true,
  }))
}
