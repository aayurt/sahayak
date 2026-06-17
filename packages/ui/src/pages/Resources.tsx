import { createResource, createSignal, For, Show } from 'solid-js'
import { api } from '../lib/api-client'
import { GitTree } from '../components/resources/GitTree'

export function ResourcesPage() {
  const [resources, { refetch }] = createResource(() => api.listResources())
  const [showAddForm, setShowAddForm] = createSignal(false)
  const [addType, setAddType] = createSignal<'folder' | 'ssh'>('folder')
  const [addName, setAddName] = createSignal('')
  const [addPath, setAddPath] = createSignal('')
  const [addHost, setAddHost] = createSignal('')
  const [addPort, setAddPort] = createSignal('22')
  const [addUsername, setAddUsername] = createSignal('')
  const [addPermissions, setAddPermissions] = createSignal('read-only')
  const [graphifyProcesses, setGraphifyProcesses] = createSignal<Record<string, string>>({})
  const [outputDialog, setOutputDialog] = createSignal<{ id: string; content: string } | null>(null)
  const [gitTreeDialog, setGitTreeDialog] = createSignal<{ id: string; data: any } | null>(null)

  const handleCreateResource = async () => {
    if (!addName()) return
    try {
      const data: any = { name: addName(), type: addType(), permissions: addPermissions() }
      if (addType() === 'folder') {
        if (!addPath()) return
        data.path = addPath()
      } else {
        if (!addHost()) return
        data.host = addHost()
        data.port = parseInt(addPort()) || 22
        data.username = addUsername() || undefined
      }
      await api.createResource(data)
      resetForm()
      refetch()
    } catch (e) {
      console.error('Failed to create resource:', e)
    }
  }

  const resetForm = () => {
    setShowAddForm(false)
    setAddName('')
    setAddPath('')
    setAddHost('')
    setAddPort('22')
    setAddUsername('')
    setAddPermissions('read-only')
  }

  const deleteResource = async (id: string) => {
    try {
      await api.deleteResource(id)
      refetch()
    } catch (e) {
      console.error('Failed to delete resource:', e)
    }
  }

  const testSSH = async (id: string) => {
    try {
      const result = await api.testSSH(id)
      alert(result.ok ? `Connected to ${result.host}` : `Failed: ${result.error}`)
    } catch (e) {
      alert(`Connection failed: ${(e as Error).message}`)
    }
  }

  const startGraphify = async (id: string) => {
    try {
      const result = await api.startGraphify(id)
      setGraphifyProcesses({ ...graphifyProcesses(), [id]: result.processId })
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const status = await api.getGraphifyStatus(id, result.processId)
          if (status.status === 'stopped' || status.status === 'error') {
            clearInterval(poll)
            refetch()
            const newProcs = { ...graphifyProcesses() }
            delete newProcs[id]
            setGraphifyProcesses(newProcs)
          }
        } catch { clearInterval(poll) }
      }, 3000)
    } catch (e) {
      console.error('Failed to start graphify:', e)
    }
  }

  const stopGraphify = async (id: string) => {
    const pid = graphifyProcesses()[id]
    if (!pid) return
    try {
      await api.stopGraphify(id, pid)
      refetch()
      const newProcs = { ...graphifyProcesses() }
      delete newProcs[id]
      setGraphifyProcesses(newProcs)
    } catch (e) {
      console.error('Failed to stop graphify:', e)
    }
  }

  const viewOutput = async (id: string) => {
    const pid = graphifyProcesses()[id]
    if (!pid) return
    try {
      const output = await api.getGraphifyOutput(id, pid, 'tail')
      setOutputDialog({ id, content: output.content })
    } catch (e) {
      console.error('Failed to read output:', e)
    }
  }

  const openGraphifyReport = (id: string) => {
    window.open(`/api/resources/${id}/graphify/file/GRAPH_REPORT.md`, '_blank')
  }

  const openGraphifyHtml = (id: string) => {
    window.open(`/api/resources/${id}/graphify/file/graph.html`)
  }

  const formatDate = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const showGitTree = async (id: string) => {
    try {
      const data = await api.getGitTree(id)
      setGitTreeDialog({ id, data })
    } catch (e) {
      console.error('Failed to get git tree:', e)
    }
  }

  const graphifyStateColor = (state: string) => {
    switch (state) {
      case 'done': return 'var(--success, #22c55e)'
      case 'running': return 'var(--accent, #3b82f6)'
      case 'error': return 'var(--danger, #ef4444)'
      default: return 'var(--text-muted)'
    }
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b shrink-0" style="background:var(--bg-secondary);border-color:var(--border)">
        <h1 class="text-sm font-medium" style="color:var(--text-secondary)">Resources</h1>
        <button class="btn text-xs" onClick={() => setShowAddForm(!showAddForm())}>
          {showAddForm() ? 'Cancel' : '+ Add Resource'}
        </button>
      </div>

      <Show when={showAddForm()}>
        <div class="p-4 border-b" style="background:var(--bg-secondary);border-color:var(--border)">
          <div class="space-y-2 max-w-md">
            <input class="input w-full text-xs" placeholder="Resource name" value={addName()} onInput={(e) => setAddName(e.currentTarget.value)} />

            <div class="flex gap-2">
              <button
                class="btn text-xs flex-1"
                classList={{ active: addType() === 'folder' }}
                onClick={() => setAddType('folder')}
              >Folder</button>
              <button
                class="btn text-xs flex-1"
                classList={{ active: addType() === 'ssh' }}
                onClick={() => setAddType('ssh')}
              >SSH</button>
            </div>

            <Show when={addType() === 'folder'}>
              <input class="input w-full text-xs" placeholder="/path/to/folder" value={addPath()} onInput={(e) => setAddPath(e.currentTarget.value)} />
            </Show>

            <Show when={addType() === 'ssh'}>
              <input class="input w-full text-xs" placeholder="hostname or IP" value={addHost()} onInput={(e) => setAddHost(e.currentTarget.value)} />
              <div class="flex gap-2">
                <input class="input flex-1 text-xs" type="number" placeholder="Port (22)" value={addPort()} onInput={(e) => setAddPort(e.currentTarget.value)} />
                <input class="input flex-1 text-xs" placeholder="Username" value={addUsername()} onInput={(e) => setAddUsername(e.currentTarget.value)} />
              </div>
            </Show>

            <select class="input w-full text-xs" value={addPermissions()} onChange={(e) => setAddPermissions(e.currentTarget.value)}>
              <option value="read-only">Read-only</option>
              <option value="read-write">Read-write</option>
            </select>

            <button class="btn text-xs w-full" onClick={handleCreateResource}>Create</button>
          </div>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto p-4">
        <Show when={resources.loading}>
          <p class="text-xs" style="color:var(--text-muted)">Loading...</p>
        </Show>
        <Show when={resources.error}>
          <p class="text-xs" style="color:var(--danger)">Error loading resources</p>
        </Show>
        <Show when={resources() && resources()!.length === 0}>
          <p class="text-xs" style="color:var(--text-muted)">No resources yet. Add a folder or SSH connection to get started.</p>
        </Show>
        <div class="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <For each={resources()}>
            {(r: any) => {
              const isGraphifyRunning = graphifyProcesses()[r.id] !== undefined || r.graphifyState === 'running'
              return (
                <div class="card p-3 space-y-2">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-medium">{r.type === 'ssh' ? '🔗' : '📁'}</span>
                      <span class="text-sm font-medium">{r.name}</span>
                    </div>
                    <button class="btn-ghost text-xs" style="color:var(--danger)" onClick={() => deleteResource(r.id)}>&times;</button>
                  </div>

                  <div class="text-xs space-y-0.5" style="color:var(--text-muted)">
                    <Show when={r.type === 'folder'}>
                      <p class="truncate">{r.path}</p>
                    </Show>
                    <Show when={r.type === 'ssh'}>
                      <p>{r.username}@{r.host}:{r.port}</p>
                    </Show>
                    <p>
                      <span class="capitalize">{r.permissions}</span>
                      {' · '}Git: {r.gitEnabled ? 'on' : 'off'}
                    </p>
                    <p>
                      Graphify: <span style={`color:${graphifyStateColor(r.graphifyState)}`}>{r.graphifyState}</span>
                    </p>
                    <p>Created: {formatDate(r.createdAt)}</p>
                  </div>

                  <div class="flex flex-wrap gap-1.5">
                    <Show when={r.type === 'ssh'}>
                      <button class="btn text-xs flex-1" onClick={() => testSSH(r.id)}>Test</button>
                    </Show>

                    <Show when={r.type === 'folder'}>
                      <button class="btn text-xs flex-1" onClick={() => showGitTree(r.id)}>Git Tree</button>
                      <button
                        class="btn text-xs flex-1"
                        onClick={() => isGraphifyRunning ? stopGraphify(r.id) : startGraphify(r.id)}
                      >
                        {isGraphifyRunning ? 'Stop' : 'Graphify'}
                      </button>
                    </Show>

                    <Show when={r.graphifyState === 'done' && r.graphifyOutPath}>
                      <button class="btn text-xs flex-1" onClick={() => openGraphifyReport(r.id)}>Report</button>
                      <button class="btn text-xs flex-1" onClick={() => openGraphifyHtml(r.id)}>Graph</button>
                    </Show>

                    <Show when={isGraphifyRunning}>
                      <button class="btn text-xs flex-1" onClick={() => viewOutput(r.id)}>Output</button>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      {/* Git Tree dialog */}
      <Show when={gitTreeDialog()}>
        {(dialog) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setGitTreeDialog(null)}>
            <div class="w-[800px] max-h-[80vh] rounded-lg shadow-xl border overflow-hidden" style="background:var(--bg-secondary);border-color:var(--border)" onClick={(e) => e.stopPropagation()}>
              <div class="flex items-center justify-between px-4 py-2 border-b" style="border-color:var(--border)">
                <span class="text-xs font-medium" style="color:var(--text-secondary)">Git Tree</span>
                <button class="btn-ghost text-xs" onClick={() => setGitTreeDialog(null)}>&times;</button>
              </div>
              <div class="p-4 overflow-y-auto max-h-[70vh]">
                <GitTree data={dialog().data} />
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Output dialog */}
      <Show when={outputDialog()}>
        {(dialog) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOutputDialog(null)}>
            <div class="w-[600px] max-h-[80vh] rounded-lg shadow-xl border overflow-hidden" style="background:var(--bg-secondary);border-color:var(--border)" onClick={(e) => e.stopPropagation()}>
              <div class="flex items-center justify-between px-4 py-2 border-b" style="border-color:var(--border)">
                <span class="text-xs font-medium" style="color:var(--text-secondary)">Graphify Output</span>
                <button class="btn-ghost text-xs" onClick={() => setOutputDialog(null)}>&times;</button>
              </div>
              <pre class="p-4 text-xs overflow-y-auto max-h-[70vh] whitespace-pre-wrap" style="color:var(--text-primary);background:var(--bg-primary)">
                {dialog().content}
              </pre>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
