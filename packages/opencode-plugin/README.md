# Sahayak OpenCode Plugin

OpenCode plugin that bridges Sahayak with OpenCode CLI for background processes,
knowledge graph access, vault integration, and voice mode.

## How it works

- Sahayak server injects this plugin via `OPENCODE_CONFIG_CONTENT` when spawning OpenCode
- Plugin connects back to Sahayak via SSE for bidirectional event communication
- Exposes tools: run_background_process, list_background_processes, etc.
- Voice mode awareness: injects spoken-response prompt when voice is active
