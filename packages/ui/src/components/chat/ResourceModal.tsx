import { createResource, createSignal, createEffect, For, Show } from 'solid-js'
import { api } from '../../lib/api-client'
import BasicModal from '../ui/basic-modal'
import { Plus, X, Pencil, Trash2 } from 'lucide-solid'

interface ResourceAttachment {
  id: string
  name: string
  type: 'folder' | 'ssh'
  path?: string
  host?: string
  permissions: string
}

interface ResourceModalProps {
  open: boolean
  onClose: () => void
  attached: ResourceAttachment[]
  onToggle: (r: ResourceAttachment) => void
}

export function ResourceModal(props: ResourceModalProps) {
  const [rawResources, resourceActions] = createResource(() => api.listResources() as any)
  const resources = () => (rawResources() || []) as ResourceAttachment[]
  const [btnLoading, setBtnLoading] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const fetching = () => (rawResources as any).loading

  createEffect(() => {
    if (props.open) resourceActions.refetch()
  })

  // add / edit state
  const [showForm, setShowForm] = createSignal<'add' | 'edit' | null>(null)
  const [editId, setEditId] = createSignal<string | null>(null)
  const [formType, setFormType] = createSignal<'folder' | 'ssh'>('folder')
  const [formName, setFormName] = createSignal('')
  const [formPath, setFormPath] = createSignal('/')
  const [formSSHString, setFormSSHString] = createSignal('')
  const [formPermissions, setFormPermissions] = createSignal('read-only')

  function resetForm() {
    setShowForm(null)
    setEditId(null)
    setFormName('')
    setFormPath('/')
    setFormSSHString('')
    setFormPermissions('read-only')
  }

  function startEdit(r: ResourceAttachment) {
    setEditId(r.id)
    setFormType(r.type)
    setFormName(r.name)
    setFormPath(r.path || '/')
    setFormSSHString(r.host || '')
    setFormPermissions(r.permissions)
    setShowForm('edit')
  }

  async function handleSave() {
    if (!formName()) return
    setError(null)
    try {
      if (showForm() === 'add') {
        const data: any = { name: formName(), type: formType(), permissions: formPermissions() }
        if (formType() === 'folder') {
          if (!formPath()) return
          data.path = formPath()
        } else {
          if (!formSSHString()) return
          data.host = formSSHString()
        }
        await api.createResource(data)
      } else if (showForm() === 'edit' && editId()) {
        await api.updateResource(editId()!, { name: formName(), permissions: formPermissions() })
      }
      resetForm()
      resourceActions.refetch()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function deleteResource(id: string) {
    setError(null)
    try {
      await api.deleteResource(id)
      resourceActions.refetch()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function loadFolder(r: ResourceAttachment) {
    if (r.type !== 'folder' || !r.path) return
    setBtnLoading(r.id)
    setError(null)
    try {
      const projects = await api.listProjects()
      const existing = projects.find((p: any) => p.path === r.path)
      if (!existing) {
        await api.addProject(r.path, r.name)
      }
      await api.startGraphify(r.id)
      if (!props.attached.some((a) => a.id === r.id)) {
        props.onToggle(r)
      }
      resourceActions.refetch()
    } catch (e) {
      setError((e as Error).message)
    }
    setBtnLoading(null)
  }

  return (
    <BasicModal isOpen={props.open} onClose={props.onClose} title="Attach Resources" size="md">
      <Show when={error()}>
        <div class="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs" style="color:var(--danger)">{error()}</div>
      </Show>

      <Show when={showForm()}>
        <div class="mb-3 rounded-lg border p-3 space-y-2" style="border-color:var(--border);background:var(--bg-primary)">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium">{showForm() === 'add' ? 'Add Resource' : 'Edit Resource'}</span>
            <button class="rounded p-1 transition-colors hover:bg-accent/30" onClick={resetForm}>
              <X class="h-3.5 w-3.5" />
            </button>
          </div>

          <input class="input w-full text-xs" placeholder="Name" value={formName()} onInput={(e) => setFormName(e.currentTarget.value)} />

          <div class="flex gap-2">
            <button
              class="btn text-xs flex-1"
              classList={{ active: formType() === 'folder' }}
              onClick={() => setFormType('folder')}
              disabled={showForm() === 'edit'}
            >Folder</button>
            <button
              class="btn text-xs flex-1"
              classList={{ active: formType() === 'ssh' }}
              onClick={() => setFormType('ssh')}
              disabled={showForm() === 'edit'}
            >SSH</button>
          </div>

          <Show when={formType() === 'folder'}>
            <input class="input w-full text-xs" placeholder="/path/to/folder" value={formPath()} onInput={(e) => setFormPath(e.currentTarget.value)} disabled={showForm() === 'edit'} />
          </Show>

          <Show when={formType() === 'ssh'}>
            <input class="input w-full text-xs" placeholder="ssh user@host -p 22" value={formSSHString()} onInput={(e) => setFormSSHString(e.currentTarget.value)} disabled={showForm() === 'edit'} />
          </Show>

          <select class="input w-full text-xs" value={formPermissions()} onChange={(e) => setFormPermissions(e.currentTarget.value)}>
            <option value="read-only">Read-only</option>
            <option value="read-write">Read-write</option>
          </select>

          <button class="btn text-xs w-full" onClick={handleSave}>{showForm() === 'add' ? 'Create' : 'Save'}</button>
        </div>
      </Show>

      <div class="overflow-y-auto space-y-1" style="max-height:300px">
        <Show when={fetching()}>
          <p class="text-xs p-2" style="color:var(--text-muted)">Loading...</p>
        </Show>
        <For each={resources()}>
          {(r: ResourceAttachment) => {
            const isAttached = props.attached.some((a) => a.id === r.id)
            const isLoading = btnLoading() === r.id
            return (
              <div class="flex items-center gap-2 rounded-lg text-left text-sm transition-colors hover:bg-accent/30 px-2 py-1.5"
                style={isAttached ? 'background:var(--accent);color:var(--accent-foreground)' : 'color:var(--text-primary)'}
              >
                <button
                  type="button"
                  onClick={() => props.onToggle(r)}
                  class="flex items-center gap-2 flex-1 min-w-0"
                >
                  <span>{r.type === 'ssh' ? '🔗' : '📁'}</span>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium truncate text-xs">{r.name}</div>
                    <div class="text-[10px] truncate" style="color:var(--text-muted)">
                      {r.type === 'folder' ? r.path : r.host?.replace(/^ssh\s+/i, '')}
                    </div>
                  </div>
                  <Show when={isAttached}>
                    <span class="text-xs font-bold shrink-0">✓</span>
                  </Show>
                </button>

                <button class="shrink-0 rounded p-1 transition-colors hover:bg-accent/50" title="Edit"
                  onClick={() => startEdit(r)}
                >
                  <Pencil class="h-3 w-3" />
                </button>

                <button class="shrink-0 rounded p-1 transition-colors hover:bg-accent/50" title="Delete"
                  onClick={() => deleteResource(r.id)}
                >
                  <Trash2 class="h-3 w-3" />
                </button>

                <Show when={r.type === 'folder' && r.path}>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => loadFolder(r)}
                    class="shrink-0 rounded px-2 py-1 text-[10px] font-medium transition-colors hover:bg-accent disabled:opacity-50"
                    style="background:var(--bg-primary);color:var(--accent)"
                  >
                    {isLoading ? '…' : '⚡'}
                  </button>
                </Show>
              </div>
            )
          }}
        </For>
        <Show when={!fetching() && resources().length === 0}>
          <p class="text-xs p-2" style="color:var(--text-muted)">
            No resources configured.
          </p>
        </Show>
      </div>

      <div class="mt-3 flex items-center justify-between gap-2">
        <button
          class="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
          style="color:var(--text-primary);border-color:var(--border)"
          onClick={() => { setShowForm('add'); setFormType('folder'); setFormName(''); setFormPath('/'); setFormSSHString(''); setFormPermissions('read-only') }}
        >
          <Plus class="h-3 w-3" /> Add
        </button>
        <button
          class="rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
          style="color:var(--text-primary);border-color:var(--border)"
          onClick={props.onClose}
        >
          Done
        </button>
      </div>
    </BasicModal>
  )
}
