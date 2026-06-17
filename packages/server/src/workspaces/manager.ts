import path from "path"
import { spawn, type ChildProcess } from "child_process"
import { existsSync } from "fs"
import { connect } from "net"
import { EventEmitter } from "events"
import { buildOpencodeConfigContent, getSahayakPluginUrl, resolveExistingOpencodeConfigContent } from "../opencode-plugin"

const STARTUP_STABILITY_DELAY_MS = 1500

export interface WorkspaceDescriptor {
  id: string
  path: string
  name?: string
  status: "starting" | "ready" | "stopped" | "error"
  port?: number
  proxyPath: string
  pid?: number
  binaryPath: string
  binaryVersion?: string
  error?: string
  createdAt: string
  updatedAt: string
}

interface LaunchOptions {
  folder: string
  name?: string
  binaryPath: string
}

export class WorkspaceManager {
  private workspaces = new Map<string, WorkspaceDescriptor>()
  private processes = new Map<string, ChildProcess>()
  public events = new EventEmitter()
  private pluginUrl: string

  constructor(private serverBaseUrl: string = "http://localhost:9090") {
    this.pluginUrl = getSahayakPluginUrl()
  }

  list(): WorkspaceDescriptor[] {
    return Array.from(this.workspaces.values())
  }

  get(id: string): WorkspaceDescriptor | undefined {
    return this.workspaces.get(id)
  }

  async create(options: LaunchOptions): Promise<WorkspaceDescriptor> {
    const id = `ws_${Date.now().toString(36)}`
    const workspacePath = path.resolve(options.folder)
    const proxyPath = `/api/opencode/${id}/instance`

    const descriptor: WorkspaceDescriptor = {
      id,
      path: workspacePath,
      name: options.name,
      status: "starting",
      proxyPath,
      binaryPath: options.binaryPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.workspaces.set(id, descriptor)
    this.events.emit("workspace:created", descriptor)

    const opencodeConfigContent = buildOpencodeConfigContent(undefined, this.pluginUrl)

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      OPENCODE_CONFIG_CONTENT: opencodeConfigContent,
      OPENCODE_EXPERIMENTAL_WORKSPACES: "true",
      SAHAYAK_INSTANCE_ID: id,
      SAHAYAK_BASE_URL: this.serverBaseUrl,
      SAHAYAK_SERVER_USERNAME: "sahayak",
      SAHAYAK_SERVER_PASSWORD: process.env.SAHAYAK_SERVER_PASSWORD || "sahayak",
      OPENCODE_SERVER_BASE_URL: `${this.serverBaseUrl}${proxyPath}`,
      OPENCODE_SERVER_USERNAME: "sahayak",
      OPENCODE_SERVER_PASSWORD: process.env.SAHAYAK_SERVER_PASSWORD || "sahayak",
    }

    try {
      if (!options.binaryPath) throw new Error('binaryPath is required')

      const child = spawn(options.binaryPath, ["serve", "--port", "0", "--print-logs"], {
        cwd: workspacePath,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      })

      this.processes.set(id, child)
      descriptor.pid = child.pid

      let stdoutBuffer = ""

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString()
        stdoutBuffer += text
        const lines = stdoutBuffer.split("\n")
        stdoutBuffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          const portMatch = trimmed.match(/opencode server listening on http:\/\/.+:(\d+)/i)
          if (portMatch && !descriptor.port) {
            const port = parseInt(portMatch[1], 10)
            descriptor.port = port
          }
        }
      })

      child.stderr?.on("data", (data: Buffer) => {
        // stderr from opencode
      })

      child.on("error", (err) => {
        descriptor.status = "error"
        descriptor.error = err.message
        this.events.emit("workspace:error", descriptor)
        this.processes.delete(id)
      })

      child.on("exit", (code) => {
        const wasReady = descriptor.status === "ready"
        descriptor.status = code === 0 || wasReady ? "stopped" : "error"
        if (!wasReady) descriptor.port = undefined
        descriptor.updatedAt = new Date().toISOString()
        if (code !== 0 && !descriptor.error && !wasReady) {
          descriptor.error = `Process exited with code ${code}`
        }
        this.events.emit("workspace:stopped", descriptor)
        this.processes.delete(id)
      })

      // Wait for port
      await this.waitForPort(descriptor)
      if (descriptor.error) throw new Error(descriptor.error)
      await this.delay(STARTUP_STABILITY_DELAY_MS)
      descriptor.status = "ready"

      return descriptor
    } catch (error) {
      descriptor.status = "error"
      descriptor.error = error instanceof Error ? error.message : String(error)
      this.events.emit("workspace:error", descriptor)
      throw error
    }
  }

  async stop(id: string): Promise<void> {
    const child = this.processes.get(id)
    if (!child) return

    return new Promise((resolve) => {
      child.once("exit", () => resolve())
      child.kill("SIGTERM")
      setTimeout(() => {
        if (this.processes.has(id)) {
          child.kill("SIGKILL")
        }
        resolve()
      }, 3000)
    })
  }

  async shutdown() {
    const ids = Array.from(this.processes.keys())
    await Promise.allSettled(ids.map((id) => this.stop(id)))
    this.workspaces.clear()
  }

  private async waitForPort(descriptor: WorkspaceDescriptor, timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (descriptor.port) return
      if (descriptor.error) throw new Error(descriptor.error)
      await this.delay(200)
    }

    if (!descriptor.port) {
      throw new Error(descriptor.error || `Workspace failed to start within ${timeoutMs}ms`)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
