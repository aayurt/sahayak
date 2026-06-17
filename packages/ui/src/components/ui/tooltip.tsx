import { type Component, splitProps } from 'solid-js'
import * as TooltipPrimitive from '@kobalte/core/tooltip'
import { cn } from '../../lib/utils'

const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger
const TooltipPortal = TooltipPrimitive.Portal

const TooltipContent: Component<TooltipPrimitive.TooltipContentProps & { class?: string; children?: any }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <TooltipPortal>
      <TooltipPrimitive.Content
        class={cn(
          'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
          local.class,
        )}
        {...others}
      />
    </TooltipPortal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal }
