import { createResource, For, createSignal, Show, createMemo } from 'solid-js'
import { api } from '../lib/api-client'

type Tab = 'skills' | 'run' | 'history' | 'cron' | 'sidecars'

export function AgentPage() {
  const [tab, setTab] = createSignal<Tab>('skills')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'skills', label: 'Skills' },
    { key: 'run', label: 'Run' },
    { key: 'history', label: 'History' },
    { key: 'cron', label: 'Cron' },
    { key: 'sidecars', label: 'SideCars' },
  ]

  return (
    <div class="p-6 overflow-y-auto h-full">
      <h1 class="text-lg font-semibold mb-4">Agent</h1>

      <div class="flex gap-1 mb-4 flex-wrap border-b pb-2" style="border-color:var(--border)">
        <For each={tabs}>
          {(t) => (
            <button
              class="btn-ghost text-sm px-3 py-1"
              classList={{
                active: tab() === t.key,
                'font-medium': true,
              }}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          )}
        </For>
      </div>

      <Show when={tab() === 'skills'}><SkillsTab /></Show>
      <Show when={tab() === 'run'}><RunTab /></Show>
      <Show when={tab() === 'history'}><HistoryTab /></Show>
      <Show when={tab() === 'cron'}><CronTab /></Show>
      <Show when={tab() === 'sidecars'}><SideCarsTab /></Show>
    </div>
  )
}

function SkillsTab() {
  const [skills, { refetch }] = createResource(() => api.listSkills())
  const [showForm, setShowForm] = createSignal(false)
  const [editing, setEditing] = createSignal<any>(null)
  const [form, setForm] = createSignal({ name: '', description: '', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 2048 })

  const openNew = () => {
    setEditing(null)
    setForm({ name: '', description: '', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 2048 })
    setShowForm(true)
  }

  const openEdit = (s: any) => {
    setEditing(s)
    setForm({ name: s.name, description: s.description || '', systemPrompt: s.systemPrompt, model: s.model || '', temperature: s.temperature, maxTokens: s.maxTokens })
    setShowForm(true)
  }

  const save = async () => {
    const data = form()
    if (editing()) {
      await api.updateSkill(editing().id, data)
    } else {
      await api.createSkill(data)
    }
    setShowForm(false)
    refetch()
  }

  const remove = async (id: string) => {
    await api.deleteSkill(id)
    refetch()
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-medium" style="color:var(--text-secondary)">Skill Library</h2>
        <button class="btn text-xs" onClick={openNew}>+ New Skill</button>
      </div>

      <Show when={showForm()}>
        <div class="card p-4 mb-4 space-y-3">
          <input class="input w-full" placeholder="Skill name" value={form().name} onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })} />
          <input class="input w-full" placeholder="Description (optional)" value={form().description} onInput={(e) => setForm({ ...form(), description: e.currentTarget.value })} />
          <textarea class="input w-full min-h-[80px]" placeholder="System prompt" value={form().systemPrompt} onInput={(e) => setForm({ ...form(), systemPrompt: e.currentTarget.value })} />
          <div class="flex gap-2">
            <input class="input flex-1" placeholder="Model (optional)" value={form().model} onInput={(e) => setForm({ ...form(), model: e.currentTarget.value })} />
            <input class="input w-24" type="number" placeholder="Temp" value={form().temperature} onInput={(e) => setForm({ ...form(), temperature: parseFloat(e.currentTarget.value) || 0.7 })} />
            <input class="input w-24" type="number" placeholder="Max tokens" value={form().maxTokens} onInput={(e) => setForm({ ...form(), maxTokens: parseInt(e.currentTarget.value) || 2048 })} />
          </div>
          <div class="flex gap-2">
            <button class="btn text-xs" onClick={save}>{editing() ? 'Update' : 'Create'}</button>
            <button class="btn-ghost text-xs" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      </Show>

      <div class="space-y-2">
        <For each={skills()}>
          {(s) => (
            <div class="card p-3 flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{s.name}</div>
                <div class="text-xs mt-1" style="color:var(--text-muted)">{s.description || 'No description'}</div>
                <div class="text-xs mt-1" style="color:var(--text-muted)">
                  Model: {s.model || '(default)'} · Temp: {s.temperature} · Max: {s.maxTokens}
                </div>
              </div>
              <div class="flex gap-1 shrink-0">
                <button class="btn-ghost text-xs" onClick={() => openEdit(s)}>Edit</button>
                <button class="btn-ghost text-xs text-destructive" onClick={() => remove(s.id)}>Del</button>
              </div>
            </div>
          )}
        </For>
        <Show when={skills()?.length === 0}>
          <p class="text-xs" style="color:var(--text-muted)">No skills yet. Create one to get started.</p>
        </Show>
      </div>
    </div>
  )
}

