import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  type Component,
  type JSX,
  type Accessor,
  splitProps,
  Show,
} from 'solid-js'
import { cn } from '../../lib/utils'
import { Button, buttonVariants } from './button'
import * as TooltipPrimitive from '@kobalte/core/tooltip'
import { PanelLeftOpen, PanelLeftClose } from 'lucide-solid'

const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_MOBILE = '18rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'
const SIDEBAR_STORAGE_KEY = 'sahayak:sidebar-open'

function loadSidebarState(): boolean {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (saved === 'true') return true
    if (saved === 'false') return false
  } catch {}
  return true
}

function saveSidebarState(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open))
  } catch {}
}

type SidebarState = 'expanded' | 'collapsed'

interface SidebarContextValue {
  state: Accessor<SidebarState>
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
  openMobile: Accessor<boolean>
  setOpenMobile: (open: boolean) => void
  isMobile: Accessor<boolean>
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue>()

function createMediaQuery(query: string) {
  const [matches, setMatches] = createSignal(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  createEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    onCleanup(() => mql.removeEventListener('change', handler))
  })
  return matches
}

function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

interface SidebarProviderProps {
  children: JSX.Element
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  style?: JSX.CSSProperties & {
    '--sidebar-width'?: string
    '--sidebar-width-mobile'?: string
  }
}

function SidebarProvider(props: SidebarProviderProps) {
  const [local, others] = splitProps(props, ['children', 'defaultOpen', 'open', 'onOpenChange', 'style'])
  const isMobile = createMediaQuery('(max-width: 767px)')
  const [uncontrolledOpen, setUncontrolledOpen] = createSignal(local.defaultOpen ?? loadSidebarState())
  const [openMobile, setOpenMobile] = createSignal(false)

  const open = () => (local.open !== undefined ? local.open : uncontrolledOpen())
  const setOpen = (value: boolean) => {
    if (local.open === undefined) {
      setUncontrolledOpen(value)
    }
    local.onOpenChange?.(value)
  }

  const state = createMemo(() => (open() ? 'expanded' : 'collapsed'))

  const toggleSidebar = () => {
    if (isMobile()) {
      setOpenMobile(!openMobile())
    } else {
      setOpen(!open())
    }
  }

  createEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT) {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handler)
    onCleanup(() => window.removeEventListener('keydown', handler))
  })

  createEffect(() => {
    if (local.open === undefined) {
      saveSidebarState(uncontrolledOpen())
    }
  })

  return (
    <SidebarContext.Provider
      value={{ state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }}
    >
      <div
        style={{
          '--sidebar-width': SIDEBAR_WIDTH,
          '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE,
          '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
          ...(local.style as Record<string, string | number>),
        }}
        class="group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar"
        {...(others as any)}
      >
        {local.children}
      </div>
    </SidebarContext.Provider>
  )
}

interface SidebarProps extends JSX.HTMLAttributes<HTMLDivElement> {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}

function Sidebar(props: SidebarProps) {
  const [local, others] = splitProps(props, [
    'side', 'variant', 'collapsible', 'class', 'children', 'style',
  ])
  const sidebar = useSidebar()

  const side = () => local.side ?? 'left'
  const variant = () => local.variant ?? 'sidebar'
  const collapsible = () => local.collapsible ?? 'icon'

  const isMobile = sidebar.isMobile

  return (
    <>
      <div
        data-slot="sidebar-container"
        data-side={side()}
        data-variant={variant()}
        data-collapsible={collapsible()}
        class={cn(
          'peer hidden md:flex text-sidebar-foreground',
          collapsible() === 'offcanvas' && 'w-0',
          collapsible() === 'icon' && (sidebar.state() === 'collapsed' ? 'w-(--sidebar-width-icon)' : 'w-(--sidebar-width)'),
          collapsible() === 'none' && 'w-(--sidebar-width)',
          variant() === 'floating' && 'p-2',
        )}
      >
        <aside
          data-slot="sidebar"
          data-side={side()}
          data-variant={variant()}
          data-collapsible={collapsible()}
          data-state={sidebar.state()}
          class={cn(
            'group/sidebar flex h-svh flex-col bg-sidebar/60 backdrop-blur-sm border-r border-sidebar-border transition-all duration-200 ease-linear',
            side() === 'left' && 'left-0',
            side() === 'right' && 'right-0 border-l border-r-0',
            variant() === 'floating' && 'rounded-xl border shadow-lg',
            variant() === 'inset' && 'rounded-xl border shadow-sm bg-background',
            collapsible() === 'icon' && (sidebar.state() === 'collapsed' ? 'w-(--sidebar-width-icon)' : 'w-(--sidebar-width)'),
            collapsible() === 'offcanvas' && 'w-(--sidebar-width)',
            collapsible() === 'none' && 'w-(--sidebar-width)',
            local.class,
          )}
          style={{
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            ...(local.style as Record<string, string | number>),
          }}
          {...(others as any)}
        >
          {local.children}
        </aside>
      </div>

      <Show when={isMobile() && sidebar.openMobile()}>
        <div class="fixed inset-0 z-50 md:hidden">
          <div
            class="fixed inset-0 bg-black/60"
            onClick={() => sidebar.setOpenMobile(false)}
          />
          <aside
            data-slot="sidebar"
            data-mobile="true"
            class="fixed inset-y-0 left-0 z-50 flex h-full w-(--sidebar-width-mobile) flex-col bg-sidebar border-r border-sidebar-border shadow-xl animate-in slide-in-from-left duration-300"
          >
            {local.children}
          </aside>
        </div>
      </Show>
    </>
  )
}

