import { describe, it, expect, vi, beforeEach } from 'vitest'

let dataHandler: ((data: string) => void) | undefined

const mockPty = {
  onData: vi.fn((cb: any) => { dataHandler = cb }),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  on: vi.fn(),
}

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPty),
}))

import { handleTerminalConnection } from './terminal'

describe('handleTerminalConnection', () => {
  let ws: any

  beforeEach(() => {
    vi.clearAllMocks()
    dataHandler = undefined
    ws = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
    }
  })

  it('should spawn PTY and register data handler', () => {
    handleTerminalConnection(ws, '/ws/terminal')
    expect(mockPty.onData).toHaveBeenCalledOnce()
  })

  it('should forward PTY output to WebSocket', () => {
    handleTerminalConnection(ws, '/ws/terminal')
    expect(dataHandler).toBeDefined()
    dataHandler!('hello')
    expect(ws.send).toHaveBeenCalledWith('hello')
  })

  it('should not send when WebSocket is not open', () => {
    ws.readyState = 2
    handleTerminalConnection(ws, '/ws/terminal')
    dataHandler!('data')
    expect(ws.send).not.toHaveBeenCalled()
  })

  it('should forward keyboard input to PTY', () => {
    handleTerminalConnection(ws, '/ws/terminal')
    const msgHandler = ws.on.mock.calls.find((c: any) => c[0] === 'message')?.[1]
    expect(msgHandler).toBeDefined()
    msgHandler('ls -la')
    expect(mockPty.write).toHaveBeenCalledWith('ls -la')
  })

  it('should handle resize control messages', () => {
    handleTerminalConnection(ws, '/ws/terminal')
    const msgHandler = ws.on.mock.calls.find((c: any) => c[0] === 'message')?.[1]
    msgHandler(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }))
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40)
  })

  it('should not send resize to PTY.write', () => {
    handleTerminalConnection(ws, '/ws/terminal')
    const msgHandler = ws.on.mock.calls.find((c: any) => c[0] === 'message')?.[1]
    msgHandler(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }))
    expect(mockPty.write).not.toHaveBeenCalled()
  })

  it('should kill PTY on WebSocket close', () => {
    handleTerminalConnection(ws, '/ws/terminal')
    const closeHandler = ws.on.mock.calls.find((c: any) => c[0] === 'close')?.[1]
    expect(closeHandler).toBeDefined()
    closeHandler()
    expect(mockPty.kill).toHaveBeenCalledOnce()
  })

  it('should not throw on double kill', () => {
    mockPty.kill.mockImplementationOnce(() => { throw new Error('already dead') })
    handleTerminalConnection(ws, '/ws/terminal')
    const closeHandler = ws.on.mock.calls.find((c: any) => c[0] === 'close')?.[1]
    expect(() => closeHandler()).not.toThrow()
  })
})
