import { Show, For, createEffect } from 'solid-js'
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { Avatar } from '../ui/avatar'
import { Badge } from '../ui/badge'

marked.use(markedHighlight({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
}))

interface ChatAttachment {
  id: string
  name: string
  mimeType?: string
}

interface ChatMessageProps {
  role: string
  content: string
  model?: string
  onSaveToVault?: () => void
  sessionId?: string
  attachments?: ChatAttachment[]
}

export function ChatMessage(props: ChatMessageProps) {
  const isUser = props.role === 'user'
  const isAssistant = props.role === 'assistant'
  let contentRef: HTMLDivElement | undefined

  const html = () => {
    const raw = marked.parse(props.content, { async: false }) as string
    return DOMPurify.sanitize(raw)
  }

  createEffect(() => {
    if (!contentRef) return
    html()
    contentRef.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return
      const btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.textContent = 'Copy'
      btn.onclick = async () => {
        const code = pre.querySelector('code')?.textContent || pre.textContent || ''
        await navigator.clipboard.writeText(code)
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = 'Copy' }, 2000)
      }
      pre.style.position = 'relative'
      pre.appendChild(btn)
    })
  })

  return (
    <div
      class={`flex gap-3 px-4 py-3 rounded-lg ${isUser ? 'bg-muted/50' : 'bg-background'}`}
    >
      <Avatar
        class={`w-8 h-8 mt-0.5 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        fallback={isUser ? 'U' : isAssistant ? 'S' : 'S'}
      />
      <div class="flex-1 min-w-0 space-y-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-muted-foreground">
            {isUser ? 'You' : isAssistant ? 'Assistant' : 'System'}
          </span>
          {props.model && (
            <Badge
              variant="outline"
              class={`text-[10px] px-1.5 py-0 h-4 ${
                props.model === 'gemini'
                  ? 'border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10'
                  : props.model === 'opencode'
                  ? 'border-cyan-500/30 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10'
                  : ''
              }`}
            >
              {props.model}
            </Badge>
          )}
          <Show when={isAssistant && props.onSaveToVault}>
            <button
              onClick={props.onSaveToVault}
              class="ml-auto text-[10px] text-muted-foreground/50 hover:text-primary transition-colors cursor-pointer"
              title="Save to Vault"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </Show>
        </div>

        <div
          ref={contentRef}
          class="max-w-none text-sm leading-relaxed text-foreground
            [&_strong]:font-semibold [&_strong]:text-foreground
            [&_em]:italic
            [&_code]:text-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:font-mono
            [&_pre]:relative [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:pt-8 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:font-mono [&_pre]:leading-relaxed
            [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs [&_pre_code]:font-mono
            [&_.copy-btn]:absolute [&_.copy-btn]:top-1.5 [&_.copy-btn]:right-1.5 [&_.copy-btn]:text-[10px] [&_.copy-btn]:px-2 [&_.copy-btn]:py-0.5 [&_.copy-btn]:rounded [&_.copy-btn]:border [&_.copy-btn]:border-border [&_.copy-btn]:bg-background [&_.copy-btn]:text-muted-foreground [&_.copy-btn]:cursor-pointer [&_.copy-btn]:hover:bg-muted [&_.copy-btn]:transition-colors
            [&_a]:text-primary [&_a]:underline
            [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground
            [&_ul]:list-disc [&_ul]:pl-5
            [&_ol]:list-decimal [&_ol]:pl-5
            [&_h1]:text-lg [&_h1]:font-semibold
            [&_h2]:text-base [&_h2]:font-semibold
            [&_h3]:text-sm [&_h3]:font-semibold
            [&_table]:w-full [&_table]:border-collapse [&_table]:my-2
            [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:border [&_th]:border-border
            [&_td]:p-2 [&_td]:text-xs [&_td]:border [&_td]:border-border
            [&_tr:nth-child(even)_td]:bg-muted/50
            [&_hr]:my-3 [&_hr]:border-border"
          innerHTML={html()}
        />
        <Show when={isUser && props.attachments?.length && props.sessionId}>
          <div class="flex flex-wrap gap-2 mt-2">
            <For each={props.attachments}>
              {(att) => (
                <img
                  src={`/api/chat/sessions/${props.sessionId}/attachments/${att.id}/data`}
                  alt={att.name}
                  class="max-h-48 rounded-lg border object-contain bg-muted"
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
