import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const GEMINI_SELECTORS = {
  textarea: 'div[contenteditable="true"][role="textbox"]',
  sendButton: 'button[aria-label="Send message"]',
  stopButton: 'button[aria-label="Stop response"]',
  consentButton: 'button:has-text("Accept all")',
  staySignedOutButton: 'button[aria-label="Stay signed out"]',
  uploadButton: 'button[aria-label="Upload and tools"]',
  uploadMenuItem: 'button:has-text("Upload files")',
}

export interface GeminiResult {
  content: string
  geminiConversationId?: string
}

export interface GeminiBrowser {
  sendTextPrompt(prompt: string, conversationId?: string): Promise<GeminiResult>
  sendImagePrompt(images: string[], prompt: string, conversationId?: string): Promise<GeminiResult>
  sendWebSearch(query: string): Promise<string>
  close(): Promise<void>
}

function getAuthStatesDir(): string {
  return join(homedir(), '.sahayak', 'gemini-auth-states')
}

function pickAccount(): string | undefined {
  const dir = getAuthStatesDir()
  if (!existsSync(dir)) return undefined
  const files = readdirSync(dir).filter(f => f.startsWith('gemini-account') && f.endsWith('.json'))
  if (files.length === 0) return undefined
  return join(dir, files[0])
}

export async function createGeminiBrowser(headless = true): Promise<GeminiBrowser> {
  const { chromium } = await import('playwright')

  let browser: any = null
  let context: any = null
  let page: any = null

  async function ensureBrowser() {
    if (page && !page.isClosed()) return
    const storageStatePath = pickAccount()
    console.log('[gemini] ensureBrowser account:', storageStatePath)
    browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    })
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ...(storageStatePath ? { storageState: storageStatePath } : {}),
    })
    page = await context.newPage()
  }

  async function navigateToGemini(conversationId?: string) {
    await ensureBrowser()
    const startUrl = conversationId
      ? `https://gemini.google.com/app/${conversationId}`
      : 'https://gemini.google.com/app'
    console.log('[gemini] navigateToGemini startUrl:', startUrl)
    await page.goto(startUrl, { waitUntil: 'load', timeout: 30000 })

    let currentUrl = page.url()
    console.log('[gemini] navigateToGemini currentUrl:', currentUrl)
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500))
    if (currentUrl.includes('sorry') || bodyText.includes('unusual traffic') || bodyText.includes('not a robot')) {
      throw new Error('CAPTCHA_BLOCKED')
    }

    if (conversationId && !currentUrl.includes(conversationId)) {
      console.log('[gemini] conversation URL redirected, falling back to base app')
      await page.goto('https://gemini.google.com/app', { waitUntil: 'load', timeout: 30000 })
    }

    const textarea = page.locator(GEMINI_SELECTORS.textarea)
    await textarea.waitFor({ state: 'visible', timeout: 30000 })

    if (conversationId) {
      await page.waitForTimeout(3000)
    }

    const consentButton = page.locator(GEMINI_SELECTORS.consentButton)
    if (await consentButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await consentButton.click()
      await page.waitForTimeout(2000)
    }
  }

  async function sendPrompt(text: string): Promise<GeminiResult> {
    const textarea = page.locator(GEMINI_SELECTORS.textarea)
    await textarea.fill(text)
    await page.waitForTimeout(1000)

    const sendButton = page.locator(GEMINI_SELECTORS.sendButton)
    if (await sendButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sendButton.click()
    } else {
      await page.keyboard.press('Enter')
    }

    const stopButton = page.locator(GEMINI_SELECTORS.stopButton)
    await stopButton.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
    await stopButton.waitFor({ state: 'detached', timeout: 120000 }).catch(() => {})
    await page.waitForTimeout(2000)

    const afterUrl = page.url()
    const geminiMatch = afterUrl.match(/\/app\/([a-zA-Z0-9_-]+)/)
    const geminiConversationId = geminiMatch ? geminiMatch[1] : undefined
    console.log('[gemini] sendPrompt afterUrl:', afterUrl, 'geminiConversationId:', geminiConversationId)

    const text_response = await page.evaluate(() => {
      const fullText = document.body.innerText
      const parts = fullText.split('Gemini said')
      if (parts.length > 1) {
        let resp = parts[parts.length - 1].trim()
        const uiMarkers = ['\nTools', '\nFlash', '\nGemini is AI']
        for (const marker of uiMarkers) {
          const idx = resp.indexOf(marker)
          if (idx !== -1) resp = resp.slice(0, idx).trim()
        }
        return resp
      }
      return fullText.slice(0, 500).trim()
    })

    return { content: text_response || 'No response generated.', geminiConversationId }
  }

  async function attemptSendText(prompt: string, conversationId?: string, retryWithoutAuth = true): Promise<GeminiResult> {
    try {
      await navigateToGemini(conversationId)
      return await sendPrompt(prompt)
    } catch (err: any) {
      if (err.message === 'CAPTCHA_BLOCKED' && retryWithoutAuth) {
        if (browser) { try { await browser.close() } catch {} }
        browser = null; context = null; page = null
        return await attemptSendText(prompt, conversationId, false)
      }
      throw err
    }
  }

  return {
    async sendTextPrompt(prompt: string, conversationId?: string): Promise<GeminiResult> {
      const result = await attemptSendText(prompt, conversationId)
      return result
    },

    async sendImagePrompt(images: string[], prompt: string, conversationId?: string): Promise<GeminiResult> {
      console.log('[gemini] sendImagePrompt conversationId:', conversationId)
      await navigateToGemini(conversationId)

      const staySignedOut = page.locator(GEMINI_SELECTORS.staySignedOutButton)
      if (await staySignedOut.isVisible({ timeout: 2000 }).catch(() => false)) {
        await staySignedOut.click()
        await page.waitForTimeout(2000)
      }

      await page.evaluate(() => {
        document.querySelectorAll('.cdk-overlay-backdrop').forEach(el => el.remove())
      })
      await page.waitForTimeout(500)

      const uploadButton = page.locator(GEMINI_SELECTORS.uploadButton)
      if (await uploadButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await uploadButton.click({ force: true })
        await page.waitForTimeout(2000)
      }

      const uploadMenuItem = page.locator(GEMINI_SELECTORS.uploadMenuItem)
      if (await uploadMenuItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await uploadMenuItem.click({ force: true })
        await page.waitForTimeout(2000)
      }

      const fileInput = page.locator('input[type="file"]').first()
      const filePayloads = images.map((base64, i) => ({
        name: `image-${i + 1}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(base64, 'base64'),
      }))
      await fileInput.setInputFiles(filePayloads)
      await page.waitForTimeout(3000)

      const result = await sendPrompt(prompt)
      return result
    },

    async sendWebSearch(query: string): Promise<string> {
      await navigateToGemini()
      const result = await sendPrompt(`Search the web and tell me: ${query}`)
      return result.content
    },

    async close() {
      if (page && !page.isClosed()) try { await page.close() } catch {}
      if (context) try { await context.close() } catch {}
      if (browser) try { await browser.close() } catch {}
    },
  }
}
