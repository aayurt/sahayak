import { createSignal, For, Show } from 'solid-js'
import { cn } from '../../lib/utils'
import { ChevronLeft, ChevronRight, Send, SkipForward } from 'lucide-solid'

interface QuestionOption {
  id: string
  label: string
}

interface Question {
  kind: 'single' | 'multiple' | 'text'
  title: string
  description?: string
  options?: QuestionOption[]
  allowCustom?: boolean
}

interface QuestionToolProps {
  questions: Question[]
  questionIndex: number
  totalQuestions: number
  onPreviousQuestion: () => void
  onNextQuestion: () => void
  submitLabel?: string
  skipLabel?: string
  onSubmitAnswer: (answer: { questionIndex: number; answer: string | string[] }) => void
}

export function QuestionTool(props: QuestionToolProps) {
  const [selectedOption, setSelectedOption] = createSignal<string | null>(null)
  const [selectedOptions, setSelectedOptions] = createSignal<Set<string>>(new Set())
  const [customText, setCustomText] = createSignal('')

  const current = () => props.questions[props.questionIndex - 1]
  const isLast = () => props.questionIndex >= props.totalQuestions
  const isFirst = () => props.questionIndex <= 1
  const isMultiple = () => current()?.kind === 'multiple'

  const isSelected = (id: string) => isMultiple() ? selectedOptions().has(id) : selectedOption() === id

  const handleSelect = (id: string) => {
    setCustomText('')
    if (isMultiple()) {
      setSelectedOptions(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      setSelectedOption(prev => prev === id ? null : id)
    }
  }

  const handleSubmit = () => {
    let answer: string | string[]
    if (customText()) {
      answer = customText()
    } else if (isMultiple()) {
      answer = Array.from(selectedOptions())
    } else {
      answer = selectedOption() || ''
    }
    props.onSubmitAnswer({ questionIndex: props.questionIndex, answer })
    setSelectedOption(null)
    setSelectedOptions(new Set())
    setCustomText('')
    if (!isLast()) {
      props.onNextQuestion()
    }
  }

  const handleSkip = () => {
    props.onSubmitAnswer({ questionIndex: props.questionIndex, answer: '' })
    setSelectedOption(null)
    setSelectedOptions(new Set())
    setCustomText('')
    if (!isLast()) {
      props.onNextQuestion()
    }
  }

  const hasSelection = () => isMultiple() ? selectedOptions().size > 0 : selectedOption() !== null

  return (
    <div class="border border-border/30 rounded-xl overflow-hidden bg-background/95 shadow-sm">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
          Question {props.questionIndex} of {props.totalQuestions}
        </span>
        <Show when={current()?.kind}>
          <span class="text-[10px] text-muted-foreground/40 capitalize">{current()?.kind}</span>
        </Show>
      </div>

      {/* Progress bar */}
      <div class="h-1 bg-muted/30">
        <div
          class="h-full transition-all duration-300 rounded-r-full"
          style={{
            width: `${(props.questionIndex / props.totalQuestions) * 100}%`,
            background: 'var(--accent)',
          }}
        />
      </div>

      {/* Question content */}
      <div class="p-4 space-y-4">
        <div>
          <h3 class="text-sm font-medium">{current()?.title}</h3>
          <Show when={current()?.description}>
            <p class="text-xs text-muted-foreground/70 mt-1">{current()?.description}</p>
          </Show>
          <Show when={isMultiple() && current()?.options}>
            <p class="text-[10px] text-muted-foreground/40 mt-1">Select all that apply</p>
          </Show>
        </div>

        <Show when={current()?.options}>
          <div class="space-y-1.5">
            <For each={current()?.options}>
              {(option) => (
                <button
                  type="button"
                  class={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-all border',
                    isSelected(option.id)
                      ? 'border-2 font-medium'
                      : 'border-border/30 hover:border-border/60',
                  )}
                  style={isSelected(option.id)
                    ? { 'border-color': 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }
                    : {}
                  }
                  onClick={() => handleSelect(option.id)}
                >
                  {isMultiple() && (
                    <span class="inline-block w-4 h-4 mr-2 rounded border border-muted-foreground/30 align-middle text-[10px] leading-4 text-center"
                      style={isSelected(option.id) ? { background: 'var(--accent)', 'border-color': 'var(--accent)', color: 'var(--accent-foreground)' } : {}}
                    >
                      {isSelected(option.id) ? '✓' : ''}
                    </span>
                  )}
                  {option.label}
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={current()?.allowCustom}>
          <div class="space-y-1.5">
            <label class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              Or type your own answer
            </label>
            <textarea
              class="w-full rounded-lg border border-border/30 bg-transparent px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent/50 transition-colors"
              rows={2}
              placeholder="Type your answer..."
              value={customText()}
              onInput={(e) => { setCustomText(e.currentTarget.value); setSelectedOption(null); setSelectedOptions(new Set()) }}
            />
          </div>
        </Show>
      </div>

      {/* Footer */}
      <div class="flex items-center justify-between px-4 py-2.5 border-t border-border/30">
        <button
          type="button"
          class={cn(
            'flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors',
            isFirst() ? 'opacity-30 cursor-not-allowed' : 'hover:bg-muted/30',
          )}
          disabled={isFirst()}
          onClick={props.onPreviousQuestion}
        >
          <ChevronLeft class="h-3.5 w-3.5" />
          Previous
        </button>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors hover:bg-muted/30 text-muted-foreground/60"
            onClick={handleSkip}
          >
            <SkipForward class="h-3 w-3" />
            {props.skipLabel || 'Skip'}
          </button>
          <button
            type="button"
            class="flex items-center gap-1 text-xs px-3 py-1 rounded-md transition-colors font-medium"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-foreground)',
            }}
            disabled={!hasSelection() && !customText()}
            onClick={handleSubmit}
          >
            <Send class="h-3 w-3" />
            {isLast() ? (props.submitLabel || 'Submit') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
