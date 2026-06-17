import { existsSync, readdirSync } from "fs"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const pluginPackageName = "@sahayak/opencode-plugin"

// From both src/ and dist/, ../../ resolves to the project root
const devPluginEntry = path.resolve(__dirname, "../../opencode-plugin/plugin/sahayak.ts")
const prodPluginDirs = [
  path.resolve(__dirname, "opencode-plugin"),
]

export function getSahayakPluginUrl(): string {
  // Always try the source plugin first (works in dev + from dist in monorepo)
  if (existsSync(devPluginEntry)) {
    return pathToFileURL(devPluginEntry).href
  }

  // Production: look for a packaged .tgz next to the server bundle
  for (const dir of prodPluginDirs) {
    const tarball = findPluginTarball(dir)
    if (tarball) return toNpmFileSpecifier(tarball)
  }

  throw new Error(
    `Sahayak OpenCode plugin not found at ${devPluginEntry} or as .tgz in ${prodPluginDirs.join(", ")}. ` +
    `Run \`pnpm --filter @sahayak/opencode-plugin build\` first.`,
  )
}

export function buildOpencodeConfigContent(existingContent: string | undefined, pluginUrl: string): string {
  const config = existingContent?.trim() ? parseJsonObject(existingContent) : {}
  const existingPlugins = normalizePluginEntries(config.plugin)
  if (!existingPlugins.includes(pluginUrl)) existingPlugins.push(pluginUrl)
  return JSON.stringify({
    $schema: typeof config.$schema === "string" ? config.$schema : "https://opencode.ai/config.json",
    ...config,
    permission: { "*": "allow" },
    plugin: existingPlugins,
  }, null, 2)
}

export function resolveExistingOpencodeConfigContent(userEnvironment: Record<string, unknown>): string | undefined {
  const value = typeof userEnvironment.OPENCODE_CONFIG_CONTENT === "string" && userEnvironment.OPENCODE_CONFIG_CONTENT.trim().length > 0
    ? userEnvironment.OPENCODE_CONFIG_CONTENT
    : undefined
  return value ?? (typeof process.env.OPENCODE_CONFIG_CONTENT === "string" ? process.env.OPENCODE_CONFIG_CONTENT : undefined)
}

function toNpmFileSpecifier(filePath: string): string {
  return `${pluginPackageName}@file:${filePath.replace(/\\/g, "/")}`
}

function findPluginTarball(dir: string): string | null {
  if (!existsSync(dir)) return null
  const tarballs = readdirSync(dir).filter((name) => name.endsWith(".tgz")).sort()
  return tarballs.length > 0 ? path.resolve(dir, tarballs[tarballs.length - 1]) : null
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Must be a JSON object")
    return parsed as Record<string, unknown>
  } catch (error) {
    throw new Error(`Failed to parse OPENCODE_CONFIG_CONTENT: ${(error as Error).message}`)
  }
}

function normalizePluginEntries(value: unknown): string[] {
  if (value === undefined) return []
  if (typeof value === "string") return [value]
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return [...value]
  throw new Error("plugin field must be a string or string array")
}
