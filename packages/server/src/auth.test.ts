import { describe, it, expect, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware, setServerPassword } from './auth'

function mockReqRes(path: string, cookie?: string, header?: string) {
  const req = { path, cookies: { sahayak_token: cookie }, headers: { 'x-sahayak-token': header } } as unknown as Request
  const nextCalled = { value: false }
  const next: NextFunction = () => { nextCalled.value = true }
  const res = {
    statusCode: 200,
    body: null,
    status(code: number) { this.statusCode = code; return this },
    json(data: unknown) { this.body = data; return this },
    redirect() {},
    send() {},
  } as unknown as Response & { statusCode: number; body: unknown }
  return { req, res, next, nextCalled }
}

describe('authMiddleware', () => {
  beforeEach(() => {
    setServerPassword(null)
  })

  it('allows through when no password set', () => {
    const { req, next, nextCalled } = mockReqRes('/api/chat')
    authMiddleware(req, {} as Response, next)
    expect(nextCalled.value).toBe(true)
  })

  it('blocks API call with wrong cookie', () => {
    setServerPassword('secret')
    const { req, res, next, nextCalled } = mockReqRes('/api/chat', 'wrong')
    authMiddleware(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(nextCalled.value).toBe(false)
  })

  it('allows API call with correct cookie', () => {
    setServerPassword('secret')
    const { req, res, next, nextCalled } = mockReqRes('/api/chat', 'secret')
    authMiddleware(req, res, next)
    expect(nextCalled.value).toBe(true)
  })

  it('allows API call with correct header token', () => {
    setServerPassword('secret')
    const { req, res, next, nextCalled } = mockReqRes('/api/chat', undefined, 'secret')
    authMiddleware(req, res, next)
    expect(nextCalled.value).toBe(true)
  })

  it('allows login page without auth', () => {
    setServerPassword('secret')
    const { req, res, next, nextCalled } = mockReqRes('/login')
    authMiddleware(req, res, next)
    expect(nextCalled.value).toBe(true)
  })
})
