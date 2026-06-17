import { type Component, type JSX, splitProps } from 'solid-js'
import * as DialogPrimitive from '@kobalte/core/dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetCloseButton = DialogPrimitive.CloseButton
const SheetPortal = DialogPrimitive.Portal

const SheetOverlay: Component<DialogPrimitive.DialogOverlayProps & { class?: string }> = (props) => {
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

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[expanded]:animate-in data-[closed]:animate-out',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[closed]:slide-out-to-top data-[expanded]:slide-in-from-top',
        bottom: 'inset-x-0 bottom-0 border-t data-[closed]:slide-out-to-bottom data-[expanded]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[closed]:slide-out-to-left data-[expanded]:slide-in-from-left sm:max-w-sm',
        right: 'inset-y-0 right-0 h-full w-3/4 border-l data-[closed]:slide-out-to-right data-[expanded]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
)

interface SheetContentProps extends DialogPrimitive.DialogContentProps, VariantProps<typeof sheetVariants> { class?: string }

const SheetContent: Component<SheetContentProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'side'])
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        class={cn(sheetVariants({ side: local.side }), local.class)}
        {...others}
      />
    </SheetPortal>
  )
}

const SheetHeader: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div class={cn('flex flex-col space-y-2 text-center sm:text-left', local.class)} {...others} />
  )
}

const SheetFooter: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div class={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', local.class)} {...others} />
  )
}

const SheetTitle: Component<DialogPrimitive.DialogTitleProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <DialogPrimitive.Title
      class={cn('text-lg font-semibold text-foreground', local.class)}
      {...others}
    />
  )
}

const SheetDescription: Component<DialogPrimitive.DialogDescriptionProps & { class?: string }> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <DialogPrimitive.Description
      class={cn('text-sm text-muted-foreground', local.class)}
      {...others}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetCloseButton,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetPortal,
  SheetOverlay,
}
