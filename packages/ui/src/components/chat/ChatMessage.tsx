import { Show } from 'solid-js'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Avatar } from '../ui/avatar'
import { Badge } from '../ui/badge'

interface ChatMessageProps {
  role: string
  content: string
  model?: string
  onSaveToVault?: () => void
}

export function ChatMessage(props: ChatMessageProps) {
  const isUser = props.role === 'user'
  const isAssistant = props.role === 'assistant'

  const html = () => {
    const raw = marked.parse(props.content, { async: false }) as string
    return DOMPurify.sanitize(raw)
  }

  return (
    <div
      class={`flex gap-3 px-4 py-3 ${isUser ? 'bg-muted/50' : 'bg-background'}`}
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
            <Badge variant="outline" class="text-[10px] px-1.5 py-0 h-4">
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
          class="max-w-none text-sm leading-relaxed text-foreground [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_code]:text-sm [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold"
          innerHTML={html()}
        />
      </div>
    </div>
  )
}
