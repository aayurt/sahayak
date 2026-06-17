import { createResource, createSignal, For, Show } from 'solid-js'
import { api } from '../../lib/api-client'
import { Button } from '../ui/button'
import { Folder, FileText, ChevronRight, ChevronDown, BookOpen, RefreshCw } from 'lucide-solid'

export function VaultBrowser() {
  const [vault, { refetch }] = createResource(() => api.listVault())
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null)
  const [fileContent, { refetch: refetchContent }] = createResource(selectedFile, async (path) => {
    if (!path) return null
    return api.readVaultFile(path)
  })
  const [expandedDirs, setExpandedDirs] = createSignal<Set<string>>(
    new Set(['daily', 'agents', 'cron', 'metrics', 'research'])
  )

  function toggleDir(path: string) {
    const s = new Set(expandedDirs())
    if (s.has(path)) s.delete(path)
    else s.add(path)
    setExpandedDirs(s)
  }

  function renderTree(entries: any[], level = 0): any {
    return (
      <For each={entries}>
        {(entry: any) => (
          <div>
            {entry.type === 'directory' ? (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start gap-1 h-7 text-xs font-normal"
                  style={{ 'padding-left': `${8 + level * 14}px` }}
                  onClick={() => toggleDir(entry.relativePath)}
                >
                  {expandedDirs().has(entry.relativePath) ? (
                    <ChevronDown class="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight class="h-3 w-3 shrink-0" />
                  )}
                  <Folder class="h-3 w-3 text-muted-foreground" />
                  <span class="truncate">{entry.name}</span>
                </Button>
                {expandedDirs().has(entry.relativePath) && entry.children && (
                  <div>{renderTree(entry.children, level + 1)}</div>
                )}
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                class={`w-full justify-start gap-2 h-7 text-xs font-normal ${
                  selectedFile() === entry.relativePath ? 'bg-accent text-accent-foreground' : ''
                }`}
                style={{ 'padding-left': `${8 + level * 14}px` }}
                onClick={() => setSelectedFile(entry.relativePath)}
              >
                <FileText class="h-3 w-3 shrink-0 text-muted-foreground" />
                <span class="truncate">{entry.name}</span>
              </Button>
            )}
          </div>
        )}
      </For>
    )
  }

  return (
    <div class="flex h-full overflow-hidden">
      <div class="w-64 shrink-0 border-r border-border bg-muted/30">
        <div class="flex items-center justify-between px-3 py-2 border-b border-border">
          <div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <BookOpen class="h-3.5 w-3.5" />
            Vault
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            onClick={() => { refetch(); if (selectedFile()) refetchContent() }}
            title="Refresh"
          >
            <RefreshCw class="h-3 w-3" />
          </Button>
        </div>
        <div class="overflow-y-auto h-[calc(100%-33px)]">
          <div class="p-1">
            {vault()?.tree ? renderTree(vault()!.tree) : (
              <div class="text-xs text-muted-foreground px-2 py-4 text-center">
                Loading...
              </div>
            )}
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <Show
          when={fileContent()}
          fallback={
            <div class="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a note to view
            </div>
          }
        >
          <div class="max-w-3xl mx-auto p-6">
            <article class="prose dark:prose-invert max-w-none text-sm">
              <div class="markdown-body" innerHTML={renderMarkdown(fileContent()!.content)} />
            </article>
            <div class="mt-4 text-xs text-muted-foreground">
              Modified: {new Date(fileContent()!.modifiedAt).toLocaleString()}
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}

function renderMarkdown(md: string): string {
  let html = md
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="p-3 rounded my-2 overflow-x-auto bg-muted text-muted-foreground text-xs"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-accent-foreground text-xs">$1</code>')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '<span class="px-1 rounded bg-accent/20 text-accent cursor-pointer" title="$1">$2$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-semibold mt-5 mb-3">$1</h1>')
    .replace(/^---$/gm, '<hr class="my-4 border-border" />')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/#(\w[\w-]*)/g, '<span class="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">#$1</span>')
    .replace(/\n\n/g, '</p><p class="my-2">')
  return `<p class="my-2">${html}</p>`
}