function RunTab() {
  const [skills] = createResource(() => api.listSkills())
  const [selectedSkillId, setSelectedSkillId] = createSignal('')
  const [input, setInput] = createSignal('')
  const [output, setOutput] = createSignal('')
  const [running, setRunning] = createSignal(false)
  const [runId, setRunId] = createSignal('')

  const selectedSkill = createMemo(() => {
    const list = skills()
    const id = selectedSkillId()
    if (!list || !id) return null
    return list.find((s: any) => s.id === id) || null
  })

  const run = async () => {
    if (!selectedSkillId() || !input()) return
    setRunning(true)
    setOutput('')
    setRunId('')

    try {
      const res = await api.runSkill(selectedSkillId(), { prompt: input() })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(trimmed.slice(6))
            if (msg.type === 'start') setRunId(msg.runId)
            else if (msg.type === 'chunk') setOutput((prev) => prev + msg.content)
            else if (msg.type === 'done') setRunning(false)
            else if (msg.type === 'error') {
              setOutput((prev) => prev + '\n[Error: ' + msg.error + ']')
              setRunning(false)
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setOutput('Error: ' + (e as Error).message)
    }
    setRunning(false)
  }

  return (
    <div>
      <h2 class="text-sm font-medium mb-3" style="color:var(--text-secondary)">Run Skill</h2>

      <div class="card p-4 space-y-3">
        <select
          class="input w-full"
          value={selectedSkillId()}
          onChange={(e) => setSelectedSkillId(e.currentTarget.value)}
        >
          <option value="">Select a skill...</option>
          <For each={skills()}>
            {(s: any) => <option value={s.id}>{s.name}</option>}
          </For>
        </select>

        <Show when={selectedSkill()}>
          <div class="text-xs" style="color:var(--text-muted)">
            System: {selectedSkill()?.systemPrompt?.slice(0, 100)}{(selectedSkill()?.systemPrompt?.length || 0) > 100 ? '...' : ''}
          </div>
        </Show>

        <textarea
          class="input w-full min-h-[80px]"
          placeholder="Input for the skill..."
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          disabled={running()}
        />

        <button class="btn text-xs" onClick={run} disabled={running() || !selectedSkillId() || !input()}>
          {running() ? 'Running...' : 'Run'}
        </button>

        <Show when={output()}>
          <div class="mt-2">
            <div class="text-xs mb-1" style="color:var(--text-muted)">Output {runId() ? `(run: ${runId().slice(0, 8)}...)` : ''}</div>
            <pre class="card p-3 text-xs whitespace-pre-wrap max-h-60 overflow-y-auto" style="background:var(--bg-secondary)">{output()}</pre>
          </div>
        </Show>
      </div>
    </div>
  )
}

function HistoryTab() {
  const [runs, { refetch }] = createResource(() => api.listAgentRuns())
  const [memory] = createResource(() => api.listAgentMemory())

  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-medium" style="color:var(--text-secondary)">Run History</h2>
        <button class="btn-ghost text-xs" onClick={() => refetch()}>Refresh</button>
      </div>

      <div class="space-y-2 mb-6">
        <For each={runs()}>
          {(r: any) => (
            <div class="card p-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Skill: {r.skillId.slice(0, 8)}...</span>
                <span class="text-xs" classList={{
                  'text-muted-foreground': r.status === 'completed',
                  'text-destructive': r.status === 'failed',
                  'text-amber-400': r.status !== 'completed' && r.status !== 'failed',
                }}>{r.status}</span>
              </div>
              <div class="text-xs mt-1" style="color:var(--text-muted)">
                {new Date(r.startedAt).toLocaleString()} · {r.tokens || 0} tokens
              </div>
              <Show when={r.output}>
                <pre class="text-xs mt-2 whitespace-pre-wrap max-h-20 overflow-y-auto" style="color:var(--text-secondary)">
                  {JSON.stringify(r.output, null, 2).slice(0, 300)}
                </pre>
              </Show>
            </div>
          )}
        </For>
        <Show when={runs()?.length === 0}>
          <p class="text-xs" style="color:var(--text-muted)">No runs yet.</p>
        </Show>
      </div>

      <h2 class="text-sm font-medium mb-3" style="color:var(--text-secondary)">Agent Memory</h2>
      <div class="space-y-2">
        <For each={memory()}>
          {(m: any) => (
            <div class="card p-3">
              <div class="text-xs font-medium">{m.key}</div>
              <div class="text-xs mt-1" style="color:var(--text-muted)">{m.value.slice(0, 200)}</div>
            </div>
          )}
        </For>
        <Show when={memory()?.length === 0}>
          <p class="text-xs" style="color:var(--text-muted)">No memory entries yet.</p>
        </Show>
      </div>
    </div>
  )
}

