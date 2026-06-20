import { createEffect, createSignal, For, Show, onMount, onCleanup, createResource, Switch, Match } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { useChatStore, loadSessions, createSession, selectSession, renameSession, sendMessage as storeSendMessage, sendGeminiMessage, sendPermissionResponse, toggleAutoAccept, syncAutoAccept, abortStream, setAttachedResources as storeSetAttachedResources } from '../stores/chat'
import type { ResourceAttachment, StoredAttachment } from '../stores/chat'
import { api } from '../lib/api-client'

const CHAT_SIDEBAR_KEY = 'sahayak:chat-sidebar-open'

function loadChatSidebarState(): boolean {
  try {
    const saved = localStorage.getItem(CHAT_SIDEBAR_KEY)
    if (saved === 'true') return true
    if (saved === 'false') return false
  } catch {}
  return true
}

function saveChatSidebarState(open: boolean) {
  try {
    localStorage.setItem(CHAT_SIDEBAR_KEY, String(open))
  } catch {}
}
import { ChatMessage } from '../components/chat/ChatMessage'
import { Composer } from '../components/chat/Composer'
import { ModelSelector } from '../components/chat/ModelSelector'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { ResourceModal } from '../components/chat/ResourceModal'
import { GitTree } from '../components/resources/GitTree'
import { AgentPlan } from '../components/agent/agent-plan'
import { QuestionTool } from '../components/agent/question-tool'
import { PermissionNotificationBanner } from '../components/permission/permission-notification-banner'
import { PermissionApprovalModal } from '../components/permission/permission-approval-modal'
import { Plus, MessageSquare, PanelLeft, Trash2, Edit3, RefreshCw, Sparkles, FolderKanban, GitBranch, ChevronDown, X, ListChecks } from 'lucide-solid'

