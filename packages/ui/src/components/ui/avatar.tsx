import { type Component, type JSX, splitProps } from 'solid-js'
import { cn } from '../../lib/utils'

interface AvatarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
  fallback?: string
}

const Avatar: Component<AvatarProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'src', 'alt', 'fallback', 'children'])
  return (
    <div class={cn('relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full', local.class)} {...others}>
      {local.src
        ? <img src={local.src} alt={local.alt ?? ''} class="aspect-square h-full w-full" />
        : (
          <div class="flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {local.fallback ?? local.alt?.charAt(0).toUpperCase()}
          </div>
        )}
    </div>
  )
}

export { Avatar }
