import { describe, it, expect } from 'vitest'

describe('SshTerminal', () => {
  it('should export SshTerminal component', async () => {
    const mod = await import('./SshTerminal')
    expect(mod.SshTerminal).toBeDefined()
    expect(typeof mod.SshTerminal).toBe('function')
  })
})
