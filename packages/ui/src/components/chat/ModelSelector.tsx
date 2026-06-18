interface ModelSelectorProps {
  value: string
  onChange: (model: string) => void
  disabled?: boolean
}

const MODELS = [
  { id: 'opencode', name: 'OpenCode' },
  { id: 'gemini', name: 'Gemini (Playwright)' },
]

export function ModelSelector(props: ModelSelectorProps) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      disabled={props.disabled}
      class="flex h-8 w-44 items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {MODELS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  )
}
