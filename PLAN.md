# Sahayak — AI Desktop Workspace

> **Vision**: Transform a terminal tool into a premium desktop workspace — voice-first AI assistant, agent automation, project knowledge graphs, system monitoring, and online research — all powered by LocalAI locally.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Feature Breakdown](#feature-breakdown-by-page)
5. [Data Model](#data-model-sqlite)
6. [IPC API](#ipc-api-main--renderer)
7. [Implementation Phases](#implementation-phases)
8. [Key Design Decisions](#key-design-decisions)
9. [Post-Mortem: LocalAI Jarvis Integration](#post-mortem-localai-jarvis-integration)
10. [Getting Started](#getting-started)

---

## Architecture Overview

Sahayak follows the **server + UI + desktop shell** pattern used by CodeNomad. The UI can run as a desktop app (Electron) or in a browser (server mode).

```
┌────────────────────────────────────────────────────────────────┐
│                      Sahayak Desktop                          │
│                                                                │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  │
│  │     Electron Shell       │  │     Browser (Server)     │  │
│  │  (packages/desktop)      │  │  (packages/server)       │  │
│  │                          │  │                          │  │
│  │  - System tray           │  │  - Express/WS server     │  │
│  │  - Native notifications  │  │  - Auth (password)       │  │
│  │  - File dialogs          │  │  - OpenCode proxy        │  │
│  │  - Window management     │  │  - Remote access         │  │
│  │  - Auto updater          │  │  - WebSocket events      │  │
│  └──────────┬───────────────┘  └──────────┬───────────────┘  │
│             │                              │                  │
│             └──────────┬───────────────────┘                  │
│                        ▼                                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                  UI Layer (SolidJS)                     │  │
│  │  (packages/ui — reusable, works in Electron + browser) │  │
│  │                                                        │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────┐ │  │
│  │  │ Chat   │ │ Jarvis │ │ Agent  │ │Terminal│ │Dashboard│  │  │
│  │  │ +Voice │ │ Overlay│ │ +Cron  │ │+xterm  │ │+Monitor│  │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └──────┘ │  │
│  │  ┌────────┐ ┌──────────┐ ┌────────┐                   │  │
│  │  │Research│ │Knowledge │ │SideCars│                   │  │
│  │  │+Gemini │ │+Graphify │ │VSCode… │                   │  │
│  │  └────────┘ └──────────┘ └────────┘                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                           │                                   │
│                           ▼                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                  Service Layer                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │ LocalAI  │ │ OpenCode │ │  MCP     │ │  Cron    │ │  │
│  │  │ API Clnt │ │ Proxy    │ │ Runner   │ │ Scheduler│ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │ Graphify │ │Playwright│ │ System   │ │ Python   │ │  │
│  │  │ (MCP)    │ │ (Browser)│ │ Monitor  │ │ Bridge   │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────────┐
        ▼                  ▼                      ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  LocalAI     │  │  Graphify    │  │  Playwright      │
│  (localhost) │  │  MCP Server  │  │  Headless Chrome │
│  - Chat      │  │  - Query     │  │  - Scrape        │
│  - Voice     │  │  - Path      │  │  - Screenshot    │
│  - TTS/STT   │  │  - Explain   │  │  - PDF gen       │
│  - Embed     │  │  - Graph     │  └──────────────────┘
│  - Realtime  │  └──────────────┘
└──────────────┘
```

### Dual Mode: Desktop + Server

Sahayak runs in **two modes**, same codebase:

| Mode | How | When |
|---|---|---|
| **Desktop** | Electron wraps the UI | Development, local daily use |
| **Server** | Express serves the UI + API | Remote access, CI, team sharing |

```
# Desktop mode (default)
sahayak                        # Opens Electron window

# Server mode
sahayak server --port 9090 --password mypass
# → Access at http://localhost:9090 in any browser
# → Or via sahayak:// protocol handler for native feel
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **UI framework** | **SolidJS** (like CodeNomad) | Faster than React, smaller bundles, same JSX ergonomics |
| **Desktop shell** | **Electron** | System tray, cron, notifications, native dialogs, auto-updater |
| **UI toolkit** | **Tailwind CSS + shadcn/ui** | Premium look, fast iteration, works in both modes |
| **Server** | **Express + ws** | Lightweight HTTP + WebSocket for server mode |
| **State** | **Zustand** | Lightweight, TS-native, works in SolidJS too |
| **Terminal** | **xterm.js + node-pty** | VS Code-grade terminal emulator |
| **Voice** | **WebRTC + Web Speech API** | LocalAI realtime API for WebRTC, SpeechRecognition/SpeechSynthesis fallback |
| **DB** | **SQLite via better-sqlite3 + Drizzle ORM** | Local-first, zero setup, shared between modes |
| **Vector store** | **sqlite-vec** | Local vector search for memory + RAG |
| **Cron** | **node-cron** | Morning digest, scheduled agent jobs |
| **System monitor** | **systeminformation** | RAM, CPU, disk, network |
| **AI backend** | **LocalAI** | Runs locally, OpenAI-compatible, realtime voice |
| **Browser automation** | **Playwright** | Gemini online research, web scraping |
| **Knowledge graphs** | **Graphify (MCP client)** | Consume graphify MCP server instead of subprocess |
| **Python bridge** | **child_process spawn** | Run graphify build, embedding scripts |

---

## Project Structure

```
sahayak/
├── package.json                # Root workspace config
├── packages/
│   ├── ui/                     # SolidJS UI (runs in Electron + browser)
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── routes.tsx
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Chat.tsx
│   │   │   │   ├── Jarvis.tsx
│   │   │   │   ├── Agent.tsx
│   │   │   │   ├── Terminal.tsx
│   │   │   │   ├── Knowledge.tsx
│   │   │   │   ├── Monitor.tsx
│   │   │   │   └── Research.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/             # shadcn primitives
│   │   │   │   ├── layout/
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── TopBar.tsx
│   │   │   │   │   └── StatusBar.tsx
│   │   │   │   ├── chat/
│   │   │   │   ├── jarvis/
│   │   │   │   ├── agent/
│   │   │   │   ├── knowledge/
│   │   │   │   └── dashboard/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   └── package.json
│   │
│   ├── server/                  # Express server for server mode
│   │   ├── src/
│   │   │   ├── index.ts          # Server entry
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts       # Password auth
│   │   │   │   ├── api.ts        # REST API proxies
│   │   │   │   ├── proxy.ts      # OpenCode proxy
│   │   │   │   └── sidecars.ts   # SideCar reverse proxy
│   │   │   ├── ws.ts             # WebSocket for streaming + terminal
│   │   │   ├── auth.ts           # Auth middleware (password, token)
│   │   │   └── middleware.ts
│   │   └── package.json
│   │
│   ├── desktop/                 # Electron shell
│   │   ├── src/
│   │   │   ├── main.ts           # App entry, window, tray
│   │   │   ├── preload.ts        # contextBridge API
│   │   │   ├── tray.ts           # System tray
│   │   │   ├── window.ts         # Window management
│   │   │   ├── updater.ts        # Auto-updater
│   │   │   └── services/
│   │   │       ├── monitor.ts
│   │   │       ├── cron.ts
│   │   │       ├── mcp-runner.ts
│   │   │       ├── terminal.ts
│   │   │       ├── notification.ts
│   │   │       └── python.ts
│   │   └── package.json
│   │
│   └── shared/                  # Shared types, utilities, DB schema
│       ├── src/
│       │   ├── db/
│       │   │   ├── schema.ts     # Drizzle schema
│       │   │   ├── migrations/
│       │   │   └── index.ts
│       │   ├── types.ts          # Shared TypeScript types
│       │   └── constants.ts
│       └── package.json
│
├── python/
│   ├── graphify/                # Graphify wrapper script
│   ├── embeddings/              # Local embedding pipeline
│   └── requirements.txt
│
├── resources/
│   ├── icon.png
│   ├── tray-icon.png
│   └── sounds/
│
├── electron-builder.yml
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── README.md
```

---

## Feature Breakdown by Page

### 1. Dashboard (`/dashboard`)
- **System health cards**: RAM usage gauge, CPU load, disk space, network throughput
- **Morning digest**: AI-generated summary of system state, recent agent activity, upcoming cron jobs, read aloud via TTS
- **Recent activity**: Last messages, agent runs, research sessions
- **Quick actions**: New chat, run agent, start research, open terminal
- **Active OpenCode sessions**: Sessions managed by Sahayak, with status

### 2. Chat (`/chat`)
- Full chat UI with streaming, markdown rendering, code blocks
- Message persistence in SQLite sessions
- Multi-model support via LocalAI
- **Voice input**: Mic button in composer → STT (browser SpeechRecognition + LocalAI Whisper) → fills text input
- **TTS**: Read assistant responses aloud via LocalAI TTS or browser SpeechSynthesis
- **Context memory**: RAG over project's knowledge graph (via Graphify)
- **git worktrees**: Each session can be associated with a git worktree (inspired by CodeNomad)

### 3. Jarvis Voice (`/jarvis`)
- Ported from LocalAI React UI (`useJarvis` hook + `JarvisOverlay`)
- WebRTC realtime voice conversation with LocalAI
- Animated orb status indicator
- Push-to-talk, VAD, and text fallback modes
- Floating overlay accessible from any page (Ctrl+Space)

### 4. Agent (`/agent`)
- **Skill library**: Browse, enable, configure skills (Python/TS scripts, MCP servers)
- **Memory viewer**: Vector search over agent's persistent memory (SQLite + sqlite-vec)
- **Cron jobs**: Schedule agent runs (morning digest, hourly checks, etc.)
- **MCP CI jobs**: Run agent tasks against MCP servers, view results
- **Active sessions**: See running/interactive agent sessions
- **OpenCode hook**: Agents can invoke OpenCode for coding tasks

### 5. Terminal (`/terminal`)
- Split-panel terminal with xterm.js + node-pty
- Multiple tabs/sessions
- **OpenCode as a SideCar**: OpenCode runs as a proxied subprocess (CodeNomad pattern)
- AI command suggestions via LocalAI inline
- SSH session management

### 6. SideCars (`/sidecars`)
- Inspired by CodeNomad's SideCar system
- Embed local web tools as tabs within Sahayak
- **Built-in**: OpenCode terminal, file browser
- **User-configured**: VSCode Server, Jupyter, ttyd, any local web service
- Reverse proxy mounts them under `/sidecars/:id`

### 7. Knowledge (`/knowledge`)
- **Project load**: Select a project directory → run `graphify extract` → store in SQLite
- **Graph visualization**: Interactive force-directed graph (d3.js or vis-network)
- **Vector search**: Semantic search over indexed project files
- **Session memory**: Chat sessions stored per-project with embeddings
- **Graphify MCP server**: Expose the graph as an MCP server for AI assistants
- **Auto-rebuild**: Git hooks or file watchers re-extract on changes

### 8. Monitor (`/monitor`)
- Real-time CPU, RAM, disk, network graphs (systeminformation)
- Process list with resource usage
- Configurable alerts (RAM > 90%, disk space low)
- Historical data (rolling 24h in SQLite)
- GPU stats (nvidia-smi or AMD equivalent)

### 9. Research (`/research`)
- Web research via Playwright + Gemini
- Query → Playwright scrapes top N pages → feeds to Gemini API → structured answer
- Session history with source citations
- Full-page screenshots stored locally
- Export as markdown/PDF

---

## Data Model (SQLite)

```typescript
// packages/shared/src/db/schema.ts

// ── Chat ──
messages: {
  id: string
  sessionId: string          // FK → sessions.id
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result'
  content: string
  model: string
  tokens: number
  metadata: JSON
  createdAt: Date
}

sessions: {
  id: string
  name: string
  projectId: string | null   // FK → projects.id
  model: string
  systemPrompt: string
  tokenUsage: JSON            // { prompt, completion, total }
  worktreePath: string | null // git worktree for this session
  createdAt: Date
  updatedAt: Date
}

// ── Agent ──
agent_runs: {
  id: string
  skillId: string
  status: 'running' | 'completed' | 'failed'
  input: JSON
  output: JSON | null
  tokens: number
  startedAt: Date
  completedAt: Date | null
}

agent_memory: {
  id: string
  key: string
  value: string
  embedding: Float32Array
  metadata: JSON
  createdAt: Date
}

cron_jobs: {
  id: string
  name: string
  expression: string
  action: 'digest' | 'agent' | 'research' | 'custom'
  config: JSON
  enabled: boolean
  lastRun: Date | null
  nextRun: Date | null
}

// ── Knowledge ──
projects: {
  id: string
  path: string
  name: string
  language: string
  lastIndexedAt: Date | null
}

knowledge_nodes: {
  id: string
  projectId: string
  label: string
  type: string
  content: string
  embedding: Float32Array
  metadata: JSON
  createdAt: Date
}

knowledge_edges: {
  id: string
  sourceId: string
  targetId: string
  relation: string
}

// ── System ──
system_metrics: {
  id: string
  timestamp: Date
  cpu: number
  ramUsed: number
  ramTotal: number
  diskUsed: number
  diskTotal: number
  networkRx: number
  networkTx: number
}

// ── Research ──
research_sessions: {
  id: string
  query: string
  result: string
  sources: JSON
  screenshots: JSON
  tokens: number
  createdAt: Date
}

// ── Settings ──
settings: {
  key: string                 // primary key
  value: JSON
  updatedAt: Date
}

// ── SideCars ──
sidecars: {
  id: string
  name: string
  port: number
  basePath: string
  prefixMode: 'preserve' | 'strip'
  enabled: boolean
}
```

---

## IPC API (Main ↔ Renderer)

In Electron mode, this is exposed via `contextBridge`. In server mode, the same API runs over WebSocket/REST.

```
// Electron: window.electronAPI
// Server:   fetch('/api/...') or WebSocket

monitor:
  getSystemInfo()             → { cpu, ram, disk, network, gpu? }
  subscribeMetrics(callback)  → unsub function (every 2s)
  getMetricHistory(hours)     → system_metrics[]

terminal:
  createSession(id, cwd)     → pid
  writeInput(id, data)       → void
  onData(id, callback)       → unsub (WebSocket in server mode)
  resize(id, cols, rows)     → void
  killSession(id)            → void

cron:
  addJob(job)                → jobId
  removeJob(id)              → void
  getJobs()                  → cron_jobs[]
  toggleJob(id, enabled)     → void

files:
  selectDirectory()          → string | null
  readFile(path)             → string
  writeFile(path, content)   → void
  fileExists(path)           → boolean
  selectFile(filters)        → string | null

python:
  runGraphify(projectPath)   → { nodes, edges, report }
  runGraphifyQuery(query)    → GraphResult
  runEmbedding(texts)        → Float32Array[]

localai:
  getModels()                → model[]
  getConfig()                → config
  checkHealth()              → boolean
  getPipelineModels()        → pipelineModel[]

opencode:
  startSession(cwd)          → sessionId
  stopSession(id)            → void
  listSessions()             → session[]
  proxyPort(sessionId)       → port number (for SideCar)

sidecars:
  register(config)           → sidecarId
  unregister(id)             → void
  list()                     → sidecar[]
  getStatus(id)              → { running, port }

window:
  minimize()
  maximize()
  close()
  isMaximized()              → boolean
  onMaximizeChange(callback) → unsub
  setTitle(title)            → void

notifications:
  show(title, body)          → void
  schedule(time, title, body)→ notificationId

research:
  startResearch(query)       → researchId
  getStatus(id)              → { status, progress }
  getResult(id)              → research_sessions
  listSessions()             → research_sessions[]
```

---

## Implementation Phases

### Phase 1 — Monorepo Scaffold (Week 1)
- [ ] pnpm workspace with 4 packages: `ui`, `server`, `desktop`, `shared`
- [ ] Vite + SolidJS + Tailwind + shadcn/ui in `packages/ui`
- [ ] Drizzle ORM schema + SQLite migrations in `packages/shared`
- [ ] Express server + WebSocket in `packages/server`
- [ ] Electron shell in `packages/desktop` (window, tray, preload)
- [ ] Dual entry: `sahayak` (desktop) and `sahayak server` (browser)
- [ ] Dark/light theme, sidebar routing, keyboard shortcuts
- [ ] **Outcome**: Skeleton app runs in both Electron and browser

### Phase 2 — Core Chat + Voice (Week 2)
- [ ] LocalAI API client (chat completions, streaming, models)
- [ ] Chat UI: message list, composer, markdown rendering, code blocks
- [ ] Session persistence in SQLite
- [ ] Model selector with pipeline-aware model list
- [ ] Port `useJarvis` hook + WebRTC realtime voice
- [ ] TTS for assistant responses (LocalAI TTS + Web Speech fallback)
- [ ] **Outcome**: Full chat with voice, sessions persist across restarts

### Phase 3 — Terminal + SideCars + Monitor (Week 3)
- [ ] xterm.js + node-pty in `packages/desktop` (Electron) and `packages/server` (WebSocket)
- [ ] Multi-tab terminal with split panels
- [ ] OpenCode SideCar: proxy OpenCode CLI as a tab
- [ ] SideCar registry UI + reverse proxy
- [ ] System monitoring (CPU, RAM, disk, network) via `systeminformation`
- [ ] Real-time metric graphs in Dashboard
- [ ] **Outcome**: Terminal + system monitor + SideCars (VSCode, OpenCode, etc.)

### Phase 4 — Agent + Cron (Week 4)
- [ ] Agent runner: execute Python/TS skills, collect structured results
- [ ] Skill library UI: browse, enable, configure, install from URL
- [ ] Agent memory store with sqlite-vec vector search
- [ ] Cron job scheduler with UI (morning digest, hourly checks)
- [ ] MCP CI job runner (spawn MCP tasks, view streaming results)
- [ ] **Outcome**: Agent runs on cron, skills are swappable, memory persists

### Phase 5 — Knowledge Graph (Week 5)
- [ ] Project loader: native directory picker → run `graphify extract`
- [ ] Graph visualization: interactive d3.js/vis-network force graph
- [ ] Vector search over project knowledge nodes
- [ ] Per-project chat session memory
- [ ] Graphify MCP server: expose graph via MCP for AI assistant integration
- [ ] Auto-rebuild on file change (chokidar watcher + git hook)
- [ ] **Outcome**: Load any project, get a queryable knowledge graph

### Phase 6 — Research + Desktop Polish (Week 6)
- [ ] Playwright browser automation for research
- [ ] Gemini research pipeline: scrape → LLM analyze → structured answer
- [ ] Research session history with citations + screenshots
- [ ] Morning digest: system state + recent activity + TTS narration
- [ ] System alerts (high RAM, low disk, agent failures)
- [ ] Auto-updater (electron-updater)
- [ ] Build config: macOS .dmg, Windows .exe, Linux .AppImage
- [ ] **Outcome**: Shipping desktop app with all features

---

## Key Design Decisions

### Why Electron, not Tauri
Tauri is lighter, but Rust slows iteration for a UI-heavy workspace with terminal, voice, and browser automation. Electron's ecosystem has battle-tested solutions for all our requirements. Bundle size is not critical for a desktop productivity app. If bundle size becomes a concern later, add a Tauri shell as an alternative (CodeNomad does this).

### Why SQLite, not PostgreSQL
Zero setup. Local-first. The user should not need to install a database server. SQLite handles everything: chat history, agent memory, system metrics, project knowledge. `better-sqlite3` is synchronous and fast. `sqlite-vec` adds vector search in-process.

### Why SolidJS over React
Learning from CodeNomad: SolidJS compiles to vanilla JS, producing smaller bundles and faster runtime. The JSX is nearly identical. Sahayak's UI is not a port from LocalAI (that was the old approach) — it is a ground-up build. SolidJS is the right choice for a new project.

### Why Graphify as MCP Server, not subprocess
Graphify ships an MCP stdio server (`python -m graphify.serve`). Rather than parsing CLI output, Sahayak spawns the MCP server and communicates via JSON-RPC. This is cleaner, supports streaming queries, and lets the graph stay warm in memory for repeated lookups.

### Why LocalAI as an external service
LocalAI is already installed and running. Sahayak treats it as a local server (localhost:8080). No embedding of the backend. This means Sahayak is just a client — it works with any OpenAI-compatible endpoint. Users with OpenAI/Anthropic keys can use those too.

### Why a separate server package
Unlike a pure Electron app, server mode allows:
- Remote access from any device on the LAN
- Running on a headless server with GPU
- CI/CD integration (agents run without a display)
- Team sharing (one machine serves the workspace)

### Why OpenCode as a SideCar, not embedded
OpenCode is a separate CLI tool. Sahayak manages its lifecycle (spawn, proxy terminal, collect output). This keeps Sahayak decoupled from OpenCode's internals. Same approach as CodeNomad: `opencode` stays in PATH, Sahayak wraps it.

---

## Post-Mortem: LocalAI Jarvis Integration

The LocalAI Jarvis integration (voice into Chat page) taught us several things that informed Sahayak's design:

### What worked in the LocalAI integration
- **Inline panel > floating overlay**: Keeping Jarvis in the page layout (between messages and input) feels more integrated than a floating overlay.
- **Voice chip in mode chips**: Toggling voice on/off alongside Canvas and MCP modes feels natural.
- **useJarvis hook is portable**: The WebRTC + transcript state machine is clean enough to port to any UI framework.

### What to do differently in Sahayak
- **SolidJS, not React**: LocalAI uses React. For Sahayak, SolidJS is faster and compiles smaller. The `useJarvis` hook becomes `createJarvis` (SolidJS signal pattern).
- **Voice as a service, not a component**: Jarvis should run as a singleton service (connected to WebRTC once), accessible from both Chat and the global overlay, not as separate hook instances.
- **Unified audio pipeline**: Voice input (mic → STT), TTS output, and WebRTC realtime should share one audio context to avoid device conflicts.
- **No App-level jarvis**: The floating overlay pattern (App.jsx renders JarvisOverlay) was fragile. Sahayak's Jarvis is a page-level feature that can also float when requested.

---

## Getting Started

```bash
# Prerequisites
brew install node pnpm
# LocalAI running on localhost:8080 (or set SAHAYAK_AI_ENDPOINT)
# OpenCode CLI in PATH (optional, for SideCar mode)

# Clone and install
git clone <repo> sahayak
cd sahayak
pnpm install

# Generate SQLite schema
pnpm db:push

# Desktop mode
pnpm dev:desktop

# Server mode (browser)
pnpm dev:server --port 9090

# Production build
pnpm build
pnpm package:mac

# Quick start with default config
sahayak
```
