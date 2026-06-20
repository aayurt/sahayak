import { google, sheets_v4 } from 'googleapis'
import { getAuthClient } from './auth'

interface SheetSummary {
  id: string
  name: string
  updatedAt: string
  owner?: string
}

interface SpreadsheetMeta {
  title: string
  sheets: Array<{ name: string; rowCount: number; colCount: number }>
}

interface SheetData {
  meta: SpreadsheetMeta
  values: string[][]
}

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = await getAuthClient()
  if (!auth) throw new Error('Not authenticated with Google')
  return google.sheets({ version: 'v4', auth })
}

async function getDriveClient() {
  const auth = await getAuthClient()
  if (!auth) throw new Error('Not authenticated with Google')
  return google.drive({ version: 'v3', auth })
}

export async function listSpreadsheets(): Promise<SheetSummary[]> {
  const drive = await getDriveClient()
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name, owners, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
  })
  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    updatedAt: f.modifiedTime || '',
    owner: f.owners?.[0]?.displayName,
  }))
}

export async function getSpreadsheetMeta(id: string): Promise<SpreadsheetMeta> {
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.get({
    spreadsheetId: id,
    fields: 'properties.title,sheets.properties',
  })
  return {
    title: res.data.properties?.title || '',
    sheets: (res.data.sheets || []).map((s) => ({
      name: s.properties?.title || '',
      rowCount: s.properties?.gridProperties?.rowCount || 0,
      colCount: s.properties?.gridProperties?.columnCount || 0,
    })),
  }
}

export async function readRange(id: string, range?: string): Promise<SheetData> {
  const meta = await getSpreadsheetMeta(id)
  const targetRange = range || `${meta.sheets[0]?.name || 'Sheet1'}!A:Z`
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: targetRange,
    valueRenderOption: 'FORMATTED_VALUE',
  })
  return { meta, values: res.data.values as string[][] || [] }
}

export async function readSheet(id: string): Promise<SheetData> {
  return readRange(id)
}

export async function getSheetSummary(id: string): Promise<{
  title: string
  sheets: Array<{ name: string; rowCount: number; colCount: number; headers: string[] }>
}> {
  const meta = await getSpreadsheetMeta(id)
  const sheets = await getSheetsClient()
  const result: any = { title: meta.title, sheets: [] }

  for (const sheet of meta.sheets) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${sheet.name}!1:2`,
      valueRenderOption: 'FORMATTED_VALUE',
    })
    const rows = res.data.values || []
    result.sheets.push({
      name: sheet.name,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      headers: rows[0] || [],
      sampleRow: rows[1] || [],
    })
  }

  return result
}

export async function updateRange(id: string, range: string, values: string[][]): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

export async function appendRows(id: string, range: string, values: string[][]): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  })
}
