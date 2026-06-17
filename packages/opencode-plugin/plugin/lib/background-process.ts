import path from "path"
import { tool } from "@opencode-ai/plugin/tool"
import { createSahayakRequester, type SahayakConfig } from "./request.js"

type BackgroundProcess = {
  id: string
  title: string
  command: string
  status: "running" | "stopped" | "error"
  startedAt: string
  stoppedAt?: string
  exitCode?: number
  outputSizeBytes?: number
}

type BackgroundProcessOptions = {
  baseDir: string
}

type ParsedCommand = {
  head: string
  args: string[]
}

export function createBackgroundProcessTools(config: SahayakConfig, options: BackgroundProcessOptions) {
  const requester = createSahayakRequester(config)

  const request = async <T>(apiPath: string, init?: RequestInit): Promise<T> => {
    return requester.requestJson<T>(`/background-processes${apiPath}`, init)
  }

  return {
    run_background_process: tool({
      description:
        "Run a long-lived background process (dev servers, DBs, watchers) so it keeps running while you do other tasks.",
      args: {
        title: tool.schema.string().describe("Short label for the process"),
        command: tool.schema.string().describe("Shell command to run in the workspace"),
        notify: tool.schema.boolean().optional().describe("Notify the current session when the process ends"),
      },
      async execute(args, context) {
        assertCommandWithinBase(args.command, options.baseDir)
        const notification = args.notify
          ? { sessionID: context.sessionID, directory: context.directory }
          : undefined
        const process = await request<BackgroundProcess>("", {
          method: "POST",
          body: JSON.stringify({ title: args.title, command: args.command, notify: args.notify, notification }),
        })
        return `Started background process ${process.id} (${process.title})\nStatus: ${process.status}\nCommand: ${process.command}`
      },
    }),
    list_background_processes: tool({
      description: "List background processes running for this workspace.",
      args: {},
      async execute() {
        const response = await request<{ processes: BackgroundProcess[] }>("")
        if (response.processes.length === 0) return "No background processes running."

        return response.processes
          .map((p) => {
            const exit = p.exitCode !== undefined ? ` (exit ${p.exitCode})` : ""
            const size = typeof p.outputSizeBytes === "number" ? ` | ${Math.round(p.outputSizeBytes / 1024)}KB` : ""
            return `- ${p.id} | ${p.title} | ${p.status}${exit}${size}\n  ${p.command}`
          })
          .join("\n")
      },
    }),
    read_background_process_output: tool({
      description: "Read output from a background process. Use full, grep, head, or tail.",
      args: {
        id: tool.schema.string().describe("Background process ID"),
        method: tool.schema.enum(["full", "grep", "head", "tail"]).default("full").describe("Method to read output"),
        pattern: tool.schema.string().optional().describe("Pattern for grep method"),
        lines: tool.schema.number().optional().describe("Number of lines for head/tail methods"),
      },
      async execute(args) {
        if (args.method === "grep" && !args.pattern) return "Pattern is required for grep method."

        const params = new URLSearchParams({ method: args.method })
        if (args.pattern) params.set("pattern", args.pattern)
        if (args.lines) params.set("lines", String(args.lines))

        const response = await request<{ id: string; content: string; truncated: boolean; sizeBytes: number }>(
          `/${args.id}/output?${params.toString()}`,
        )

        const header = response.truncated
          ? `Output (truncated, ${Math.round(response.sizeBytes / 1024)}KB):`
          : `Output (${Math.round(response.sizeBytes / 1024)}KB):`

        return `${header}\n\n${response.content}`
      },
    }),
    stop_background_process: tool({
      description: "Stop a background process (SIGTERM) but keep its output and entry.",
      args: { id: tool.schema.string().describe("Background process ID") },
      async execute(args) {
        const process = await request<BackgroundProcess>(`/${args.id}/stop`, { method: "POST" })
        return `Stopped background process ${process.id} (${process.title}). Status: ${process.status}`
      },
    }),
    terminate_background_process: tool({
      description: "Terminate a background process and delete its output + entry.",
      args: { id: tool.schema.string().describe("Background process ID") },
      async execute(args) {
        await request<void>(`/${args.id}/terminate`, { method: "POST" })
        return `Terminated background process ${args.id} and removed its output.`
      },
    }),
  }
}

const FILE_COMMANDS = new Set(["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown"])
const EXPANSION_CHARS = /[~*$?\[\]`$]/

function assertCommandWithinBase(command: string, baseDir: string) {
  const normalizedBase = path.resolve(baseDir)
  const commands = splitCommands(command)

  for (const item of commands) {
    if (!FILE_COMMANDS.has(item.head)) continue
    for (const arg of item.args) {
      if (!arg) continue
      if (arg.startsWith("-") || (item.head === "chmod" && arg.startsWith("+"))) continue
      const literalArg = unquote(arg)
      if (EXPANSION_CHARS.test(literalArg)) {
        throw new Error(`Background process commands may only reference paths within ${normalizedBase}.`)
      }
      const resolved = path.isAbsolute(literalArg) ? path.normalize(literalArg) : path.resolve(normalizedBase, literalArg)
      if (!isWithinBase(normalizedBase, resolved)) {
        throw new Error(`Background process commands may only reference paths within ${normalizedBase}.`)
      }
    }
  }
}

function splitCommands(command: string): ParsedCommand[] {
  const tokens = tokenize(command)
  const commands: ParsedCommand[] = []
  let current: string[] = []

  for (const token of tokens) {
    if (isSeparator(token)) {
      if (current.length > 0) {
        commands.push({ head: current[0], args: current.slice(1) })
        current = []
      }
      continue
    }
    current.push(token)
  }
  if (current.length > 0) commands.push({ head: current[0], args: current.slice(1) })
  return commands
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escape = false

  const flush = () => { if (current.length > 0) { tokens.push(current); current = "" } }

  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (escape) { current += c; escape = false; continue }
    if (c === "\\" && quote !== "'") { escape = true; continue }
    if (quote) { current += c; if (c === quote) quote = null; continue }
    if (c === "'" || c === '"') { quote = c; current += c; continue }
    if (c === " " || c === "\n" || c === "\t") { flush(); continue }
    if (c === "|" || c === "&" || c === ";") { flush(); tokens.push(c); continue }
    current += c
  }
  flush()
  return tokens
}

function isSeparator(token: string): boolean { return token === "|" || token === "&" || token === ";" }
function unquote(token: string): string {
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'")))
    return token.slice(1, -1)
  return token
}
function isWithinBase(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
