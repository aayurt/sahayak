import { createSahayakRequester, type SahayakConfig, type PluginEvent } from "./request.js"

export { getSahayakConfig, type SahayakConfig, type PluginEvent } from "./request.js"

export function createSahayakClient(config: SahayakConfig) {
  const requester = createSahayakRequester(config)

  return {
    postEvent: (event: PluginEvent) =>
      requester.requestVoid("/event", {
        method: "POST",
        body: JSON.stringify(event),
      }),
    startEvents: (onEvent: (event: PluginEvent) => void) => startPluginEvents(requester, onEvent),
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function startPluginEvents(
  requester: ReturnType<typeof createSahayakRequester>,
  onEvent: (event: PluginEvent) => void,
) {
  const initialBody = await connectWithRetries(requester, 3)
  void consumeWithReconnect(requester, onEvent, initialBody)
}

async function connectWithRetries(requester: ReturnType<typeof createSahayakRequester>, maxAttempts: number) {
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requester.requestSseBody("/events")
    } catch (error) {
      lastError = error
      await delay(500 * attempt)
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  const url = requester.buildUrl("/events")
  throw new Error(`[SahayakPlugin] Failed to connect to Sahayak at ${url} after ${maxAttempts} retries: ${reason}`)
}

async function consumeWithReconnect(
  requester: ReturnType<typeof createSahayakRequester>,
  onEvent: (event: PluginEvent) => void,
  initialBody: ReadableStream<Uint8Array>,
) {
  let consecutiveFailures = 0
  let body: ReadableStream<Uint8Array> | null = initialBody

  while (true) {
    try {
      if (!body) {
        body = await connectWithRetries(requester, 3)
      }
      await consumeSseBody(body, onEvent)
      body = null
      consecutiveFailures = 0
    } catch (error) {
      body = null
      consecutiveFailures += 1
      if (consecutiveFailures >= 3) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`[SahayakPlugin] Event stream failed after 3 retries: ${reason}`)
      }
      await delay(500 * consecutiveFailures)
    }
  }
}

async function consumeSseBody(body: ReadableStream<Uint8Array>, onEvent: (event: PluginEvent) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done || !value) break

    buffer += decoder.decode(value, { stream: true })

    let separatorIndex = buffer.indexOf("\n\n")
    while (separatorIndex >= 0) {
      const chunk = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      separatorIndex = buffer.indexOf("\n\n")

      const event = parseSseChunk(chunk)
      if (event) onEvent(event)
    }
  }

  throw new Error("SSE stream ended")
}

function parseSseChunk(chunk: string): PluginEvent | null {
  const lines = chunk.split(/\r?\n/)
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith(":")) continue
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart())
  }

  if (dataLines.length === 0) return null
  const payload = dataLines.join("\n").trim()
  if (!payload) return null

  try {
    const parsed = JSON.parse(payload)
    if (!parsed || typeof parsed !== "object" || typeof (parsed as any).type !== "string") return null
    return parsed as PluginEvent
  } catch {
    return null
  }
}