export function ChatPage() {
  const params = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const { state, setState } = useChatStore()
  const [model, setModel] = createSignal('opencode')
  const modelLocked = () => state.messages.length > 0
  const [geminiFiles, setGeminiFiles] = createSignal<StoredAttachment[]>([])
  const [_systemPrompt, _setSystemPrompt] = createSignal('')
  const [sidebarOpen, setSidebarOpen] = createSignal(loadChatSidebarState())

  createEffect(() => {
    saveChatSidebarState(sidebarOpen())
  })
  const [renamingSessionId, setRenamingSessionId] = createSignal<string | null>(null)
  const [renameValue, setRenameValue] = createSignal('')
  const [resourceModalOpen, setResourceModalOpen] = createSignal(false)
  const [gitTreeData, setGitTreeData] = createSignal<{ name: string; data: any } | null>(null)
  const [gitTreeLoading, setGitTreeLoading] = createSignal(false)
  const attachedResources = () => state.attachedResources

  function setSessionResources(resources: ResourceAttachment[] | ((prev: ResourceAttachment[]) => ResourceAttachment[])) {
    if (!state.currentSessionId) return
    storeSetAttachedResources(state.currentSessionId, resources)
  }
  const [overlayCollapsed, setOverlayCollapsed] = createSignal(false)
  const [loadError, setLoadError] = createSignal('')
  const [planData, setPlanData] = createSignal<any[] | null>(null)
  const [planPanelOpen, setPlanPanelOpen] = createSignal(false)
  const [questionData, setQuestionData] = createSignal<any | null>(null)
  const [questionIndex, setQuestionIndex] = createSignal(1)
  const [permissionModalOpen, setPermissionModalOpen] = createSignal(false)
  let sessionsLoaded = false
  let messagesEndRef: HTMLDivElement | undefined
  let messagesContainerRef: HTMLDivElement | undefined
  let navigatingTo = ''
  let wasStreaming = false

  function playFinishTone() {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } catch { /* audio not available */ }
  }

  async function saveToVault(content: string) {
    try {
      const sessionName = state.sessionName || 'Chat Export'
      await api.saveToVault(content, sessionName)
    } catch (e) {
      console.error('[vault] failed to save:', e)
    }
  }

  const [backends] = createResource(() => api.checkBackends())

  const hasOnlineBackend = () => {
    const b = backends()
    return b?.backends?.some((be) => be.status === 'online') ?? false
  }

  async function selectAndRestoreOpencode(id: string) {
    try {
      await selectSession(id)
      api.restoreOpencodeSession(id).catch(() => {})
    } catch (err) {
      console.error('[chat] failed to load session:', err)
      setLoadError('Failed to load session')
    }
  }

  onMount(() => {
    loadSessions().then(async () => {
      sessionsLoaded = true
      const urlId = params.sessionId
      if (urlId && state.sessions.some((s) => s.id === urlId)) {
        await selectAndRestoreOpencode(urlId)
      } else if (state.sessions.length === 0) {
        const id = await createSession()
        navigate(`/chat/${id}`, { replace: true })
      } else if (!state.currentSessionId) {
        await selectAndRestoreOpencode(state.sessions[0].id)
        navigate(`/chat/${state.sessions[0].id}`, { replace: true })
      }
    }).catch((err) => {
      console.error('[chat] failed to load sessions:', err)
      setLoadError('Failed to load sessions')
    })

    const jarvisHandler = (e: CustomEvent<{ text: string }>) => {
      handleSend(e.detail.text)
    }
    window.addEventListener('sahayak:jarvis-send' as any, jarvisHandler as any)
    onCleanup(() => window.removeEventListener('sahayak:jarvis-send' as any, jarvisHandler as any))

    const keyHandler = (e: KeyboardEvent) => {
      const q = state.permissionQueue
      if (q.length === 0) return
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (isInput && e.key !== 'Escape') return
      const active = q[0]
      if (!active) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendPermissionResponse(state.currentSessionId!, active.id, 'once')
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        sendPermissionResponse(state.currentSessionId!, active.id, 'always')
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        sendPermissionResponse(state.currentSessionId!, active.id, 'reject')
      }
    }
    document.addEventListener('keydown', keyHandler)
    onCleanup(() => document.removeEventListener('keydown', keyHandler))
  })

  createEffect(() => {
    if (!sessionsLoaded) return
    const urlId = params.sessionId
    if (!urlId) return
    if (urlId === navigatingTo) return
    if (urlId !== state.currentSessionId && state.sessions.some((s) => s.id === urlId)) {
      setSessionResources([])
      selectAndRestoreOpencode(urlId)
    }
  })

  createEffect(() => {
    if (state.currentSessionId) {
      syncAutoAccept()
    }
  })

  createEffect(() => {
    if (state.messages.length || state.streaming) {
      messagesEndRef?.scrollIntoView({ behavior: 'smooth' })
    }
  })

  createEffect(() => {
    const isStreaming = state.streaming
    if (wasStreaming && !isStreaming) {
      playFinishTone()
    }
    wasStreaming = isStreaming
  })

  // Parse plan JSON from AI responses (live during streaming)
  createEffect(() => {
    if (!state.streaming || !state.streamingContent) return
    const match = state.streamingContent.match(/```json\s*(\{[\s\S]*?"type"\s*:\s*"plan"[\s\S]*?\})\s*```/)
    if (!match) return
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        setPlanData(parsed.tasks)
        setPlanPanelOpen(true)
      }
    } catch { /* ignore */ }
  })

  // Parse question JSON from completed AI responses (not mid-stream)
  createEffect(() => {
    if (state.streaming) return
    const lastMsg = state.messages.length > 0 ? state.messages[state.messages.length - 1].content : ''
    if (!lastMsg) return
    const match = lastMsg.match(/```json\s*(\{[\s\S]*?"type"\s*:\s*"question"[\s\S]*?\})\s*```/)
    if (!match) return
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.questions && Array.isArray(parsed.questions)) {
        setQuestionData(parsed.questions)
        setQuestionIndex(1)
      }
    } catch { /* ignore */ }
  })

  createEffect(() => {
    const sid = state.currentSessionId
    if (sid && state.sessions.length > 0) {
      const session = state.sessions.find(s => s.id === sid)
      if (session?.model && (session.model === 'opencode' || session.model === 'gemini')) {
        setModel(session.model as 'opencode' | 'gemini')
      }
    }
  })

  function handleModelChange(newModel: string) {
    setModel(newModel as 'opencode' | 'gemini')
    const sid = state.currentSessionId
    if (sid) {
      api.updateSession(sid, undefined, newModel).catch(() => {})
      setState('sessions', (s) => s.id === sid, 'model', newModel)
    }
  }

  function handleSend(msg: string) {
    const resources = attachedResources()
    let enriched = msg
    if (resources.length > 0) {
      const ctx = resources.map((r) => {
        if (r.type === 'folder') return `[Resource: folder "${r.name}" at ${r.path} (${r.permissions})]`
        return `[Resource: SSH "${r.name}" at ${r.host} (${r.permissions})]`
      }).join('\n')
      enriched = `${ctx}\n\n${msg}`
    }
    if (model() === 'gemini') {
      const files = geminiFiles()
      sendGeminiMessage(enriched, files.length > 0 ? files : undefined)
      setGeminiFiles([])
    } else {
      storeSendMessage(enriched, model(), _systemPrompt(), resources.length > 0 ? resources : undefined)
    }
  }

  async function handleNewSession() {
    setSessionResources([])
    const id = await createSession(model())
    navigate(`/chat/${id}`)
  }

  async function handleDeleteSession(id: string, e: MouseEvent) {
    e.stopPropagation()
    if (confirm('Delete this session?')) {
      await api.deleteSession(id)
      await loadSessions()
      if (state.currentSessionId === id) {
        setSessionResources([])
        setState('messages', [])
        setState('currentSessionId', null)
        if (state.sessions.length > 0) {
          await selectAndRestoreOpencode(state.sessions[0].id)
          navigate(`/chat/${state.sessions[0].id}`, { replace: true })
        } else {
          navigate('/chat', { replace: true })
        }
      }
    }
  }

  function handleSelectSession(id: string) {
    setSessionResources([])
    navigatingTo = id
    selectAndRestoreOpencode(id).finally(() => {
      if (navigatingTo === id) navigatingTo = ''
    })
    navigate(`/chat/${id}`)
  }

  function openRenameDialog(s: { id: string; name: string }, e: MouseEvent) {
    e.stopPropagation()
    setRenamingSessionId(s.id)
    setRenameValue(s.name)
  }

  async function confirmRename() {
    const id = renamingSessionId()
    if (!id) return
    const name = renameValue().trim()
    if (name && name !== state.sessions.find((s) => s.id === id)?.name) {
      try {
        await renameSession(id, name)
      } catch (err) {
        console.error('[chat] rename failed:', err)
      }
    }
    setRenamingSessionId(null)
  }

  function cancelRename() {
    setRenamingSessionId(null)
  }

  let renameInputEl: HTMLInputElement | undefined

  function setRenameInputRef(el: HTMLInputElement) {
    renameInputEl = el
    el?.focus()
  }

  createEffect(() => {
    if (renamingSessionId()) {
      renameInputEl?.focus()
    }
  })

  function toggleResource(r: ResourceAttachment) {
    const current = attachedResources()
    if (current.some((a) => a.id === r.id)) {
      setSessionResources(current.filter((a) => a.id !== r.id))
    } else {
      setSessionResources([...current, r])
    }
  }

  async function showGitTree() {
    const folders = attachedResources().filter((r) => r.type === 'folder')
    if (folders.length === 0) return
    setGitTreeLoading(true)
    try {
      const data = await api.getGitTree(folders[0].id)
      setGitTreeData({ name: folders[0].name, data })
    } catch (e) {
      setGitTreeData({ name: folders[0].name, data: { isGitRepo: false, branches: [], branchCommits: {}, error: (e as Error).message } })
    }
    setGitTreeLoading(false)
  }

  function handleRenameDialogOpenChange(open: boolean) {
    if (!open) cancelRename()
  }

  function handleRenameInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') confirmRename()
    else if (e.key === 'Escape') cancelRename()
  }

  function isSessionActive(id: string): boolean {
    return state.sessionStates[id]?.streaming ?? false
  }

  function handleStopStream() {
    if (state.currentSessionId) {
      abortStream(state.currentSessionId)
    }
  }

  return (<>
    <Show when={loadError()}>
      <div class="fixed top-0 left-0 right-0 z-50 bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-xs text-destructive text-center">
        {loadError()}
      </div>
    </Show>
    <div class="flex h-full overflow-hidden relative bg-gradient-to-b from-background via-background to-background">
      {/* Animated background orbs */}
      <div class="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div class="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-cyan-500/3 blur-3xl animate-pulse-glow" />
        <div class="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-purple-500/3 blur-3xl animate-pulse-glow" style="animation-delay: 2s" />
      </div>

      {/* Session sidebar */}
      <Show when={sidebarOpen()}>
        <div class="w-60 shrink-0 border-r border-border/50 flex flex-col bg-muted/10 glass-card z-10 relative">
          <div class="p-3 border-b border-border/50">
            <Button
              variant="secondary"
              class="w-full justify-start gap-2 h-9 text-xs font-normal"
              onClick={handleNewSession}
            >
              <Plus class="h-3.5 w-3.5" />
              New chat
            </Button>
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <For each={state.sessions}>
              {(s) => (
                <div
                  class={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-all duration-200 ${
                    state.currentSessionId === s.id
                      ? 'bg-accent/40 text-accent-foreground border border-border/30'
                      : 'hover:bg-muted/30 text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                  onClick={() => handleSelectSession(s.id)}
                >
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <Show when={isSessionActive(s.id)}>
                      <span class="h-2 w-2 shrink-0 rounded-full bg-green-500 animate-pulse" />
                    </Show>
                    <Show when={!isSessionActive(s.id)}>
                      <MessageSquare class="h-3 w-3 shrink-0 opacity-60" />
                    </Show>
                    <span class="truncate">{s.name}</span>
                  </div>
                  <div class="flex items-center gap-0.5 shrink-0">
                    <button
                      class="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground p-0.5"
                      onClick={(e) => openRenameDialog(s, e)}
                      title="Rename"
                    >
                      <Edit3 class="h-3 w-3" />
                    </button>
                    <button
                      class="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive p-0.5"
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      title="Delete"
                    >
                      <Trash2 class="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Main chat area */}
      <div class="flex-1 flex flex-col min-w-0 relative">
        {/* Header bar */}

        <div class="flex items-center justify-between px-4 h-12 border-b border-border/30 shrink-0 bg-background/40 backdrop-blur-xl z-10">
          <div class="flex items-center gap-2">
            <Show when={!sidebarOpen()}>
              <Button variant="ghost" size="icon" class="h-7 w-7" onClick={() => setSidebarOpen(true)} title="Show sidebar">
                <PanelLeft class="h-4 w-4" />
              </Button>
            </Show>
            <Show when={sidebarOpen()}>
              <Button variant="ghost" size="icon" class="h-7 w-7" onClick={() => setSidebarOpen(false)} title="Hide sidebar">
                <PanelLeft class="h-4 w-4" />
              </Button>
            </Show>
            <Show when={state.currentSessionId}>
              <div class="flex flex-col leading-tight">
                <span class="text-sm font-medium text-foreground/80">
                  {state.sessions.find((s) => s.id === state.currentSessionId)?.name || 'Chat'}
                </span>
                <span class="text-[10px] font-mono text-muted-foreground/50">
                  {state.currentSessionId?.slice(0, 8)}…
                </span>
              </div>
            </Show>
          </div>

          <div class="flex items-center gap-3">
            <Show when={attachedResources().length > 0}>
              <span class="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border" style="border-color:var(--accent);color:var(--accent)">
                Project loaded
              </span>
              <Show when={attachedResources().some(r => r.graphifyState)}>
                <span class="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border"
                  style={{
                    'border-color': attachedResources().some(r => r.graphifyState === 'running')
                      ? '#eab308'
                      : attachedResources().every(r => r.graphifyState === 'done')
                        ? 'var(--success, #22c55e)'
                        : 'var(--text-muted, #888)',
                    color: attachedResources().some(r => r.graphifyState === 'running')
                      ? '#eab308'
                      : attachedResources().every(r => r.graphifyState === 'done')
                        ? 'var(--success, #22c55e)'
                        : 'var(--text-muted, #888)',
                  }}>
                  <span class="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: attachedResources().some(r => r.graphifyState === 'running')
                        ? '#eab308'
                        : attachedResources().every(r => r.graphifyState === 'done')
                          ? 'var(--success, #22c55e)'
                          : 'var(--text-muted, #888)',
                    }}
                  />
                  {attachedResources().some(r => r.graphifyState === 'running') ? 'Graphing…' : 'Graph'}
                </span>
              </Show>
            </Show>
            <PermissionNotificationBanner onClick={() => setPermissionModalOpen(true)} />
            <button
              onClick={toggleAutoAccept}
              class={`relative h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors hover:bg-accent ${
                state.autoAcceptEnabled ? 'text-amber-400' : 'text-muted-foreground'
              }`}
              title={state.autoAcceptEnabled ? 'YOLO mode active — permissions auto-approved' : 'YOLO mode off — permissions require approval'}
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="8 12 11 15 16 9"/>
              </svg>
              <Show when={state.autoAcceptEnabled}>
                <span class="absolute -top-0.5 -right-0.5 flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              </Show>
            </button>
            <Button variant="ghost" size="icon" class="h-7 w-7 relative" onClick={() => setResourceModalOpen(true)} title="Attach resources">
              <FolderKanban class="h-4 w-4" />
              <Show when={attachedResources().length > 0}>
                <span class="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold" style="background:var(--accent);color:var(--accent-foreground)">
                  {attachedResources().length}
                </span>
              </Show>
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7" onClick={showGitTree} disabled={gitTreeLoading() || attachedResources().filter((r) => r.type === 'folder').length === 0} title="Git tree">
              <GitBranch class="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" class="h-7 w-7 relative" onClick={() => setPlanPanelOpen(!planPanelOpen())} title="Plan">
              <ListChecks class="h-4 w-4" />
              <Show when={planData() !== null}>
                <span class="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold" style="background:var(--accent);color:var(--accent-foreground)">
                  {planData()?.length || 0}
                </span>
              </Show>
            </Button>

            {/* Backend status */}
            <div class="flex items-center gap-1.5">
              <Switch>
                <Match when={backends.loading}>
                  <RefreshCw class="h-3 w-3 animate-spin text-muted-foreground" />
                </Match>
                <Match when={hasOnlineBackend()}>
                  <>
                    <span class="status-dot online" />
                    <span class="text-xs text-green-600 dark:text-green-400 hidden sm:inline">Connected</span>
                  </>
                </Match>
                <Match when={!hasOnlineBackend() && !backends.loading}>
                  <>
                    <span class="status-dot offline" />
                    <span class="text-xs text-muted-foreground hidden sm:inline">No backend</span>
                  </>
                </Match>
              </Switch>
            </div>
            <ModelSelector value={model()} onChange={handleModelChange} disabled={modelLocked()} />
          </div>
        </div>

        {/* Attached resources banner */}
        <Show when={attachedResources().length > 0}>
          <div class="flex items-center gap-2 px-4 py-1.5 border-b border-border/30 shrink-0" style="background:var(--bg-secondary)">
            <span class="text-[10px] font-medium uppercase tracking-wider" style="color:var(--text-muted)">Resources</span>
            <For each={attachedResources()}>
              {(r) => (
                <button
                  type="button"
                  onClick={() => toggleResource(r)}
                  class="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border transition-colors hover:opacity-70"
                  style="border-color:var(--accent);color:var(--accent)"
                >
                  {r.type === 'ssh' ? '🔗' : '📁'} {r.name}
                  <X class="h-2.5 w-2.5" />
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Messages + Plan panel */}
        <div class="flex-1 flex min-h-0">
          {/* Main column: messages + composer */}
          <div class="flex-1 flex flex-col min-w-0">
            {/* Messages scroll area */}
            <div ref={messagesContainerRef} class="flex-1 overflow-y-auto relative">
              <Show
                when={state.messages.length > 0 || state.streaming}
                fallback={
                  <div class="flex flex-col items-center justify-center h-full select-none">
                    <div class="relative mb-6">
                      <div class="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 flex items-center justify-center">
                        <Sparkles class="h-8 w-8 text-cyan-600/60 dark:text-cyan-400/60" />
                      </div>
                      <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-400/30 blur-sm animate-pulse-glow" />
                    </div>
                    <h2 class="text-lg font-medium liquid-text mb-1">Jarvis Ready</h2>
                    <p class="text-sm text-muted-foreground text-center max-w-xs">
                      Start a conversation or ask me to help with a task.
                    </p>
                  </div>
                }
              >
                <div class="max-w-3xl mx-auto py-4 px-4 space-y-2">
                  <For each={state.messages}>
                    {(msg, i) => (
                      <div
                        class="animate-slide-up-fade"
                        style={{ 'animation-delay': `${Math.min(i() * 30, 300)}ms`, 'animation-fill-mode': 'both' }}
                      >
                        <ChatMessage
                          role={msg.role}
                          content={msg.content}
                          model={msg.model}
                          sessionId={state.currentSessionId ?? undefined}
                          attachments={(msg as any).attachments}
                          onSaveToVault={msg.role === 'assistant' ? () => saveToVault(msg.content) : undefined}
                        />
                      </div>
                    )}
                  </For>
                  {state.streaming && state.streamingContent && (
                    <div class="animate-slide-up-fade" style="animation-fill-mode: both">
                      <ChatMessage role="assistant" content={state.streamingContent} />
                    </div>
                  )}
                  {state.streaming && !state.streamingContent && (
                    <div class="flex items-center gap-1.5 px-4 py-3">
                      <span class="typing-dot w-2 h-2 rounded-full bg-cyan-600/70 dark:bg-cyan-400/70" />
                      <span class="typing-dot w-2 h-2 rounded-full bg-purple-600/70 dark:bg-purple-400/70" />
                      <span class="typing-dot w-2 h-2 rounded-full bg-cyan-600/70 dark:bg-cyan-400/70" />
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </Show>
            </div>

            {/* Question tool */}
            <Show when={questionData()}>
              {(qs) => (
                <div class="px-4 py-2 border-t border-border/30 bg-background/90">
                  <div class="max-w-3xl mx-auto">
                    <QuestionTool
                      questions={qs()}
                      questionIndex={questionIndex()}
                      totalQuestions={qs().length}
                      onPreviousQuestion={() => setQuestionIndex(i => Math.max(1, i - 1))}
                      onNextQuestion={() => setQuestionIndex(i => Math.min(qs().length, i + 1))}
                      onSubmitAnswer={(answer) => {
                        handleSend(`[Answer to question ${answer.questionIndex}]: ${answer.answer}`)
                        setQuestionData(null)
                        setQuestionIndex(1)
                      }}
                    />
                  </div>
                </div>
              )}
            </Show>

            {/* Permission prompt — inline for non-modal */}
            <Show when={state.permissionQueue.length > 0 && !permissionModalOpen()}>
              <div class="px-4 py-2 border-t border-border/30 bg-background/90">
                <div class="max-w-3xl mx-auto p-3 rounded-lg bg-card/90 border border-amber-500/30">
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <p class="text-sm font-medium text-foreground">
                      {state.permissionQueue[0]?.title || 'Permission request'}
                    </p>
                    <Show when={state.permissionQueue.length > 1}>
                      <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        +{state.permissionQueue.length - 1} more
                      </span>
                    </Show>
                  </div>
                  <Show when={state.permissionQueue[0]?.permission}>
                    <div class="text-xs text-muted-foreground mb-2">
                      Action: <code class="text-[11px] bg-muted px-1 rounded">{state.permissionQueue[0]?.permission}</code>
                      <Show when={state.permissionQueue[0]?.patterns && state.permissionQueue[0]!.patterns!.length > 0}>
                        {' '}on <code class="text-[11px] bg-muted px-1 rounded">{state.permissionQueue[0]?.patterns?.join(', ')}</code>
                      </Show>
                    </div>
                  </Show>
                  <div class="flex gap-2">
                    <button
                      onClick={() => sendPermissionResponse(state.currentSessionId!, state.permissionQueue[0]!.id, 'once')}
                      class="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Allow Once <span class="text-[10px] opacity-60 ml-1">Enter</span>
                    </button>
                    <button
                      onClick={() => sendPermissionResponse(state.currentSessionId!, state.permissionQueue[0]!.id, 'always')}
                      class="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                      Always Allow <span class="text-[10px] opacity-60 ml-1">A</span>
                    </button>
                    <button
                      onClick={() => sendPermissionResponse(state.currentSessionId!, state.permissionQueue[0]!.id, 'reject')}
                      class="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      Deny <span class="text-[10px] opacity-60 ml-1">D</span>
                    </button>
                  </div>
                </div>
              </div>
            </Show>

            {/* Composer */}
            <div class="border-t border-border/30 bg-gradient-to-t from-background via-background/95 to-transparent pt-3 pb-1 px-4 relative z-10">
              <div class="max-w-3xl mx-auto composer-glow rounded-xl">
                <Composer
                  onSend={handleSend}
                  onStop={handleStopStream}
                  disabled={state.streaming}
                  model={model()}
                  attachedResources={attachedResources()}
                  attachedFiles={geminiFiles().map(f => ({ id: f.id, name: f.name, uploading: f.uploading }))}
                  onAttachFiles={async (files) => {
                    const sid = state.currentSessionId
                    if (!sid) return
                    const uploading = files.map(f => ({ id: crypto.randomUUID(), name: f.name, uploading: true }))
                    setGeminiFiles(prev => [...prev, ...uploading])
                    try {
                      const { attachments } = await api.uploadAttachments(sid, files)
                      setGeminiFiles(prev => {
                        const withoutUploading = prev.filter(a => !a.uploading)
                        return [...withoutUploading, ...attachments.map(a => ({ id: a.id, name: a.filename, mimeType: a.mimeType, size: a.size }))]
                      })
                    } catch (err) {
                      setGeminiFiles(prev => prev.filter(a => !a.uploading))
                      console.error('[upload]', err)
                    }
                  }}
                  onRemoveFile={async (i) => {
                    const file = geminiFiles()[i]
                    if (file) {
                      const sid = state.currentSessionId
                      if (sid && file.id && !file.uploading) {
                        api.deleteAttachment(sid, file.id).catch(() => {})
                      }
                    }
                    setGeminiFiles(prev => prev.filter((_, idx) => idx !== i))
                  }}
                />
              </div>
              <p class="text-[10px] text-center text-muted-foreground/40 mt-1 select-none">
                Sahayak may produce inaccurate information. Verify important facts.
              </p>
            </div>
          </div>

          {/* Resource overlay card — fixed to right side, not inside scroll area */}
          <Show when={attachedResources().length > 0}>
            <div class="w-72 shrink-0 border-l border-border/30 bg-background/95 flex flex-col overflow-hidden" style="border-color:var(--border)">
              <div class="flex items-center justify-between px-3 py-2 border-b cursor-pointer shrink-0" style="border-color:var(--border)" onClick={() => setOverlayCollapsed(!overlayCollapsed())}>
                <span class="text-[10px] font-medium uppercase tracking-wider opacity-60">Resources</span>
                <div class="flex items-center gap-1">
                  <ChevronDown class="h-3 w-3 transition-transform" classList={{ 'rotate-180': !overlayCollapsed() }} />
                  <button class="rounded p-0.5 transition-colors hover:opacity-70" onClick={(e) => { e.stopPropagation(); setSessionResources([]) }}>
                    <X class="h-3 w-3" />
                  </button>
                </div>
              </div>
              <Show when={!overlayCollapsed()}>
                <div class="divide-y overflow-y-auto flex-1" style="border-color:var(--border)">
                  <For each={attachedResources()}>
                    {(r) => (
                      <div class="px-3 py-2 text-xs space-y-0.5">
                        <div class="flex items-center justify-between gap-2">
                          <span class="font-medium truncate">{r.type === 'ssh' ? '🔗' : '📁'} {r.name}</span>
                          <button class="rounded p-0.5 transition-colors hover:opacity-70 shrink-0" onClick={() => toggleResource(r)}>
                            <X class="h-2.5 w-2.5" />
                          </button>
                        </div>
                        <Show when={r.type === 'folder' && r.path}>
                          <div class="opacity-60"><span>Location:</span> <code class="text-[10px]">{r.path}</code></div>
                        </Show>
                        <Show when={r.type === 'ssh'}>
                          <div class="opacity-60"><span>Server:</span> <code class="text-[10px]">{r.host?.replace(/^ssh\s+/i, '')}</code></div>
                        </Show>
                        <div class="text-[10px] opacity-40">{r.permissions}</div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          {/* Plan side panel */}
          <Show when={planPanelOpen()}>
            <div class="w-80 shrink-0 border-l border-border/30 bg-background/95 flex flex-col overflow-hidden animate-slide-in-right">
              <AgentPlan tasks={planData() ?? undefined} onTasksChange={setPlanData} />
            </div>
          </Show>
        </div>
      </div>
    </div>

    <PermissionApprovalModal
      open={permissionModalOpen()}
      onClose={() => setPermissionModalOpen(false)}
    />

    <ResourceModal
      open={resourceModalOpen()}
      onClose={() => setResourceModalOpen(false)}
      attached={attachedResources()}
      onToggle={toggleResource}
    />

    <Show when={gitTreeData()}>
      {(d) => (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setGitTreeData(null)}>
          <div class="w-[800px] max-h-[80vh] rounded-xl border shadow-xl overflow-hidden bg-background" style="border-color:var(--border)" onClick={(e) => e.stopPropagation()}>
            <div class="flex items-center justify-between px-4 py-2.5 border-b" style="border-color:var(--border)">
              <span class="text-sm font-medium">{d().name} — Git Tree</span>
              <button class="rounded p-1 transition-colors hover:opacity-70" onClick={() => setGitTreeData(null)}>
                <X class="h-4 w-4" />
              </button>
            </div>
            <div class="p-4 overflow-y-auto max-h-[70vh]">
              <Show when={d().data.isGitRepo} fallback={
                <div class="flex flex-col items-center justify-center py-12 gap-2">
                  <GitBranch class="h-8 w-8 opacity-30" />
                  <p class="text-sm opacity-60">Git not found</p>
                  <p class="text-xs opacity-40">{d().data.error || `${d().name} is not a git repository`}</p>
                </div>
              }>
                <GitTree data={d().data} />
              </Show>
            </div>
          </div>
        </div>
      )}
    </Show>

    <Dialog open={renamingSessionId() !== null} onOpenChange={handleRenameDialogOpenChange}>
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rename session</DialogTitle>
        </DialogHeader>
        <input
          ref={setRenameInputRef}
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={renameValue()}
          onInput={(e) => setRenameValue(e.currentTarget.value)}
          onKeyDown={handleRenameInputKeyDown}
        />
        <DialogFooter>
          <Button variant="outline" onClick={cancelRename}>Cancel</Button>
          <Button onClick={confirmRename}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
