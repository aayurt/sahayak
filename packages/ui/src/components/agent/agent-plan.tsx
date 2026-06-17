import { createSignal, For, Show } from 'solid-js'
import { CheckCircle2, Circle, CircleAlert, CircleDotDashed, CircleX, ChevronDown } from 'lucide-solid'
import { cn } from '../../lib/utils'

interface Subtask {
  id: string
  title: string
  description: string
  status: string
  priority: string
  tools?: string[]
}

interface Task {
  id: string
  title: string
  description: string
  status: string
  priority: string
  level: number
  dependencies: string[]
  subtasks: Subtask[]
}

interface AgentPlanProps {
  tasks?: Task[]
  onTasksChange?: (tasks: Task[]) => void
}

const sampleTasks: Task[] = [
  {
    id: "1",
    title: "Research Project Requirements",
    description: "Gather all necessary information about project scope and requirements",
    status: "in-progress",
    priority: "high",
    level: 0,
    dependencies: [],
    subtasks: [
      { id: "1.1", title: "Interview stakeholders", description: "Conduct interviews with key stakeholders to understand needs", status: "completed", priority: "high", tools: ["communication-agent", "meeting-scheduler"] },
      { id: "1.2", title: "Review existing documentation", description: "Go through all available documentation and extract requirements", status: "in-progress", priority: "medium", tools: ["file-system", "browser"] },
      { id: "1.3", title: "Compile findings report", description: "Create a comprehensive report of all gathered information", status: "need-help", priority: "medium", tools: ["file-system", "markdown-processor"] },
    ],
  },
  {
    id: "2",
    title: "Design System Architecture",
    description: "Create the overall system architecture based on requirements",
    status: "in-progress",
    priority: "high",
    level: 0,
    dependencies: [],
    subtasks: [
      { id: "2.1", title: "Define component structure", description: "Map out all required components and their interactions", status: "pending", priority: "high", tools: ["architecture-planner", "diagramming-tool"] },
      { id: "2.2", title: "Create data flow diagrams", description: "Design diagrams showing how data will flow through the system", status: "pending", priority: "medium", tools: ["diagramming-tool", "file-system"] },
      { id: "2.3", title: "Document API specifications", description: "Write detailed specifications for all APIs in the system", status: "pending", priority: "high", tools: ["api-designer", "openapi-generator"] },
    ],
  },
  {
    id: "3",
    title: "Implementation Planning",
    description: "Create a detailed plan for implementing the system",
    status: "pending",
    priority: "medium",
    level: 1,
    dependencies: ["1", "2"],
    subtasks: [
      { id: "3.1", title: "Resource allocation", description: "Determine required resources and allocate them to tasks", status: "pending", priority: "medium", tools: ["project-manager", "resource-calculator"] },
      { id: "3.2", title: "Timeline development", description: "Create a timeline with milestones and deadlines", status: "pending", priority: "high", tools: ["timeline-generator", "gantt-chart-creator"] },
      { id: "3.3", title: "Risk assessment", description: "Identify potential risks and develop mitigation strategies", status: "pending", priority: "medium", tools: ["risk-analyzer"] },
    ],
  },
  {
    id: "4",
    title: "Development Environment Setup",
    description: "Set up all necessary tools and environments for development",
    status: "in-progress",
    priority: "high",
    level: 0,
    dependencies: [],
    subtasks: [
      { id: "4.1", title: "Install development tools", description: "Set up IDEs, version control, and other necessary development tools", status: "pending", priority: "high", tools: ["shell", "package-manager"] },
      { id: "4.2", title: "Configure CI/CD pipeline", description: "Set up continuous integration and deployment pipelines", status: "pending", priority: "medium", tools: ["github-actions", "gitlab-ci", "jenkins-connector"] },
      { id: "4.3", title: "Set up testing framework", description: "Configure automated testing frameworks for the project", status: "pending", priority: "high", tools: ["test-runner", "shell"] },
    ],
  },
  {
    id: "5",
    title: "Initial Development Sprint",
    description: "Execute the first development sprint based on the plan",
    status: "pending",
    priority: "medium",
    level: 1,
    dependencies: ["4"],
    subtasks: [
      { id: "5.1", title: "Implement core features", description: "Develop the essential features identified in the requirements", status: "pending", priority: "high", tools: ["code-assistant", "github", "file-system", "shell"] },
      { id: "5.2", title: "Perform unit testing", description: "Create and execute unit tests for implemented features", status: "pending", priority: "medium", tools: ["test-runner", "code-coverage-analyzer"] },
      { id: "5.3", title: "Document code", description: "Create documentation for the implemented code", status: "pending", priority: "low", tools: ["documentation-generator", "markdown-processor"] },
    ],
  },
]

