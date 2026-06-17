import { type Component, splitProps } from 'solid-js'
import { cn } from '../../lib/utils'

interface SeparatorProps {
  class?: string
  orientation?: 'horizontal' | 'vertical'
}

const Separator: Component<SeparatorProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'orientation'])
  return (
    <div
      class={cn(
        'shrink-0 bg-border',
        (local.orientation ?? 'horizontal') === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        local.class,
      )}
      {...others}
    />
  )
}

export { Separator }
