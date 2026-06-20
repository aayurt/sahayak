import { createResource, createSignal, For, Show, onMount, onCleanup } from 'solid-js'
import { useSettings, loadPermissionMode, savePermissionMode } from '../stores/settings'
import { api } from '../lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import {
  Bot, Key, Mic, Save,
  Download, Activity, CheckCircle,
  RefreshCw, Loader2, Terminal, Play, Square, Globe, Table, LogOut
} from 'lucide-solid'

export function SettingsPage() {
  const { settings, setSettings } = useSettings()
  const [backends, { refetch: refetchBackends }] = createResource(() => api.checkBackends())
  const [downloading, setDownloading] = createSignal<string | null>(null)
  const [downloadMsg, setDownloadMsg] = createSignal<string | null>(null)
  const [whisperModels, { refetch: refetchWhisper }] = createResource(() => api.listWhisperModels())
  onMount(() => { loadPermissionMode() })

  async function handleDownloadWhisper(name: string) {
    setDownloading(name)
    setDownloadMsg(null)
    try {
      const res = await api.downloadModel('whisper', name)
      setDownloadMsg(res.message)
      refetchWhisper()
    } catch (e) {
      setDownloadMsg(`Failed: ${(e as Error).message}`)
    } finally {
      setDownloading(null)
    }
  }

  const [workspaces, { refetch: refetchWorkspaces }] = createResource(() => api.listWorkspaces())
  const [launching, setLaunching] = createSignal(false)
  const [launchMsg, setLaunchMsg] = createSignal<string | null>(null)
  const [authStatus, setAuthStatus] = createSignal<string | null>(null)
  const [authAccount, setAuthAccount] = createSignal(0)

  async function handleLaunchWorkspace() {
    setLaunching(true)
    setLaunchMsg(null)
    try {
      const cwd = process?.cwd?.() || '/'
      await api.createWorkspace(cwd, settings.openCodePath || 'opencode', 'Sahayak workspace')
      setLaunchMsg('Workspace launched')
      refetchWorkspaces()
    } catch (e) {
      setLaunchMsg(`Failed: ${(e as Error).message}`)
    } finally {
      setLaunching(false)
    }
  }

  async function handleStopWorkspace(id: string) {
    try {
      await api.stopWorkspace(id)
      refetchWorkspaces()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div class="p-6 overflow-y-auto h-full max-w-2xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
        <Button size="sm" onClick={() => {/* TODO: persist settings */}}>
          <Save class="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>

      {/* Backend Health */}
      <Card>
        <CardHeader class="pb-3 flex flex-row items-center justify-between">
          <CardTitle class="flex items-center gap-2 text-base">
            <Activity class="h-4 w-4 text-muted-foreground" />
            AI Backends
          </CardTitle>
          <Button variant="ghost" size="icon" class="h-7 w-7" onClick={() => refetchBackends()}>
            <RefreshCw class="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <Show when={backends()} fallback={<div class="text-sm text-muted-foreground">Checking...</div>}>
              {(b) => (
                b().backends.map((be) => (
                  <div class="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
                    <div class="flex items-center gap-2">
                      <Bot class="h-3.5 w-3.5 text-muted-foreground" />
                      <span class="text-sm">{be.name}</span>
                      <span class="text-xs text-muted-foreground">{be.url.replace(/\/v1\/models|\/api\/tags/g, '')}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <span class={`status-dot ${be.status}`} />
                      <span class={`text-xs ${be.status === 'online' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {be.status === 'online' ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </Show>
          </div>
        </CardContent>
      </Card>

      {/* AI Backend Settings */}
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2 text-base">
            <Bot class="h-4 w-4 text-muted-foreground" />
            AI Endpoint
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid gap-1.5">
            <label class="text-sm font-medium flex items-center gap-1.5">
              <Key class="h-3.5 w-3.5 text-muted-foreground" />
              Endpoint
            </label>
            <Input
              value={settings.aiEndpoint}
              onInput={(e) => setSettings('aiEndpoint', e.currentTarget.value)}
              placeholder="http://localhost:8080"
            />
          </div>
          <div class="grid gap-1.5">
            <label class="text-sm font-medium">API Key</label>
            <Input
              type="password"
              value={settings.aiApiKey}
              onInput={(e) => setSettings('aiApiKey', e.currentTarget.value)}
              placeholder="sk-..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Model Download */}
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2 text-base">
            <Download class="h-4 w-4 text-muted-foreground" />
            Whisper Models
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <p class="text-xs text-muted-foreground">
            Download speech-to-text models for local voice processing.
            Larger models are more accurate but slower.
          </p>
          <Show when={whisperModels()} fallback={<div class="text-sm text-muted-foreground">Loading...</div>}>
            {(wm) => (
              <div class="space-y-2">
                {wm().available.length === 0 && wm().installed.length > 0 ? (
                  <div class="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle class="h-3 w-3" />
                    All whisper models installed
                  </div>
                ) : null}
                <div class="grid grid-cols-2 gap-2">
                  {wm().available.map((name) => (
                    <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 text-sm">
                      <span class="truncate text-xs">{name}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-7 text-xs ml-2 shrink-0"
                        disabled={downloading() === name}
                        onClick={() => handleDownloadWhisper(name)}
                      >
                        <Show when={downloading() === name} fallback="Download">
                          <Loader2 class="h-3 w-3 animate-spin mr-1" />
                        </Show>
                      </Button>
                    </div>
                  ))}
                  {wm().installed.map((name) => (
                    <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 text-sm">
                      <div class="flex items-center gap-1.5 truncate">
                        <CheckCircle class="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
                        <span class="truncate text-xs">{name}</span>
                      </div>
                      <Badge variant="secondary" class="text-[10px] h-5 shrink-0 ml-2">Installed</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Show>
          <Show when={downloadMsg()}>
            <p class="text-xs text-muted-foreground mt-1">{downloadMsg()}</p>
          </Show>
        </CardContent>
      </Card>

      {/* OpenCode Integration */}
      <Card>
        <CardHeader class="pb-3 flex flex-row items-center justify-between">
          <CardTitle class="flex items-center gap-2 text-base">
            <Terminal class="h-4 w-4 text-muted-foreground" />
            OpenCode
          </CardTitle>
          <Badge variant={(workspaces()?.workspaces.length ?? 0) > 0 ? 'default' : 'secondary'} class="text-[10px]">
            {workspaces() ? `${workspaces()!.workspaces.length} workspace${(workspaces()?.workspaces.length ?? 0) !== 1 ? 's' : ''}` : 'inactive'}
          </Badge>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid gap-1.5">
            <label class="text-sm font-medium">Binary Path</label>
            <Input
              value={settings.openCodePath}
              onInput={(e) => setSettings('openCodePath', e.currentTarget.value)}
              placeholder="opencode"
            />
          </div>

          <div class="flex gap-2">
            <Button
              variant="default"
              size="sm"
              class="gap-1.5"
              onClick={handleLaunchWorkspace}
              disabled={launching()}
            >
              <Show when={launching()} fallback={<Play class="h-3.5 w-3.5" />}>
                <Loader2 class="h-3.5 w-3.5 animate-spin" />
              </Show>
              Launch workspace
            </Button>
            <Show when={(workspaces()?.workspaces.length ?? 0) > 0}>
              <Button
                variant="outline"
                size="sm"
                class="gap-1.5"
                onClick={() => refetchWorkspaces()}
              >
                <RefreshCw class="h-3.5 w-3.5" />
                Refresh
              </Button>
            </Show>
          </div>

          <Show when={launchMsg()}>
            <p class="text-xs text-muted-foreground">{launchMsg()}</p>
          </Show>

          <Show when={(workspaces()?.workspaces.length ?? 0) > 0}>
            <div class="space-y-2 mt-2">
              <Separator />
              <p class="text-xs font-medium text-muted-foreground">Active Workspaces</p>
              <For each={workspaces()!.workspaces}>
                {(ws) => (
                  <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class={`status-dot ${ws.status === 'ready' ? 'online' : 'offline'}`} />
                      <div class="min-w-0">
                        <p class="text-sm truncate">{ws.name || ws.path.split('/').pop() || ws.id}</p>
                        <p class="text-xs text-muted-foreground truncate">{ws.path}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <Show when={ws.port}>
                        <Badge variant="outline" class="text-[10px]">:{ws.port}</Badge>
                      </Show>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-7 w-7"
                        onClick={() => handleStopWorkspace(ws.id)}
                        title="Stop workspace"
                      >
                        <Square class="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </CardContent>
      </Card>

      {/* Google Sheets */}
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2 text-base">
            <Table class="h-4 w-4 text-muted-foreground" />
            Google Sheets
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <p class="text-xs text-muted-foreground">
            Connect your Google account to let the AI read, summarize, and update your spreadsheets.
          </p>
          <div class="grid gap-1.5">
            <label class="text-sm font-medium">Client ID</label>
            <Input
              value={settings.googleClientId || ''}
              onInput={(e) => setSettings('googleClientId', e.currentTarget.value)}
              placeholder="Paste your Google OAuth Client ID"
            />
          </div>
          <div class="grid gap-1.5">
            <label class="text-sm font-medium">Client Secret</label>
            <Input
              type="password"
              value={settings.googleClientSecret || ''}
              onInput={(e) => setSettings('googleClientSecret', e.currentTarget.value)}
              placeholder="Paste your Google OAuth Client Secret"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            class="gap-1.5"
            onClick={async () => {
              await api.updateSettings({
                google_client_id: settings.googleClientId,
                google_client_secret: settings.googleClientSecret,
              })
            }}
          >
            <Save class="h-3.5 w-3.5" />
            Save Credentials
          </Button>
          <div class="flex gap-2">
            <Button
              variant="default"
              size="sm"
              class="gap-1.5"
              onClick={async () => {
                try {
                  const { url } = await api.googleAuthUrl()
                  if (url) window.open(url, '_blank')
                } catch (e) {
                  console.error('Google auth URL failed:', e)
                }
              }}
            >
              <Globe class="h-3.5 w-3.5" />
              Connect to Google
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="gap-1.5"
              onClick={async () => {
                const status = await api.googleAuthStatus()
                alert(status.connected ? `Connected as ${status.email}` : 'Not connected')
              }}
            >
              <RefreshCw class="h-3.5 w-3.5" />
              Check Status
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="gap-1.5 text-destructive"
              onClick={async () => {
                await api.googleDisconnect()
              }}
            >
              <LogOut class="h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Jarvis */}
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2 text-base">
            <Mic class="h-4 w-4 text-muted-foreground" />
            Jarvis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <label class="text-sm font-medium" for="jarvis-toggle">
                Enable voice assistant
              </label>
              <p class="text-xs text-muted-foreground">
                Hands-free voice control with wake word
              </p>
            </div>
            <Switch
              id="jarvis-toggle"
              checked={settings.jarvisEnabled}
              onChange={(v) => setSettings('jarvisEnabled', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Gemini Auth */}
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2 text-base">
            <Globe class="h-4 w-4 text-muted-foreground" />
            Gemini Auth
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <p class="text-xs text-muted-foreground">
            Generate Playwright auth state for Gemini. Opens a Chrome window — sign in to your Google account, then click Save Auth.
          </p>
          <div class="flex gap-2">
            <Button
              variant="default"
              size="sm"
              class="gap-1.5"
              onClick={async () => {
                setAuthStatus('Opening Chrome...')
                try {
                  const res = await api.startGeminiAuth()
                  setAuthStatus(res.message)
                } catch (e) {
                  setAuthStatus(`Failed: ${(e as Error).message}`)
                }
              }}
              disabled={authStatus() === 'Opening Chrome...'}
            >
              <Globe class="h-3.5 w-3.5" />
              Start Auth
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="gap-1.5"
              onClick={async () => {
                setAuthStatus('Saving...')
                try {
                  const res = await api.saveGeminiAuth()
                  setAuthStatus(res.message || 'Auth saved')
                  setAuthAccount(res.accountNum || 0)
                } catch (e) {
                  setAuthStatus(`Failed: ${(e as Error).message}`)
                }
              }}
              disabled={authStatus() === 'Saving...'}
            >
              <Save class="h-3.5 w-3.5" />
              Save Auth
            </Button>
          </div>
          <Show when={authStatus()}>
            <p class="text-xs text-muted-foreground">{authStatus()}</p>
          </Show>
          <Show when={authAccount() > 0}>
            <div class="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <CheckCircle class="h-3 w-3" />
              gemini-account{authAccount()}.json ready
            </div>
          </Show>
        </CardContent>
      </Card>

      {/* Permission Mode */}
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2 text-base">
            <Terminal class="h-4 w-4 text-muted-foreground" />
            Agent Permission Mode
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="space-y-2">
            <button
              type="button"
              class={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                settings.permissionMode === 'prompt'
                  ? 'border-2 font-medium'
                  : 'border-border/30 hover:border-border/60'
              }`}
              style={settings.permissionMode === 'prompt'
                ? { 'border-color': 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }
                : {}
              }
              onClick={() => savePermissionMode('prompt')}
            >
              <div class="font-medium">Prompt First (recommended)</div>
              <p class="text-xs text-muted-foreground/70 mt-0.5">
                AI runs commands freely but asks you via the question tool before destructive actions
              </p>
            </button>
            <button
              type="button"
              class={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                settings.permissionMode === 'allow'
                  ? 'border-2 font-medium'
                  : 'border-border/30 hover:border-border/60'
              }`}
              style={settings.permissionMode === 'allow'
                ? { 'border-color': 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }
                : {}
              }
              onClick={() => savePermissionMode('allow')}
            >
              <div class="font-medium">Allow All</div>
              <p class="text-xs text-muted-foreground/70 mt-0.5">
                AI runs commands and modifies files without asking — faster but less oversight
              </p>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