function StatusIcon({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5"
  switch (status) {
    case "completed":
      return <CheckCircle2 class={cn(cls, "text-green-500")} />
    case "in-progress":
      return <CircleDotDashed class={cn(cls, "text-blue-500")} />
    case "need-help":
      return <CircleAlert class={cn(cls, "text-yellow-500")} />
    case "failed":
      return <CircleX class={cn(cls, "text-red-500")} />
    default:
      return <Circle class={cn(cls, "text-muted-foreground")} />
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    "in-progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    "need-help": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  }
  return (
    <span class={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", colors[status] || "bg-muted text-muted-foreground")}>
      {status}
    </span>
  )
}

export function AgentPlan(props: AgentPlanProps) {
  const [tasks, setTasks] = createSignal<Task[]>(props.tasks || sampleTasks)
  const [expandedTasks, setExpandedTasks] = createSignal<Set<string>>(new Set(["1"]))
  const [expandedSubtaskDetails, setExpandedSubtaskDetails] = createSignal<Set<string>>(new Set())

  const toggleTask = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleSubtaskDetails = (taskId: string, subtaskId: string) => {
    const key = `${taskId}-${subtaskId}`
    setExpandedSubtaskDetails(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleTaskStatus = (taskId: string) => {
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== taskId) return t
        const statuses = ["completed", "in-progress", "pending", "need-help", "failed"]
        const newStatus = statuses[Math.floor(Math.random() * statuses.length)]
        return {
          ...t,
          status: newStatus,
          subtasks: newStatus === "completed" ? t.subtasks.map(s => ({ ...s, status: "completed" })) : t.subtasks,
        }
      })
      props.onTasksChange?.(next)
      return next
    })
  }

  const toggleSubtaskStatus = (taskId: string, subtaskId: string) => {
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== taskId) return t
        const updatedSubtasks = t.subtasks.map(s => {
          if (s.id !== subtaskId) return s
          return { ...s, status: s.status === "completed" ? "pending" : "completed" }
        })
        const allDone = updatedSubtasks.every(s => s.status === "completed")
        return { ...t, subtasks: updatedSubtasks, status: allDone ? "completed" : t.status }
      })
      props.onTasksChange?.(next)
      return next
    })
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-border/30 shrink-0">
        <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Plan</span>
        <span class="text-[10px] text-muted-foreground/40">{tasks().length} tasks</span>
      </div>
      <div class="flex-1 overflow-y-auto p-3">
        <div class="space-y-0.5">
          <For each={tasks()}>
            {(task, idx) => {
              const isExpanded = () => expandedTasks().has(task.id)
              const isCompleted = task.status === "completed"
              return (
                <div>
                  <div
                    class={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer group",
                      "hover:bg-muted/30"
                    )}
                  >
                    <button
                      class="shrink-0 transition-transform hover:scale-110 active:scale-90"
                      onClick={() => toggleTaskStatus(task.id)}
                    >
                      <StatusIcon status={task.status} />
                    </button>
                    <div
                      class="flex-1 min-w-0 flex items-center gap-2"
                      onClick={() => toggleTask(task.id)}
                    >
                      <span class={cn("text-sm truncate flex-1", isCompleted && "text-muted-foreground line-through")}>
                        {task.title}
                      </span>
                      <div class="flex items-center gap-1.5 shrink-0">
                        <For each={task.dependencies}>
                          {(dep) => (
                            <span class="bg-secondary/40 text-secondary-foreground rounded px-1.5 py-0.5 text-[10px] font-medium">
                              {dep}
                            </span>
                          )}
                        </For>
                        <StatusBadge status={task.status} />
                        <ChevronDown
                          class={cn(
                            "h-3 w-3 text-muted-foreground/40 transition-transform",
                            isExpanded() && "rotate-180"
                          )}
                        />
                      </div>
                    </div>
                  </div>
                  <Show when={isExpanded() && task.subtasks.length > 0}>
                    <div class="ml-4 pl-4 border-l-2 border-dashed border-muted-foreground/20 space-y-0.5 mt-0.5 mb-1">
                      <For each={task.subtasks}>
                        {(subtask) => {
                          const detailsKey = `${task.id}-${subtask.id}`
                          const isDetailsOpen = () => expandedSubtaskDetails().has(detailsKey)
                          const isSubCompleted = subtask.status === "completed"
                          return (
                            <div>
                              <div
                                class={cn(
                                  "flex items-center gap-2 px-2 py-1 rounded-md transition-colors cursor-pointer group",
                                  "hover:bg-muted/20"
                                )}
                                onClick={() => toggleSubtaskDetails(task.id, subtask.id)}
                              >
                                <button
                                  class="shrink-0 transition-transform hover:scale-110 active:scale-90"
                                  onClick={(e) => { e.stopPropagation(); toggleSubtaskStatus(task.id, subtask.id) }}
                                >
                                  <StatusIcon status={subtask.status} size="sm" />
                                </button>
                                <span class={cn("text-xs flex-1", isSubCompleted && "text-muted-foreground line-through")}>
                                  {subtask.title}
                                </span>
                              </div>
                              <Show when={isDetailsOpen()}>
                                <div class="ml-6 pl-3 border-l border-dashed border-muted-foreground/20 text-xs text-muted-foreground pb-1 pt-0.5 space-y-1">
                                  <p>{subtask.description}</p>
                                  <Show when={subtask.tools && subtask.tools.length > 0}>
                                    <div class="flex flex-wrap items-center gap-1">
                                      <span class="text-[10px] font-medium">MCP:</span>
                                      <For each={subtask.tools}>
                                        {(tool) => (
                                          <span class="bg-secondary/40 text-secondary-foreground rounded px-1.5 py-0.5 text-[10px] font-medium">
                                            {tool}
                                          </span>
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                            </div>
                          )
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </div>
    </div>
  )
}
