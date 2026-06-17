import type { PluginInput } from "@opencode-ai/plugin"
import { createSahayakClient, getSahayakConfig } from "./lib/client.js"
import { createBackgroundProcessTools } from "./lib/background-process.js"

let voiceModeEnabled = false

export async function SahayakPlugin(input: PluginInput): Promise<{
  tool: ReturnType<typeof createBackgroundProcessTools>
  "chat.message": ChatMessageHook
  event: EventHook
}> {
  const config = getSahayakConfig()
  const client = createSahayakClient(config)
  const backgroundProcessTools = createBackgroundProcessTools(config, { baseDir: input.directory })

  await client.startEvents((event) => {
    if (event.type === "sahayak.ping") {
      void client.postEvent({
        type: "sahayak.pong",
        properties: { ts: Date.now(), pingTs: (event.properties as any)?.ts },
      }).catch(() => {})
      return
    }

    if (event.type === "sahayak.voiceMode") {
      voiceModeEnabled = Boolean((event.properties as { enabled?: unknown } | undefined)?.enabled)
    }
  })

  return {
    tool: {
      ...backgroundProcessTools,
    },
    async "chat.message"(_input: { sessionID: string }, output: { message: { system?: string } }) {
      if (!voiceModeEnabled) return

      output.message.system = [output.message.system, buildVoiceModePrompt()].filter(Boolean).join("\n\n")
    },
    async event(input: { event: any }) {
      const opencodeEvent = input?.event
      if (!opencodeEvent || typeof opencodeEvent !== "object") return
    },
  }
}

type ChatMessageHook = (
  _input: { sessionID: string },
  output: { message: { system?: string } },
) => Promise<void>

type EventHook = (input: { event: any }) => Promise<void>

function buildVoiceModePrompt(): string {
  return [
    "Voice conversation mode is enabled.",
    "Prepend your reply with a fenced code block using language `spoken`.",
    "The `spoken` block should be the natural conversational reply you would say out loud to the user. It should be a concise spoken gist of the full response in 2 to 4 natural sentences.",
    "In the spoken block, summarize the main outcome, recommendation, or next step. Sound conversational and natural.",
    "Do not include code, bullet lists, markdown formatting, or long technical detail in the spoken block.",
    "After the `spoken` block, continue with your normal detailed response.",
    "Example:",
    "```spoken\nI connected to your vault and found the relevant notes. Here's what I recommend.\n```",
  ].join("\n\n")
}
