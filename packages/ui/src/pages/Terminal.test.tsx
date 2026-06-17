import { describe, it, expect } from 'vitest'

describe('TerminalPage', () => {
  it('should export TerminalPage component', async () => {
    const mod = await import('./Terminal')
    expect(mod.TerminalPage).toBeDefined()
    expect(typeof mod.TerminalPage).toBe('function')
  })
})