const SidebarHeader: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-header"
      class={cn('flex flex-col shrink-0', local.class)}
      {...(others as JSX.HTMLAttributes<HTMLDivElement>)}
    />
  )
}

const SidebarFooter: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-footer"
      class={cn('flex flex-col shrink-0', local.class)}
      {...(others as JSX.HTMLAttributes<HTMLDivElement>)}
    />
  )
}

const SidebarContent: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-content"
      class={cn('flex min-h-0 flex-1 flex-col overflow-auto', local.class)}
      {...(others as any)}
    />
  )
}

interface SidebarGroupProps extends JSX.HTMLAttributes<HTMLDivElement> {}

const SidebarGroup: Component<SidebarGroupProps> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-group"
      class={cn('relative flex w-full min-w-0 flex-col p-2', local.class)}
      {...(others as any)}
    />
  )
}

interface SidebarGroupLabelProps extends JSX.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean
}

const SidebarGroupLabel: Component<SidebarGroupLabelProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'asChild'])
  return (
    <div
      data-slot="sidebar-group-label"
      class={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/50 outline-none ring-sidebar-ring transition-[margin,opa] duration-200 ease-linear group-data-[state=collapsed]/sidebar:hidden',
        local.class,
      )}
      {...(others as any)}
    />
  )
}

const SidebarGroupContent: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div
      data-slot="sidebar-group-content"
      class={cn('w-full text-sm', local.class)}
      {...(others as any)}
    />
  )
}

interface SidebarMenuProps extends JSX.HTMLAttributes<HTMLDivElement> {}

const SidebarMenu: Component<SidebarMenuProps> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <ul
      data-slot="sidebar-menu"
      class={cn('flex w-full min-w-0 flex-col gap-1', local.class)}
      {...(others as JSX.HTMLAttributes<HTMLUListElement>)}
    />
  )
}

const SidebarMenuItem: Component<JSX.HTMLAttributes<HTMLLIElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <li
      data-slot="sidebar-menu-item"
      class={cn('group/menu-item relative', local.class)}
      {...(others as any)}
    />
  )
}

interface SidebarMenuButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | { children: JSX.Element; hidden?: boolean }
}

const SidebarMenuButton: Component<SidebarMenuButtonProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'asChild', 'isActive', 'tooltip', 'children'])
  const sidebar = useSidebar()
  const collapsed = () => sidebar.state() === 'collapsed'

  const button = (
    <button
      data-slot="sidebar-menu-button"
      data-active={local.isActive}
      class={cn(
        buttonVariants({ variant: 'ghost' }),
        'h-8 w-full justify-start gap-3 rounded-md px-3 text-sm font-normal',
        'group-data-[state=collapsed]/sidebar:!p-0 group-data-[state=collapsed]/sidebar:!justify-center group-data-[state=collapsed]/sidebar:h-9 group-data-[state=collapsed]/sidebar:w-9 group-data-[state=collapsed]/sidebar:shrink-0',
        'aria-[active=true]:bg-sidebar-accent aria-[active=true]:text-sidebar-accent-foreground',
        local.class,
      )}
      {...(others as any)}
    >
      {local.children}
    </button>
  )

  if (collapsed() && local.tooltip) {
    const tip = typeof local.tooltip === 'string' ? local.tooltip : local.tooltip.children
    return (
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger>
          <span tabIndex={-1} class="inline-flex">
            {button}
          </span>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            {...({ side: 'right', class: 'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground' } as any)}
          >
            {tip}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    )
  }

  return button
}

interface SidebarRailProps extends JSX.HTMLAttributes<HTMLButtonElement> {}

const SidebarRail: Component<SidebarRailProps> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  const sidebar = useSidebar()

  return (
    <button
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      onClick={() => sidebar.toggleSidebar()}
      class={cn(
        'absolute inset-y-0 right-0 z-20 hidden w-4 translate-x-full transition-all ease-linear sm:flex',
        'items-center justify-center',
        local.class,
      )}
      {...(others as any)}
    >
      <div class="flex h-8 w-4 items-center justify-center rounded-r-md border border-l-0 border-sidebar-border bg-sidebar text-sidebar-foreground/50 shadow-sm transition-opacity hover:opacity-100">
        <Show when={sidebar.state() === 'collapsed'} fallback={<PanelLeftClose class="h-3 w-3" />}>
          <PanelLeftOpen class="h-3 w-3" />
        </Show>
      </div>
    </button>
  )
}

interface SidebarTriggerProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

const SidebarTrigger: Component<SidebarTriggerProps> = (props) => {
  const [local, others] = splitProps(props, ['class', 'children'])
  const sidebar = useSidebar()

  return (
    <Button
      variant="ghost"
      size="icon"
      data-slot="sidebar-trigger"
      onClick={() => sidebar.toggleSidebar()}
      class={local.class}
      title={sidebar.state() === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
      {...(others as any)}
    >
      <Show when={sidebar.state() === 'collapsed'} fallback={<PanelLeftClose class="h-4 w-4" />}>
        <PanelLeftOpen class="h-4 w-4" />
      </Show>
      {local.children}
    </Button>
  )
}

const SidebarInset: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <main
      data-slot="sidebar-inset"
      class={cn(
        'relative flex min-h-svh flex-1 flex-col bg-background',
        'peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[side=left]:ml-2',
        local.class,
      )}
      {...(others as JSX.HTMLAttributes<HTMLElement>)}
    />
  )
}

export {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarFooter,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
}
