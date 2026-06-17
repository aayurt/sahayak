import { useNavigate, useLocation } from '@solidjs/router'
import {
  Sidebar as SidebarRoot,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail,
} from '../ui/sidebar'
import {
  MessageSquare,
  LayoutDashboard,
  Terminal,
  Bot,
  Network,
  FolderKanban,
  Settings as SettingsIcon,
} from 'lucide-solid'
interface NavItem {
  path: string
  icon: (props: { class?: string }) => any
  label: string
}

const NAV: NavItem[] = [
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/terminal', icon: Terminal, label: 'Terminal' },
  { path: '/agent', icon: Bot, label: 'Agent' },
  { path: '/knowledge', icon: Network, label: 'Knowledge' },
  { path: '/resources', icon: FolderKanban, label: 'Resources' },
  { path: '/settings', icon: SettingsIcon, label: 'Settings' },
]

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <SidebarRoot collapsible="icon">
      <SidebarHeader class="h-14 border-b border-sidebar-border px-3 justify-center">
        <span class="font-semibold text-sm tracking-tight group-data-[state=collapsed]/sidebar:hidden">Sahayak</span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel class="group-data-[state=collapsed]/sidebar:hidden">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const Icon = item.icon
                const active = () => location.pathname === item.path
                return (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={active()}
                      tooltip={item.label}
                      onClick={() => navigate(item.path)}
                    >
                      <Icon class="h-4 w-4 shrink-0" />
                      <span class="group-data-[state=collapsed]/sidebar:hidden">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter class="p-3 border-t border-sidebar-border">
        <p class="text-xs text-sidebar-foreground/50 group-data-[state=collapsed]/sidebar:hidden">Sahayak v0.1</p>
      </SidebarFooter>

      <SidebarRail />
    </SidebarRoot>
  )
}
