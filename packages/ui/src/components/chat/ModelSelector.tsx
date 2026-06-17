import { createResource } from 'solid-js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { api } from '../../lib/api-client'

interface ModelOption {
  id: string
  name?: string
}

interface ModelSelectorProps {
  value: string
  onChange: (model: string) => void
}

export function ModelSelector(props: ModelSelectorProps) {
  const [models] = createResource(() => api.listModels())

  const options = () => {
    const m = models()
    if (m?.models?.length) return m.models as ModelOption[]
    return [{ id: 'default', name: 'Default' }]
  }

  const selectedOption = () => options().find((o) => o.id === props.value)

  return (
    <Select<ModelOption>
      value={selectedOption()}
      onChange={(opt) => {
        if (opt) props.onChange(opt.id)
      }}
      options={options()}
      optionValue={(opt) => opt.id}
      optionTextValue={(opt) => opt.name || opt.id}
      placeholder="Select model"
      itemComponent={(itemProps) => (
        <SelectItem item={itemProps.item}>
          {itemProps.item.rawValue.name || itemProps.item.rawValue.id}
        </SelectItem>
      )}
    >
      <SelectTrigger class="w-44 h-8 text-xs">
        <SelectValue<ModelOption>>
          {(state) => state.selectedOption()?.name || state.selectedOption()?.id || 'Select model'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>
  )
}
