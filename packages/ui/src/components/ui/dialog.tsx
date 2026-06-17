import { type Component, type JSX, splitProps } from 'solid-js'
import * as DialogPrimitive from '@kobalte/core/dialog'
import { cn } from '../../lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogCloseButton = DialogPrimitive.CloseButton

const DialogOverlay: Component<DialogPrimitive.DialogOverlayProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <DialogPrimitive.Overlay
      class={cn(
        'fixed inset-0 z-50 bg-black/80 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0',
        local.class,
      )}
      {...others}
    />
  )
}

const DialogContent: Component<DialogPrimitive.DialogContentProps & { class?: string; children?: any; style?: any }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        class={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%] sm:rounded-lg',
          local.class,
        )}
        {...others}
      />
    </DialogPortal>
  )
}

const DialogHeader: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div class={cn('flex flex-col space-y-1.5 text-center sm:text-left', local.class)} {...others} />
  )
}

const DialogFooter: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div class={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', local.class)} {...others} />
  )
}

const DialogTitle: Component<DialogPrimitive.DialogTitleProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <DialogPrimitive.Title
      class={cn('text-lg font-semibold leading-none tracking-tight', local.class)}
      {...others}
    />
  )
}

const DialogDescription: Component<DialogPrimitive.DialogDescriptionProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <DialogPrimitive.Description
      class={cn('text-sm text-muted-foreground', local.class)}
      {...others}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
  DialogPortal,
  DialogOverlay,
}
