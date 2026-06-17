import { Router, Request, Response } from "express"
import type { WorkspaceManager } from "../workspaces/manager"
import type { BackgroundProcessManager } from "../background-processes/manager"

export function opencodeRouter(
  workspaceManager: WorkspaceManager,
  bgProcessManager: BackgroundProcessManager,
) {
  const router = Router()

  // ── Workspaces ──

  router.get("/workspaces", (_req, res) => {
    res.json({ workspaces: workspaceManager.list() })
  })

  router.post("/workspaces", async (req, res) => {
    try {
      const { folder, name } = req.body
      if (!folder) return res.status(400).json({ error: "folder is required" })
      const binaryPath = req.body.binaryPath || process.env.OPENCODE_PATH || "opencode"
      const workspace = await workspaceManager.create({ folder, name, binaryPath })
      res.json(workspace)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  router.get("/workspaces/summary", (_req, res) => {
    const all = workspaceManager.list()
    res.json({
      total: all.length,
      ready: all.filter(w => w.status === 'ready').length,
      starting: all.filter(w => w.status === 'starting').length,
      error: all.filter(w => w.status === 'error').length,
      workspaces: all.map(w => ({
        id: w.id,
        path: w.path,
        name: w.name,
        status: w.status,
        port: w.port,
        pid: w.pid,
        binaryPath: w.binaryPath,
        error: w.error,
        createdAt: w.createdAt,
      })),
    })
  })

  router.get("/workspaces/:id", (req, res) => {
    const ws = workspaceManager.get(req.params.id)
    if (!ws) return res.status(404).json({ error: "Workspace not found" })
    res.json(ws)
  })

  router.post("/workspaces/:id/stop", async (req, res) => {
    try {
      await workspaceManager.stop(req.params.id)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // ── Plugin Events (SSE for plugin → server) ──

  router.get("/workspaces/:id/plugin/events", (req: Request, res: Response) => {
    const ws = workspaceManager.get(req.params.id)
    if (!ws) return res.status(404).json({ error: "Workspace not found" })

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })

    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: "sahayak.ping", properties: { ts: Date.now() } })}\n\n`)
    }, 15000)

    req.on("close", () => {
      clearInterval(heartbeat)
    })
  })

  router.post("/workspaces/:id/plugin/event", (req, res) => {
    const ws = workspaceManager.get(req.params.id)
    if (!ws) return res.status(404).json({ error: "Workspace not found" })

    const event = req.body
    console.log("[opencode] plugin event:", event?.type, event?.properties)
    res.status(204).end()
  })

  // ── Background Processes ──

  router.get("/workspaces/:id/plugin/background-processes", (req, res) => {
    res.json({ processes: bgProcessManager.list() })
  })

  router.post("/workspaces/:id/plugin/background-processes", async (req, res) => {
    try {
      const { title, command } = req.body
      if (!title || !command) return res.status(400).json({ error: "title and command required" })
      const ws = workspaceManager.get(req.params.id)
      const cwd = ws?.path || process.cwd()
      const proc = await bgProcessManager.create(title, command, cwd)
      res.json(proc)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  router.post("/workspaces/:id/plugin/background-processes/:pid/stop", async (req, res) => {
    try {
      const proc = await bgProcessManager.stop(req.params.pid)
      res.json(proc)
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  router.post("/workspaces/:id/plugin/background-processes/:pid/terminate", async (req, res) => {
    try {
      await bgProcessManager.terminate(req.params.pid)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  router.get("/workspaces/:id/plugin/background-processes/:pid/output", (req, res) => {
    try {
      const method = (req.query.method as "full" | "head" | "tail" | "grep") || "full"
      const pattern = req.query.pattern as string | undefined
      const lines = req.query.lines ? parseInt(req.query.lines as string, 10) : undefined
      const output = bgProcessManager.readOutput(req.params.pid, method, pattern, lines)
      res.json({ id: req.params.pid, ...output })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  return router
}
