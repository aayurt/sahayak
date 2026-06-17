import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockResource: any = {
  id: 'res-1',
  name: 'Test Server',
  type: 'ssh',
  host: '192.168.1.1',
  port: 22,
  username: 'admin',
  authType: null,
  authData: null,
  permissions: 'read-only',
  gitEnabled: true,
  graphifyState: 'none',
  created_at: new Date(),
  updated_at: new Date(),
}

vi.mock('@sahayak/shared/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => mockResource,
        }),
      }),
    }),
  }),
  schema: { resources: {} },
}))

let shellDataHandler: ((data: string) => void) | undefined
let shellCloseHandler: (() => void) | undefined

const mockShell = {
  onData: vi.fn((cb: any) => { shellDataHandler = cb }),
  write: vi.fn(),
  resize: vi.fn(),
  onClose: vi.fn((cb: any) => { shellCloseHandler = cb }),
  close: vi.fn(),
}

const mockConn = {
  host: '192.168.1.1',
  port: 22,
  exec: vi.fn(),
  shell: vi.fn().mockResolvedValue(mockShell),
  disconnect: vi.fn(),
}

vi.mock('./services/ssh', () => ({
  connect: vi.fn().mockResolvedValue(mockConn),
}))

import { handleSSHTerminalConnection } from './ssh-terminal'

describe('handleSSHTerminalConnection', () => {
  let ws: any

  beforeEach(() => {
    vi.clearAllMocks()
    shellDataHandler = undefined
    shellCloseHandler = undefined
    mockResource = {
      id: 'res-1',
      name: 'Test Server',
      type: 'ssh',
      host: '192.168.1.1',
      port: 22,
      username: 'admin',
      authType: null,
      authData: null,
    }
    ws = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    }
  })

  it('should reject missing resource ID', async () => {
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/')
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('Missing resource ID'))
    expect(ws.close).toHaveBeenCalled()
  })

  it('should connect SSH and register shell data handler', async () => {
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    const { connect } = await import('./services/ssh')
    expect(connect).toHaveBeenCalledWith({
      host: '192.168.1.1',
      port: 22,
      username: 'admin',
      authType: 'key', // null || 'key'
      authData: undefined,
    })
    expect(mockConn.shell).toHaveBeenCalledWith({ cols: 80, rows: 24 })
    expect(mockShell.onData).toHaveBeenCalledOnce()
  })

  it('should forward shell output to WebSocket', async () => {
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    expect(shellDataHandler).toBeDefined()
    shellDataHandler!('hello from remote')
    expect(ws.send).toHaveBeenCalledWith('hello from remote')
  })

  it('should not send when WebSocket is not open', async () => {
    ws.readyState = 2
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    shellDataHandler!('data')
    expect(ws.send).not.toHaveBeenCalled()
  })

  it('should forward keyboard input to SSH shell', async () => {
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    const msgHandler = ws.on.mock.calls.find((c: any) => c[0] === 'message')?.[1]
    expect(msgHandler).toBeDefined()
    msgHandler('ls -la')
    expect(mockShell.write).toHaveBeenCalledWith('ls -la')
  })

  it('should handle resize control messages', async () => {
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    const msgHandler = ws.on.mock.calls.find((c: any) => c[0] === 'message')?.[1]
    msgHandler(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }))
    expect(mockShell.resize).toHaveBeenCalledWith(120, 40)
  })

  it('should not send resize to shell.write', async () => {
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    const msgHandler = ws.on.mock.calls.find((c: any) => c[0] === 'message')?.[1]
    msgHandler(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }))
    expect(mockShell.write).not.toHaveBeenCalled()
  })

  it('should show connection closed on shell close', async () => {
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    expect(shellCloseHandler).toBeDefined()
    shellCloseHandler!()
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('Connection closed'))
    expect(ws.close).toHaveBeenCalled()
  })

  it('should disconnect SSH on WebSocket close', async () => {
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    const closeHandler = ws.on.mock.calls.find((c: any) => c[0] === 'close')?.[1]
    expect(closeHandler).toBeDefined()
    closeHandler()
    expect(mockShell.close).toHaveBeenCalledOnce()
    expect(mockConn.disconnect).toHaveBeenCalledOnce()
  })

  it('should not throw on double close', async () => {
    mockShell.close.mockImplementationOnce(() => { throw new Error('already dead') })
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    const closeHandler = ws.on.mock.calls.find((c: any) => c[0] === 'close')?.[1]
    expect(() => closeHandler()).not.toThrow()
  })

  it('should send error message on connection failure', async () => {
    const { connect } = await import('./services/ssh')
    ;(connect as any).mockRejectedValueOnce(new Error('Connection refused'))
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('Connection refused'))
    expect(ws.close).toHaveBeenCalled()
  })

  it('should reject non-SSH resources', async () => {
    mockResource = { ...mockResource, type: 'folder' }
    await handleSSHTerminalConnection(ws, '/ws/ssh-terminal/res-1')
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('SSH resource not found'))
    expect(ws.close).toHaveBeenCalled()
  })
})
