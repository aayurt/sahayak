import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { getDb, schema } from '@sahayak/shared/db'
import { eq } from 'drizzle-orm'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
]

const SERVER_BASE = process.env.SAHAYAK_BASE_URL || 'http://localhost:9090'
const REDIRECT_URI = `${SERVER_BASE}/api/google/auth/callback`

function getClientId(): string {
  const db = getDb()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'google_client_id')).get() as any
  return row?.value || ''
}

function getClientSecret(): string {
  const db = getDb()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'google_client_secret')).get() as any
  return row?.value || ''
}

function createOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(getClientId(), getClientSecret(), REDIRECT_URI)
}

function getStoredTokens(): Record<string, any> | null {
  const db = getDb()
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'google_tokens')).get() as any
  if (!row?.value) return null
  try { return JSON.parse(row.value) } catch { return null }
}

function storeTokens(tokens: Record<string, any>) {
  const db = getDb()
  db
    .insert(schema.settings)
    .values({ key: 'google_tokens', value: JSON.stringify(tokens), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: JSON.stringify(tokens), updatedAt: new Date() },
    })
}

export function getAuthUrl(): string {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  })
}

export async function handleCallback(code: string): Promise<{ email: string }> {
  const client = createOAuthClient()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data: userInfo } = await oauth2.userinfo.get()

  storeTokens({ ...tokens, email: userInfo.email || 'unknown' })

  return { email: userInfo.email || 'unknown' }
}

export async function getAuthClient(): Promise<OAuth2Client | null> {
  const tokens = getStoredTokens()
  if (!tokens) return null

  const client = createOAuthClient()
  client.setCredentials(tokens)

  client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens }
    storeTokens(merged)
  })

  return client
}

export async function getAuthStatus(): Promise<{ connected: boolean; email?: string }> {
  const tokens = getStoredTokens()
  if (!tokens) return { connected: false }
  return { connected: true, email: tokens.email }
}

export async function disconnect() {
  const db = getDb()
  await db.delete(schema.settings).where(eq(schema.settings.key, 'google_tokens')).run()
}

export function hasCredentials(): boolean {
  return !!(getClientId() && getClientSecret())
}
