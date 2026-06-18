import { createSignal, Show, For } from 'solid-js'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { 
  SendHorizonal, Square, Mic, X, Settings2, 
  Image, Globe, Pen, Telescope, Lightbulb, Paperclip 
} from 'lucide-solid'

interface ResourceAttachment {
  id: string
  name: string
  type: 'folder' | 'ssh'
}

interface AttachedFile {
  id: string
  name: string
  uploading?: boolean
}

interface ComposerProps {
  onSend: (message: string) => void
  onStop?: () => void
  disabled?: boolean
  model?: string
  attachedResources?: ResourceAttachment[]
  attachedFiles?: AttachedFile[]
  onAttachFiles?: (files: File[]) => void
  onRemoveFile?: (index: number) => void
}

const toolsList = [
  { id: 'image', name: 'Create an image', icon: Image },
  { id: 'search', name: 'Search the web', icon: Globe },
  { id: 'code', name: 'Write or code', icon: Pen },
  { id: 'research', name: 'Deep research', icon: Telescope },
  { id: 'think', name: 'Think longer', icon: Lightbulb },
]

export function Composer(props: ComposerProps) {
  const [input, setInput] = createSignal('')
  const [selectedTool, setSelectedTool] = createSignal<string | null>(null)
  const [toolsOpen, setToolsOpen] = createSignal(false)
  let textareaRef: HTMLTextAreaElement | undefined
  let fileInputRef: HTMLInputElement | undefined

  function handleSubmit() {
    const msg = input().trim()
    if (!msg || props.disabled) return
    props.onSend(msg)
    setInput('')
    if (textareaRef) {
      textareaRef.style.height = 'auto'
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput() {
    if (textareaRef) {
      textareaRef.style.height = 'auto'
      textareaRef.style.height = Math.min(textareaRef.scrollHeight, 200) + 'px'
    }
  }

  const canSend = () => input().trim().length > 0 && !props.disabled
  const activeTool = () => toolsList.find((t) => t.id === selectedTool())

  return (
    <div class="flex flex-col rounded-[28px] p-2 shadow-sm border bg-card dark:border-transparent">
      <textarea
        ref={textareaRef!}
        value={input()}
        onInput={(e) => {
          setInput(e.currentTarget.value)
          handleInput()
        }}
        onKeyDown={handleKeydown}
        placeholder="Message..."
        rows={1}
        class="custom-scrollbar w-full resize-none border-0 bg-transparent px-3 py-3 text-foreground placeholder:text-muted-foreground focus:ring-0 focus-visible:outline-none min-h-12"
      />

      <Show when={props.attachedResources?.length || props.attachedFiles?.length}>
        <div class="flex flex-wrap gap-1.5 px-3 pb-1">
          <For each={props.attachedResources}>
            {(r) => (
              <span class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border" style="border-color:var(--accent);color:var(--accent)">
                {r.type === 'ssh' ? '🔗' : '📁'} {r.name}
              </span>
            )}
          </For>
          <For each={props.attachedFiles}>
            {(f, i) => (
              <span class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400">
                🖼️ {f.name}
                <button type="button" onClick={() => props.onRemoveFile?.(i())} class="hover:opacity-70">
                  <X class="h-2.5 w-2.5" />
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>

      <div class="flex items-center gap-1 px-1 pb-1">
        <input
          type="file"
          ref={fileInputRef!}
          accept="image/*"
          multiple
          class="hidden"
          onChange={(e) => {
            const files = e.currentTarget.files
            if (files && files.length > 0) {
              props.onAttachFiles?.(Array.from(files))
              e.currentTarget.value = ''
            }
          }}
        />
        <Show when={props.model === 'gemini'}>
          <Tooltip>
            <TooltipTrigger as="button" type="button" onClick={() => fileInputRef?.click()} class="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none">
              <Paperclip class="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>
              <p class="text-xs">Attach image</p>
            </TooltipContent>
          </Tooltip>
        </Show>
        <div class="relative">
          <Tooltip>
            <TooltipTrigger as="button" type="button" onClick={() => setToolsOpen(!toolsOpen())} class="flex h-8 items-center gap-1.5 rounded-full px-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none">
              <Settings2 class="h-4 w-4" />
              <span class="text-xs">Tools</span>
            </TooltipTrigger>
            <TooltipContent>
              <p class="text-xs">Explore Tools</p>
            </TooltipContent>
          </Tooltip>

          <Show when={toolsOpen()}>
            <>
              <div class="fixed inset-0 z-40" onClick={() => setToolsOpen(false)} />
              <div
                class="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-xl bg-popover p-2 text-popover-foreground shadow-md outline-none"
              >
                <div class="flex flex-col gap-1">
                  <For each={toolsList}>
                    {(tool) => (
                      <button
                        type="button"
                        onClick={() => { setSelectedTool(tool.id); setToolsOpen(false) }}
                        class="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-accent"
                      >
                        <tool.icon class="h-4 w-4 shrink-0" />
                        <span>{tool.name}</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </>
          </Show>
        </div>

        <Show when={activeTool()}>
          <div class="h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => setSelectedTool(null)}
            class="flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-sky-600 dark:text-sky-400 transition-colors hover:bg-accent"
          >
            <Show when={activeTool()}>
              {(t) => {
                const Icon = t().icon
                return <Icon class="h-3.5 w-3.5" />
              }}
            </Show>
            {activeTool()?.name}
            <X class="h-3.5 w-3.5" />
          </button>
        </Show>

        <div class="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger as="button" type="button" class="flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none">
              <Mic class="h-[18px] w-[18px]" />
            </TooltipTrigger>
            <TooltipContent>
              <p class="text-xs">Voice input</p>
            </TooltipContent>
          </Tooltip>
          <Show when={props.disabled} fallback={
            <button
              type="button"
              onClick={handleSubmit}
              // disabled={!canSend()}
              class="flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:pointer-events-none bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40"
              title="Send"
            >
              <SendHorizonal class="h-[18px] w-[18px]" />
            </button>
          }>
            <button
              type="button"
              onClick={() => props.onStop?.()}
              class="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              title="Stop streaming"
            >
              <Square class="h-[18px] w-[18px]" />
            </button>
          </Show>
        </div>
      </div>
    </div>
  )
}
