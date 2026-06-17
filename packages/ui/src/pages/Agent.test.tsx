import { describe, it, expect } from 'vitest'

describe('AgentPage', () => {
  it('should export AgentPage component', async () => {
    const mod = await import('./Agent')
    expect(mod.AgentPage).toBeDefined()
    expect(typeof mod.AgentPage).toBe('function')
  })
})
