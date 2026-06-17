import { type Component, splitProps } from 'solid-js'
import * as SwitchPrimitive from '@kobalte/core/switch'
import { cn } from '../../lib/utils'

const Switch: Component<SwitchPrimitive.SwitchRootProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <SwitchPrimitive.Root
      class={cn('peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input', local.class)}
      {...others}
    >
      <SwitchPrimitive.Input />
      <SwitchPrimitive.Control>
        <SwitchPrimitive.Thumb
          class={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0',
          )}
        />
      </SwitchPrimitive.Control>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
