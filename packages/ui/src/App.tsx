import { Route } from '@solidjs/router'
import { createEffect } from 'solid-js'
import { SidebarProvider } from './components/ui/sidebar'
import { Sidebar } from './components/layout/Sidebar'
import { HUD } from './components/layout/HUD'
import { ChatPage } from './pages/Chat'
import { DashboardPage } from './pages/Dashboard'
import { AgentPage } from './pages/Agent'
import { KnowledgePage } from './pages/Knowledge'
import { ResourcesPage } from './pages/Resources'
import { SettingsPage } from './pages/Settings'
import { TerminalPage } from './pages/Terminal'
import { JarvisOverlay } from './components/jarvis/JarvisOverlay'
import { useSettings, initTheme, applyTheme } from './stores/settings'
import type { JSX } from 'solid-js'

function RootLayout(props: { children?: JSX.Element }) {
  const { settings } = useSettings()

  initTheme()
  createEffect(() => {
    applyTheme(settings.theme)
  })

  return (
    <SidebarProvider>
      <div class="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div class="flex-1 flex flex-col min-w-0">
          <HUD />
          <main class="flex-1 flex flex-col overflow-hidden pt-9">
            {props.children}
          </main>
        </div>
        {settings.jarvisEnabled && <JarvisOverlay />}
      </div>
    </SidebarProvider>
  )
}

export function App() {
  return (
    <Route path="/" component={RootLayout}>
      <Route path="/" component={ChatPage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/chat/:sessionId" component={ChatPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/agent" component={AgentPage} />
      <Route path="/knowledge" component={KnowledgePage} />
      <Route path="/resources" component={ResourcesPage} />
      <Route path="/terminal" component={TerminalPage} />
      <Route path="/settings" component={SettingsPage} />
    </Route>
  )
}
