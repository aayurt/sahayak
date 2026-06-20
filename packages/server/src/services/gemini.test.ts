import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GeminiBrowser, GeminiResult } from './gemini'

function createMockBrowser(overrides?: Partial<GeminiBrowser>): GeminiBrowser {
  return {
    sendTextPrompt: vi.fn<[string, string?], Promise<GeminiResult>>().mockResolvedValue({
      content: 'Mock response',
      geminiConversationId: undefined,
    }),
    sendImagePrompt: vi.fn<[string[], string, string?], Promise<GeminiResult>>().mockResolvedValue({ content: 'Mock image analysis', geminiConversationId: undefined }),
    sendWebSearch: vi.fn<[string], Promise<string>>().mockResolvedValue('Mock search results'),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('GeminiBrowser mock interface', () => {
  let browser: GeminiBrowser

  beforeEach(() => {
    browser = createMockBrowser()
  })

  it('sendTextPrompt returns content and conversationId', async () => {
    const result = await browser.sendTextPrompt('Analyze SCB stock')
    expect(result).toHaveProperty('content')
    expect(result).toHaveProperty('geminiConversationId')
    expect(result.content).toBe('Mock response')
  })

  it('sendTextPrompt accepts optional conversationId', async () => {
    const result = await browser.sendTextPrompt('Follow up question', 'abc123')
    expect(result.content).toBeDefined()
  })

  it('sendImagePrompt returns analysis text', async () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAjR9awAAAABJRU5ErkJggg=='
    const result = await browser.sendImagePrompt([base64], 'Analyze this chart')
    expect(result).toHaveProperty('content', 'Mock image analysis')
    expect(result).toHaveProperty('geminiConversationId')
  })

  it('sendWebSearch returns search results', async () => {
    const result = await browser.sendWebSearch('NEPSE index today')
    expect(result).toBe('Mock search results')
  })

  it('close does not throw', async () => {
    await expect(browser.close()).resolves.toBeUndefined()
  })

  it('supports custom override', async () => {
    const custom = createMockBrowser({
      sendTextPrompt: vi.fn().mockResolvedValue({ content: 'Custom response', geminiConversationId: 'xyz' }),
    })
    const result = await custom.sendTextPrompt('test')
    expect(result.content).toBe('Custom response')
    expect(result.geminiConversationId).toBe('xyz')
  })

  it('handles errors from sendTextPrompt', async () => {
    const errorBrowser = createMockBrowser({
      sendTextPrompt: vi.fn().mockRejectedValue(new Error('CAPTCHA_BLOCKED')),
    })
    await expect(errorBrowser.sendTextPrompt('test')).rejects.toThrow('CAPTCHA_BLOCKED')
  })
})

describe('GeminiBrowser interface contract', () => {
  it('result type has correct shape', () => {
    const result: GeminiResult = { content: 'test', geminiConversationId: 'abc' }
    expect(typeof result.content).toBe('string')
    expect(result.geminiConversationId).toBeTypeOf('string')
  })

  it('result type allows undefined conversationId', () => {
    const result: GeminiResult = { content: 'test' }
    expect(result.geminiConversationId).toBeUndefined()
  })

  it('browser interface methods return promises', () => {
    const browser = createMockBrowser()
    expect(browser.sendTextPrompt('x')).toBeInstanceOf(Promise)
    expect(browser.sendImagePrompt('x', 'y')).toBeInstanceOf(Promise)
    expect(browser.sendWebSearch('x')).toBeInstanceOf(Promise)
    expect(browser.close()).toBeInstanceOf(Promise)
  })
})
