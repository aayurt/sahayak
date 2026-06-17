import { EventEmitter } from "events"
import { spawn } from "child_process"

export type BackgroundProcess = {
  id: string
  title: string
  command: string
  status: "running" | "stopped" | "error"
  startedAt: string
  stoppedAt?: string
  exitCode?: number
  outputSizeBytes?: number
}

type ManagedProcess = {
  process: BackgroundProcess
  child: import("child_process").ChildProcess
  output: string[]
  maxOutputLines: number
}

export class BackgroundProcessManager {
  private processes = new Map<string, ManagedProcess>()
  public events = new EventEmitter()

  create(title: string, command: string, cwd: string): Promise<BackgroundProcess> {
    return new Promise((resolve, reject) => {
      const id = `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`

      const child = spawn(command, [], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        env: { ...process.env },
      })

      const proc: BackgroundProcess = {
        id,
        title,
        command,
        status: "running",
        startedAt: new Date().toISOString(),
      }

      const managed: ManagedProcess = {
        process: proc,
        child,
        output: [],
        maxOutputLines: 500,
      }

      child.stdout?.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n")
        for (const line of lines) {
          if (line.trim()) managed.output.push(line)
        }
        if (managed.output.length > managed.maxOutputLines) {
          managed.output = managed.output.slice(-managed.maxOutputLines)
        }
      })

      child.stderr?.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n")
        for (const line of lines) {
          if (line.trim()) managed.output.push(`[stderr] ${line}`)
        }
        if (managed.output.length > managed.maxOutputLines) {
          managed.output = managed.output.slice(-managed.maxOutputLines)
        }
      })

      child.on("error", (err: Error) => {
        proc.status = "error"
        managed.output.push(`[error] ${err.message}`)
        this.events.emit("process:status", { id, status: "error" })
      })

      child.on("exit", (code: number | null) => {
        proc.status = code === 0 ? "stopped" : "error"
        proc.exitCode = code ?? undefined
        proc.stoppedAt = new Date().toISOString()
        this.events.emit("process:status", { id, status: proc.status, exitCode: code })
      })

      this.processes.set(id, managed)

      child.on("spawn", () => {
        proc.status = "running"
        resolve(proc)
      })

      // If spawn is sync, resolve immediately
      setTimeout(() => {
        if (proc.status === "running") resolve(proc)
      }, 100)
    })
  }

  list(): BackgroundProcess[] {
    return Array.from(this.processes.values()).map((m) => m.process)
  }

  get(id: string): ManagedProcess | undefined {
    return this.processes.get(id)
  }

  async stop(id: string): Promise<BackgroundProcess> {
    const managed = this.processes.get(id)
    if (!managed) throw new Error(`Process ${id} not found`)

    managed.child.kill("SIGTERM")
    managed.process.status = "stopped"
    managed.process.stoppedAt = new Date().toISOString()

    return managed.process
  }

  async terminate(id: string): Promise<void> {
    const managed = this.processes.get(id)
    if (!managed) throw new Error(`Process ${id} not found`)

    managed.child.kill("SIGKILL")
    this.processes.delete(id)
  }

  readOutput(id: string, method: "full" | "head" | "tail" | "grep" = "full", pattern?: string, lines?: number): { content: string; truncated: boolean; sizeBytes: number } {
    const managed = this.processes.get(id)
    if (!managed) throw new Error(`Process ${id} not found`)

    let content: string
    const totalLines = managed.output.length

    if (method === "head") {
      const n = lines ?? 20
      content = managed.output.slice(0, n).join("\n")
    } else if (method === "tail") {
      const n = lines ?? 20
      content = managed.output.slice(-n).join("\n")
    } else if (method === "grep" && pattern) {
      content = managed.output.filter((l) => l.toLowerCase().includes(pattern.toLowerCase())).join("\n")
    } else {
      content = managed.output.join("\n")
    }

    const sizeBytes = Buffer.byteLength(content, "utf-8")
    const truncated = sizeBytes > 1024 * 100 // truncate at 100KB

    if (truncated) {
      content = content.slice(-1024 * 100)
    }

    return { content, truncated, sizeBytes }
  }

  shutdown() {
    for (const [, managed] of this.processes) {
      try { managed.child.kill("SIGKILL") } catch { /* ignore */ }
    }
    this.processes.clear()
  }
}
