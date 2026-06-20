import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import fileUpload from 'express-fileupload'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { initDb } from '@sahayak/shared/db'
import { DEFAULT_VAULT_PATH, DEFAULT_SKILLS_DIR } from '@sahayak/shared'
import { resolve } from 'path'
import { homedir } from 'os'
import { authMiddleware, setServerPassword } from './auth'
import { chatRouter } from './routes/chat'
import { modelsRouter } from './routes/models'
import { settingsRouter } from './routes/settings'
import { sidecarsRouter } from './routes/sidecars'
import { ttsRouter } from './routes/tts'
import { systemRouter } from './routes/system'
import { createProxyMiddleware } from './proxy'
import { handleTerminalConnection } from './terminal'
import { handleSSHTerminalConnection } from './ssh-terminal'
import { collectSystemMetrics, getLatestMetrics } from './services'
import { skillsRouter } from './routes/skills'
import { agentsRouter } from './routes/agents'
import { cronRouter } from './routes/cron'
import { knowledgeRouter } from './routes/knowledge'
import { vaultRouter } from './routes/vault'
import { geminiRouter } from './routes/gemini'
import { googleRouter } from './routes/google'
import { createGeminiBrowser } from './services/gemini'
import { loadCronJobs, stopAllJobs } from './cron'
import { watchSkills } from './services/skills-watcher'
import { ensureVaultDir, watchVault } from './services/vault'
import { createVoiceService } from './services/voice'
import { startVoiceSidecar } from './presets/voice'
import { stopSidecar } from './sidecar'
import { WorkspaceManager } from './workspaces/manager'
import { BackgroundProcessManager } from './background-processes/manager'
import { opencodeRouter } from './routes/opencode'
import { PreviewManager } from './previews/manager'
import { previewRouter, createPreviewProxy } from './routes/previews'
import { worktreeRouter } from './routes/worktrees'
import { resourcesRouter } from './routes/resources'

export interface ServerOptions {
  port: number
  password?: string
  staticDir?: string
  aiEndpoint?: string
  vaultPath?: string
  skillsDir?: string
  voiceEnabled?: boolean
}

