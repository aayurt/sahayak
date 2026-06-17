import { describe, it, expect } from 'vitest'
import { useSettings } from './settings'

describe('settings store', () => {
  it('has default values', () => {
    const { settings } = useSettings()
    expect(settings.aiEndpoint).toBe('http://localhost:8080')
    expect(settings.aiApiKey).toBe('')
    expect(settings.openCodePath).toBe('opencode')
    expect(settings.sidebarCollapsed).toBe(false)
    expect(settings.jarvisEnabled).toBe(true)
  })

  it('updates aiEndpoint', () => {
    const { settings, setSettings } = useSettings()
    setSettings('aiEndpoint', 'http://custom:8080')
    expect(settings.aiEndpoint).toBe('http://custom:8080')
  })

  it('toggles sidebar collapsed', () => {
    const { settings, setSettings } = useSettings()
    setSettings('sidebarCollapsed', true)
    expect(settings.sidebarCollapsed).toBe(true)
    setSettings('sidebarCollapsed', false)
    expect(settings.sidebarCollapsed).toBe(false)
  })

  it('disables jarvis', () => {
    const { settings, setSettings } = useSettings()
    setSettings('jarvisEnabled', false)
    expect(settings.jarvisEnabled).toBe(false)
  })

  it('preserves other fields when updating one', () => {
    const { settings, setSettings } = useSettings()
    setSettings('aiEndpoint', 'http://changed:8080')
    setSettings('jarvisEnabled', true)
    expect(settings.openCodePath).toBe('opencode')
    expect(settings.jarvisEnabled).toBe(true)
  })
})
