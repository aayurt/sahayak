import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { X } from 'lucide-solid'

interface BasicModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: JSX.Element
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const modalSizes: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
}

export default function BasicModal(props: BasicModalProps) {
  let modalRef: HTMLDivElement | undefined
  let overlayRef: HTMLDivElement | undefined
  const [visible, setVisible] = createSignal(false)
  const [animating, setAnimating] = createSignal(false)

  createEffect(() => {
    if (props.isOpen) {
      setVisible(true)
      requestAnimationFrame(() => setAnimating(true))
    } else if (visible()) {
      setAnimating(false)
      setTimeout(() => setVisible(false), 150)
    }
  })

  createEffect(() => {
    if (!props.isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown))
  })

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === overlayRef) props.onClose()
  }

  return (
    <Show when={visible()}>
      <div
        ref={overlayRef!}
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
        classList={{ 'opacity-100': animating(), 'opacity-0': !animating() }}
        onClick={handleOverlayClick}
      />

      <div class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-6 sm:p-0 transition-opacity duration-200"
        classList={{ 'opacity-100': animating(), 'opacity-0': !animating() }}
      >
        <div
          ref={modalRef!}
          class={`${modalSizes[props.size || 'md']} relative mx-auto w-full rounded-xl border shadow-2xl p-4 sm:p-6 bg-background transition-all duration-200`}
          classList={{
            'scale-100 translate-y-0 opacity-100': animating(),
            'scale-95 translate-y-2 opacity-0': !animating(),
          }}
          style="border-color:var(--border);color:var(--text-primary)"
        >
          <div class="mb-4 flex items-center justify-between">
            <Show when={props.title}>
              <h3 class="text-lg font-medium">{props.title}</h3>
            </Show>
            <button
              class="ml-auto rounded-full p-1.5 transition-colors hover:opacity-70"
              style="color:var(--text-muted)"
              onClick={props.onClose}
            >
              <X class="h-5 w-5" />
            </button>
          </div>

          <div style="color:var(--text-primary)">
            {props.children}
          </div>
        </div>
      </div>
    </Show>
  )
}