export async function createSahayakServer(opts: ServerOptions) {
  if (opts.aiEndpoint) {
    process.env.SAHAYAK_AI_ENDPOINT = opts.aiEndpoint
  }
  if (opts.password) {
    setServerPassword(opts.password)
  }

  // Initialize database with schema
  initDb()

  const vaultPath = resolve(
    (opts.vaultPath || process.env.SAHAYAK_VAULT_PATH || DEFAULT_VAULT_PATH).replace(/^~/, homedir()),
  )
  const skillsDir = resolve(opts.skillsDir || process.env.SAHAYAK_SKILLS_DIR || DEFAULT_SKILLS_DIR)
  const aiEndpoint = process.env.SAHAYAK_AI_ENDPOINT || 'http://localhost:8080'

  // Ensure vault directory exists
  ensureVaultDir({ path: vaultPath })

  // Start voice sidecar
  let voiceEndpoint: string | undefined
  if (opts.voiceEnabled !== false) {
    const voiceSc = await startVoiceSidecar()
    if (voiceSc) {
      voiceEndpoint = `http://localhost:${voiceSc.port}`
    }
  }

  // Initialize voice service
  const voiceService = createVoiceService({
    voiceEndpoint,
    aiEndpoint,
  })

  // Store vault path globally for route access
  process.env.SAHAYAK_VAULT_PATH = vaultPath

  const app = express()
  const httpServer = createServer(app)

  app.use(cors())
  app.use(cookieParser())
  app.use(express.json({ limit: '10mb' }))
  app.use(fileUpload())
  app.use(authMiddleware)

  // OpenCode workspace manager & background processes
  const workspaceManager = new WorkspaceManager(`http://localhost:${opts.port}`)
  const bgProcessManager = new BackgroundProcessManager()

  // API routes
  app.use('/api/chat', chatRouter(workspaceManager))
  app.use('/api/models', modelsRouter())
  app.use('/api/settings', settingsRouter())
  app.use('/api/sidecars', sidecarsRouter())
  app.use('/api/tts', ttsRouter(voiceService))
  app.use('/api/system', systemRouter())
  app.use('/api/skills', skillsRouter())
  app.use('/api/agents', agentsRouter())
  app.use('/api/cron', cronRouter())
  app.use('/api/knowledge', knowledgeRouter())
  app.use('/api/vault', vaultRouter())
  app.use('/api/gemini', geminiRouter({ createBrowser: createGeminiBrowser }))
  app.use('/api/google', googleRouter())
  app.use('/api/opencode', opencodeRouter(workspaceManager, bgProcessManager))

  // Preview system
  const previewManager = new PreviewManager()
  app.use(previewRouter(previewManager))
  app.use('/previews', createPreviewProxy(previewManager))

  // Git worktree routes
  app.use(worktreeRouter())

  // Resource Hub routes (pass bgProcessManager for graphify)
  app.use('/api/resources', resourcesRouter(bgProcessManager))

  // Sidecar proxy
  app.use('/sidecar/:id', createProxyMiddleware())

  // Login page (simple form for server mode)
  app.get('/login', (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Sahayak - Login</title>
      <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0f0f0f;color:#fff}form{background:#1a1a1a;padding:2rem;border-radius:8px;width:320px}input{width:100%;padding:8px;margin:8px 0;background:#2a2a2a;border:1px solid #333;color:#fff;border-radius:4px}button{width:100%;padding:8px;background:#3b82f6;border:none;color:#fff;border-radius:4px;cursor:pointer}</style>
      </head><body>
      <form method="POST" action="/api/login">
        <h2>Sahayak</h2>
        <input type="password" name="password" placeholder="Password" required>
        <button type="submit">Enter</button>
      </form></body></html>
    `)
  })

  app.post('/api/login', express.urlencoded({ extended: false }), (req, res) => {
    if (req.body.password === opts.password) {
      res.cookie('sahayak_token', opts.password, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 86400000 * 30,
      })
      return res.redirect('/')
    }
    res.status(401).send('Invalid password')
  })

  // Static UI
  if (opts.staticDir) {
    app.use(express.static(opts.staticDir))
    app.get('*', (_req, res) => {
      res.sendFile(opts.staticDir + '/index.html')
    })
  }

  // WebSocket server
  const wss = new WebSocketServer({ server: httpServer })
  wss.on('connection', (ws, req) => {
    const url = req.url || '/'
    if (url.includes('/ws/terminal')) {
      ;(ws as any).__sahayak_terminal = true
      handleTerminalConnection(ws, url)
    } else if (url.includes('/ws/ssh-terminal/')) {
      ;(ws as any).__sahayak_terminal = true
      handleSSHTerminalConnection(ws, url).catch((e) => {
        console.error('[ws] SSH terminal error:', e.message)
        ws.close()
      })
    } else {
      console.log('[ws] broadcast client connected')
      ws.on('close', () => console.log('[ws] broadcast client disconnected'))
    }
  })

  // Broadcast helper — only send to non-terminal clients
  function broadcast(data: unknown) {
    const msg = JSON.stringify(data)
    wss.clients.forEach((client) => {
      if (client.readyState === 1 && !(client as any).__sahayak_terminal) {
        client.send(msg)
      }
    })
  }

  // Metric collection interval ref, set on start(), cleared on stop()
  let metricInterval: ReturnType<typeof setInterval> | undefined

  return {
    app,
    httpServer,
    wss,
    broadcast,
    voiceService,
    start() {
      // Load cron jobs
      loadCronJobs()

      // Start skills watcher
      watchSkills(skillsDir)

      // Start vault watcher
      watchVault({ path: vaultPath })

      metricInterval = setInterval(async () => {
        try {
          await collectSystemMetrics()
          const latest = await getLatestMetrics()
          broadcast({ type: 'metrics', data: latest })
        } catch (e) {
          console.error('[metrics] collection error:', e)
        }
      }, 5000)

      return new Promise<void>((resolve) => {
        httpServer.listen(opts.port, () => {
          console.log(`Sahayak server running on http://localhost:${opts.port}`)
          resolve()
        })
      })
    },
    async stop() {
      if (metricInterval) clearInterval(metricInterval)
      stopAllJobs()
      stopSidecar('voice')
      bgProcessManager.shutdown()
      await workspaceManager.shutdown()
      wss.close()
      httpServer.close()
    },
  }
}

export { createLocalAIClient } from './localai'
