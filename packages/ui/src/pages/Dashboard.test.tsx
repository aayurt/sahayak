import { describe, it, expect } from 'vitest'

describe('DashboardPage', () => {
  it('should export DashboardPage component', async () => {
    const mod = await import('./Dashboard')
    expect(mod.DashboardPage).toBeDefined()
    expect(typeof mod.DashboardPage).toBe('function')
  })
})
