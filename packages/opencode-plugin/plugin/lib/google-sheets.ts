import http from "http"
import https from "https"
import { Readable } from "stream"
import { tool } from "@opencode-ai/plugin/tool"
import type { SahayakConfig } from "./request.js"

function buildAuthHeader(): string {
  const username = process.env.SAHAYAK_SERVER_USERNAME || ""
  const password = process.env.SAHAYAK_SERVER_PASSWORD || ""
  const token = Buffer.from(`${username}:${password}`, "utf8").toString("base64")
  return `Basic ${token}`
}

async function apiRequest<T>(config: SahayakConfig, path: string, init?: RequestInit): Promise<T> {
  const baseUrl = config.baseUrl.replace(/\/+$/, "")
  const url = `${baseUrl}${path}`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: buildAuthHeader(),
  }
  if (init?.headers) {
    for (const [k, v] of Object.entries(init.headers)) {
      headers[k] = String(v)
    }
  }

  return new Promise<T>((resolve, reject) => {
    const parsed = new URL(url)
    const requestFn = parsed.protocol === "https:" ? https.request : http.request
    const method = (init?.method ?? "GET").toUpperCase()
    const body = init?.body

    const req = requestFn(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`API ${res.statusCode}: ${raw}`))
            return
          }
          if (res.statusCode === 204) {
            resolve(undefined as T)
            return
          }
          try {
            resolve(JSON.parse(raw) as T)
          } catch {
            reject(new Error(`Invalid JSON: ${raw.slice(0, 200)}`))
          }
        })
      },
    )

    req.on("error", reject)

    if (body === undefined || body === null) { req.end(); return }
    if (typeof body === "string") { req.end(body); return }
    if (body instanceof Uint8Array) { req.end(Buffer.from(body)); return }
    if (body instanceof ArrayBuffer) { req.end(Buffer.from(new Uint8Array(body))); return }
    req.end(String(body))
  })
}

export function createGoogleSheetsTools(config: SahayakConfig) {
  return {
    google_sheets_list: tool({
      description: "List all Google Sheets spreadsheets the user has access to. Returns id, name, owner, and last modified date for each sheet.",
      args: {},
      async execute() {
        const result = await apiRequest<{ sheets: Array<{ id: string; name: string; updatedAt: string; owner?: string }> }>(
          config, "/api/google/sheets",
        )
        if (result.sheets.length === 0) return "No Google Sheets found."
        return result.sheets.map((s) =>
          `- ${s.name} (id: ${s.id})${s.owner ? ` owner: ${s.owner}` : ""} modified: ${s.updatedAt}`
        ).join("\n")
      },
    }),
    google_sheets_read: tool({
      description: "Read data from a Google Sheet. Provide the spreadsheet id and optionally a range (e.g. 'Sheet1!A1:D10'). Returns the full title, sheet names, and cell values.",
      args: {
        id: tool.schema.string().describe("The spreadsheet ID (from google_sheets_list or the sheet URL)"),
        range: tool.schema.string().optional().describe("Optional range like 'Sheet1!A1:D10'. Defaults to first sheet all columns."),
      },
      async execute(args) {
        const path = args.range
          ? `/api/google/sheets/${encodeURIComponent(args.id)}?range=${encodeURIComponent(args.range)}`
          : `/api/google/sheets/${encodeURIComponent(args.id)}`
        const result = await apiRequest<{ meta: { title: string; sheets: Array<{ name: string }> }; values: string[][] }>(
          config, path,
        )
        const lines: string[] = [`Sheet: ${result.meta.title}`]
        lines.push(`Sheets: ${result.meta.sheets.map((s) => s.name).join(", ")}`)
        lines.push(`Rows: ${result.values.length}, Cols: ${result.values[0]?.length || 0}`)
        lines.push("")
        if (result.values.length > 0) {
          lines.push(result.values.slice(0, 20).map((row) => row.join("\t")).join("\n"))
          if (result.values.length > 20) lines.push(`... ${result.values.length - 20} more rows`)
        }
        return lines.join("\n")
      },
    }),
    google_sheets_update: tool({
      description: "Update a range of cells in a Google Sheet. Provide the spreadsheet id, range (e.g. 'Sheet1!A1:C3'), and a 2D array of values. Replaces existing content at that range.",
      args: {
        id: tool.schema.string().describe("The spreadsheet ID"),
        range: tool.schema.string().describe("Range to update, e.g. 'Sheet1!A1:C3'"),
        values: tool.schema.array(tool.schema.array(tool.schema.string())).describe("2D array of values to write"),
      },
      async execute(args) {
        await apiRequest<{ ok: boolean }>(
          config, `/api/google/sheets/${encodeURIComponent(args.id)}/update`,
          { method: "POST", body: JSON.stringify({ range: args.range, values: args.values }) },
        )
        return `Updated ${args.range} in spreadsheet ${args.id} (${args.values.length} rows, ${args.values[0]?.length || 0} cols).`
      },
    }),
    google_sheets_append: tool({
      description: "Append rows to a Google Sheet. Provide the spreadsheet id, range (e.g. 'Sheet1!A:C'), and a 2D array of values. Rows are added after the last row with data.",
      args: {
        id: tool.schema.string().describe("The spreadsheet ID"),
        range: tool.schema.string().describe("Range indicating where to append, e.g. 'Sheet1!A:C'"),
        values: tool.schema.array(tool.schema.array(tool.schema.string())).describe("2D array of values to append as new rows"),
      },
      async execute(args) {
        await apiRequest<{ ok: boolean }>(
          config, `/api/google/sheets/${encodeURIComponent(args.id)}/append`,
          { method: "POST", body: JSON.stringify({ range: args.range, values: args.values }) },
        )
        return `Appended ${args.values.length} rows to ${args.range} in spreadsheet ${args.id}.`
      },
    }),
  }
}
