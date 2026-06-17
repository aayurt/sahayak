import { type Component, splitProps } from 'solid-js'
import * as SelectPrimitive from '@kobalte/core/select'
import { cn } from '../../lib/utils'

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value
const SelectHiddenSelect = SelectPrimitive.HiddenSelect
const SelectDescription = SelectPrimitive.Description
const SelectErrorMessage = SelectPrimitive.ErrorMessage

const SelectTrigger: Component<SelectPrimitive.SelectTriggerProps & { class?: string; children?: any }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.Trigger
      class={cn(
        'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        local.class,
      )}
      {...others}
    />
  )
}

const SelectIcon: Component<SelectPrimitive.SelectIconProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.Icon
      class={cn('flex h-3.5 w-3.5 items-center justify-center opacity-50', local.class)}
      {...others}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="m6 9 6 6 6-6"/></svg>
    </SelectPrimitive.Icon>
  )
}

const SelectPortal: Component<SelectPrimitive.SelectPortalProps> = (props) => {
  return (
    <SelectPrimitive.Portal {...props} />
  )
}

const SelectContent: Component<SelectPrimitive.SelectContentProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <SelectPortal>
      <SelectPrimitive.Content
        class={cn(
          'relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95',
          local.class,
        )}
        {...others}
      />
    </SelectPortal>
  )
}

const SelectListbox: Component<SelectPrimitive.SelectListboxProps<any, any, any> & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.Listbox<any, any, any>
      class={cn('p-1', local.class)}
      {...others}
    />
  )
}

const SelectItem: Component<SelectPrimitive.SelectItemProps<any> & { class?: string; children?: any }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.Item
      class={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        local.class,
      )}
      {...others}
    />
  )
}

const SelectItemLabel: Component<SelectPrimitive.SelectItemLabelProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.ItemLabel
      class={cn('flex-1', local.class)}
      {...others}
    />
  )
}

const SelectItemIndicator: Component<SelectPrimitive.SelectItemIndicatorProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <SelectPrimitive.ItemIndicator
      class={cn('absolute right-2 flex h-3.5 w-3.5 items-center justify-center', local.class)}
      {...others}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M20 6 9 17l-5-5"/></svg>
    </SelectPrimitive.ItemIndicator>
  )
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectContent,
  SelectListbox,
  SelectItem,
  SelectItemLabel,
  SelectItemIndicator,
  SelectHiddenSelect,
  SelectDescription,
  SelectErrorMessage,
  SelectPortal,
}
