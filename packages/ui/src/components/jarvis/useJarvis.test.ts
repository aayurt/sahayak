import { describe, it, expect, beforeEach } from 'vitest'
import { useJarvis } from './useJarvis'

describe('useJarvis store', () => {
  const { jarvis, setJarvis } = useJarvis()

  beforeEach(() => {
    setJarvis('status', 'idle')
    setJarvis('transcript', [])
    setJarvis('micActive', false)
    setJarvis('isConnected', false)
  })

  it('has default idle state', () => {
    const s = useJarvis()
    expect(s.jarvis.status).toBe('idle')
    expect(s.jarvis.mode).toBe('click')
    expect(s.jarvis.isConnected).toBe(false)
    expect(s.jarvis.transcript).toEqual([])
    expect(s.jarvis.micActive).toBe(false)
  })

  it('sets status to listening', () => {
    setJarvis('status', 'listening')
    expect(jarvis.status).toBe('listening')
  })

  it('sets status to thinking', () => {
    setJarvis('status', 'thinking')
    expect(jarvis.status).toBe('thinking')
  })

  it('sets status to speaking', () => {
    setJarvis('status', 'speaking')
    expect(jarvis.status).toBe('speaking')
  })

  it('sets status to connecting', () => {
    setJarvis('status', 'connecting')
    expect(jarvis.status).toBe('connecting')
  })

  it('toggles micActive', () => {
    setJarvis('micActive', true)
    expect(jarvis.micActive).toBe(true)
    setJarvis('micActive', false)
    expect(jarvis.micActive).toBe(false)
  })

  it('toggles isConnected', () => {
    setJarvis('isConnected', true)
    expect(jarvis.isConnected).toBe(true)
    setJarvis('isConnected', false)
    expect(jarvis.isConnected).toBe(false)
  })

  it('appends user transcript entry', () => {
    setJarvis('transcript', (t) => [...t, { role: 'user', text: 'hello' }])
    expect(jarvis.transcript).toHaveLength(1)
    expect(jarvis.transcript[0].role).toBe('user')
    expect(jarvis.transcript[0].text).toBe('hello')
  })

  it('appends assistant transcript entry', () => {
    setJarvis('transcript', (t) => [...t, { role: 'assistant', text: 'hi there' }])
    expect(jarvis.transcript).toHaveLength(1)
    expect(jarvis.transcript[0].role).toBe('assistant')
    expect(jarvis.transcript[0].text).toBe('hi there')
  })

  it('preserves existing entries when appending', () => {
    setJarvis('transcript', (t) => [...t, { role: 'user', text: 'first' }])
    setJarvis('transcript', (t) => [...t, { role: 'assistant', text: 'second' }])
    expect(jarvis.transcript).toHaveLength(2)
    expect(jarvis.transcript[0].text).toBe('first')
    expect(jarvis.transcript[1].text).toBe('second')
  })

  it('clears transcript', () => {
    setJarvis('transcript', (t) => [...t, { role: 'user', text: 'hello' }])
    setJarvis('transcript', [])
    expect(jarvis.transcript).toEqual([])
  })
})
