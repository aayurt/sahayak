import { createSignal, createEffect, type JSX } from 'solid-js'
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  BrainCircuit,
} from 'lucide-solid'

export type PlanStepStatus = 'pending' | 'active' | 'success' | 'error'

export interface PlanStep {
  id: string
  title: string
  content?: JSX.Element
  status: PlanStepStatus
  icon?: JSX.Element
  duration?: string
  defaultExpanded?: boolean
}

export interface AgentPlanningProps {
  title?: string
  steps?: PlanStep[]
}

function getStatusColor(status: PlanStepStatus) {
  switch (status) {
    case 'success':
      return 'bg-emerald-100 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400'
    case 'active':
      return 'bg-blue-100 text-blue-600 ring-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400'
    case 'error':
      return 'bg-rose-100 text-rose-600 ring-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400'
    case 'pending':
      return 'bg-secondary text-muted-foreground ring-border/50 dark:bg-secondary/50'
  }
}

export function AgentPlanning(props: AgentPlanningProps) {
  const title = () => props.title ?? 'Agent is planning'
  const steps = () => props.steps ?? []

  const [isMainExpanded, setIsMainExpanded] = createSignal(true)

  const [expandedSteps, setExpandedSteps] = createSignal<Record<string, boolean>>({})

  createEffect(() => {
    setExpandedSteps(
      Object.fromEntries(steps().map((s) => [s.id, s.defaultExpanded ?? false]))
    )
  })

  const toggleStep = (id: string, e: MouseEvent) => {
    e.stopPropagation()
    setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const hasActive = () => steps().some((s) => s.status === 'active')
  const allSuccess = () => steps().every((s) => s.status === 'success')

  return (
    <div class="w-full max-w-2xl mx-auto my-4 font-sans text-foreground">
      <div class="bg-card border border-border shadow-sm rounded-xl overflow-hidden transition-all duration-300">
        <div
          onClick={() => setIsMainExpanded(!isMainExpanded())}
          class={`flex items-center justify-between px-4 py-3.5 cursor-pointer transition-colors select-none ${
            isMainExpanded() ? 'bg-secondary/30 border-b border-border/50' : 'hover:bg-secondary/30'
          }`}
        >
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-5 h-5">
              {hasActive() ? (
                <Loader2 class="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
              ) : allSuccess() ? (
                <Check class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <BrainCircuit class="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <span class="text-[15px] font-semibold text-foreground/90 tracking-tight">
              {title()}
            </span>
          </div>
          <div class="flex items-center justify-center w-6 h-6 rounded-md hover:bg-secondary text-muted-foreground transition-colors">
            {isMainExpanded() ? <ChevronDown class="w-4 h-4" /> : <ChevronRight class="w-4 h-4" />}
          </div>
        </div>

        <div
          class={`grid transition-all duration-500 ease-in-out bg-card ${
            isMainExpanded() ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div class="overflow-hidden">
            <div class="p-5 flex flex-col">
              {steps().map((step, index) => {
                const isStepExpanded = () => expandedSteps()[step.id]
                const isLast = index === steps().length - 1
                return (
                  <div
                    class={`relative flex gap-4 animate-in fade-in slide-in-from-top-4 duration-500 fill-mode-both ${
                      step.status === 'pending' ? 'opacity-60 grayscale' : 'opacity-100'
                    }`}
                    style={{ 'animation-delay': `${index * 80}ms` }}
                  >
                    {!isLast && (
                      <div class="absolute left-[11px] top-7 bottom-[-10px] w-[2px] bg-border/60 z-0" />
                    )}

                    <div class="relative z-10 flex-none w-6 h-6 mt-0.5">
                      <div class={`flex items-center justify-center w-full h-full rounded-full ring-4 ring-card transition-colors duration-300 ${getStatusColor(step.status)}`}>
                        {step.status === 'success' ? (
                          <Check class="w-3.5 h-3.5" />
                        ) : step.status === 'active' ? (
                          <Loader2 class="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          step.icon || <div class="w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                      </div>
                    </div>

                    <div class="flex-1 pb-6">
                      <div
                        class={`flex items-center justify-between group rounded-md -mx-2 px-2 py-1 transition-colors ${
                          step.content ? 'cursor-pointer hover:bg-secondary/50' : ''
                        }`}
                        onClick={(e) => step.content && toggleStep(step.id, e)}
                      >
                        <span
                          class={`text-[14px] tracking-tight transition-colors duration-200 ${
                            step.status === 'active'
                              ? 'text-foreground font-semibold'
                              : step.status === 'error'
                                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                : 'text-foreground/80 group-hover:text-foreground font-medium'
                          }`}
                        >
                          {step.title}
                        </span>

                        <div class="flex items-center gap-3">
                          {step.duration && (
                            <span class="text-[11px] font-mono text-muted-foreground tabular-nums">
                              {step.duration}
                            </span>
                          )}
                          {step.content && (
                            <div class="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
                              {isStepExpanded() ? <ChevronDown class="w-4 h-4" /> : <ChevronRight class="w-4 h-4" />}
                            </div>
                          )}
                        </div>
                      </div>

                      {step.content && (
                        <div
                          class={`grid transition-all duration-400 ease-in-out ${
                            isStepExpanded() ? 'grid-rows-[1fr] mt-2 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'
                          }`}
                        >
                          <div class="overflow-hidden">
                            <div class="pt-1 pb-2">
                              {step.content}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