function CronTab() {
  const [jobs, { refetch }] = createResource(() => api.listCronJobs())
  const [showForm, setShowForm] = createSignal(false)
  const [form, setForm] = createSignal({ name: '', expression: '', action: 'agent', config: '{}' })

  const create = async () => {
    const f = form()
    await api.createCronJob({
      name: f.name,
      expression: f.expression,
      action: f.action,
      config: JSON.parse(f.config || '{}'),
    })
    setShowForm(false)
    refetch()
  }

  const toggle = async (id: string) => {
    await api.toggleCronJob(id)
    refetch()
  }

  const remove = async (id: string) => {
    await api.deleteCronJob(id)
    refetch()
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-medium" style="color:var(--text-secondary)">Cron Jobs</h2>
        <button class="btn text-xs" onClick={() => setShowForm(!showForm())}>+ New Job</button>
      </div>

      <Show when={showForm()}>
        <div class="card p-4 mb-4 space-y-3">
          <input class="input w-full" placeholder="Job name" value={form().name} onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })} />
          <input class="input w-full" placeholder="Cron expression (e.g. 0 8 * * *)" value={form().expression} onInput={(e) => setForm({ ...form(), expression: e.currentTarget.value })} />
          <select class="input w-full" value={form().action} onChange={(e) => setForm({ ...form(), action: e.currentTarget.value })}>
            <option value="agent">Agent</option>
            <option value="digest">Digest</option>
            <option value="research">Research</option>
            <option value="custom">Custom</option>
          </select>
          <textarea class="input w-full min-h-[60px]" placeholder='Config JSON (e.g. {"skillId":"..."})' value={form().config} onInput={(e) => setForm({ ...form(), config: e.currentTarget.value })} />
          <div class="flex gap-2">
            <button class="btn text-xs" onClick={create}>Create</button>
            <button class="btn-ghost text-xs" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      </Show>

      <div class="space-y-2">
        <For each={jobs()}>
          {(j: any) => (
            <div class="card p-3 flex items-center justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{j.name}</div>
                <div class="text-xs" style="color:var(--text-muted)">
                  {j.expression} · {j.action}
                </div>
                <div class="text-xs" style="color:var(--text-muted)">
                  Last: {j.lastRun ? new Date(j.lastRun).toLocaleString() : 'never'} · Next: {j.nextRun ? new Date(j.nextRun).toLocaleString() : '--'}
                </div>
              </div>
              <div class="flex gap-1">
                <button
                  class="btn-ghost text-xs"
                  style={{ color: j.enabled ? 'var(--success)' : 'var(--text-muted)' }}
                  onClick={() => toggle(j.id)}
                >
                  {j.enabled ? 'On' : 'Off'}
                </button>
                <button class="btn-ghost text-xs text-destructive" onClick={() => remove(j.id)}>Del</button>
              </div>
            </div>
          )}
        </For>
        <Show when={jobs()?.length === 0}>
          <p class="text-xs" style="color:var(--text-muted)">No cron jobs yet.</p>
        </Show>
      </div>
    </div>
  )
}

function SideCarsTab() {
  const [sidecars, { refetch }] = createResource(() => api.listSidecars())
  const [starting, setStarting] = createSignal(false)

  const startOpenCode = async () => {
    setStarting(true)
    try {
      await api.startSidecar('opencode', 'opencode', ['serve'])
      refetch()
    } catch (e) {
      console.error('Failed to start OpenCode:', e)
    }
    setStarting(false)
  }

  const stop = async (id: string) => {
    try {
      await api.stopSidecar(id)
      refetch()
    } catch (e) {
      console.error('Failed to stop sidecar:', e)
    }
  }

  return (
    <div>
      <h2 class="text-sm font-medium mb-3" style="color:var(--text-secondary)">Running SideCars</h2>

      <div class="flex gap-2 mb-4">
        <button class="btn text-xs" onClick={startOpenCode} disabled={starting()}>
          {starting() ? 'Starting...' : 'Start OpenCode'}
        </button>
      </div>

      <div class="space-y-2">
        <For each={sidecars()}>
          {(sc: any) => (
            <div class="card p-3 flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-medium">{sc.name}</div>
                <div class="text-xs" style="color:var(--text-muted)">Port: {sc.port}</div>
              </div>
              <button class="btn-ghost text-xs text-destructive" onClick={() => stop(sc.id)}>
                Stop
              </button>
            </div>
          )}
        </For>
        <Show when={sidecars()?.length === 0}>
          <p class="text-xs" style="color:var(--text-muted)">No sidecars running</p>
        </Show>
      </div>
    </div>
  )
}
