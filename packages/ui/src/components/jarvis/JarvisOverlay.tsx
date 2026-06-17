import { createSignal, createEffect, For, Show, onCleanup } from 'solid-js'
import { Orb } from './Orb'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { useJarvis } from './useJarvis'
import { createVoicePipeline } from './voice-pipeline'

export function JarvisOverlay() {
  const [expanded, setExpanded] = createSignal(false)
  const [recording, setRecording] = createSignal(false)
  const [interimText, setInterimText] = createSignal('')
  const [error, setError] = createSignal('')

  const srAvailable = () => !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition

  const { jarvis, setJarvis } = useJarvis()

  const pipeline = createVoicePipeline({
    setStatus: (status) => setJarvis('status', status),
    setMicActive: (active) => {
      setJarvis('micActive', active)
      setRecording(active)
    },
    setError: (msg) => setError(msg),
    setInterimText: (text) => setInterimText(text),
    appendTranscript: (entry) => setJarvis('transcript', (t) => [...t, entry]),
    setExpanded: (val) => setExpanded(val),
    setIsConnected: (val) => setJarvis('isConnected', val),
    getInterimText: () => interimText(),
  })

  function stopSpeech() {
    pipeline.stopSpeech()
    setRecording(false)
  }

  createEffect(() => {
    if (!srAvailable()) {
      setError('Speech recognition not supported — use a Chromium-based browser')
      return
    }
    const handler = (e: CustomEvent<{ content: string }>) => {
      pipeline.handleAssistantResponse(e.detail.content)
    }
    window.addEventListener('sahayak:assistant-response' as any, handler as any)
    onCleanup(() => {
      window.removeEventListener('sahayak:assistant-response' as any, handler as any)
    })
  })

  function handleToggle() {
    if (jarvis.status === 'speaking') {
      pipeline.currentAudio?.pause()
      pipeline.currentAudio = null
      setJarvis('status', 'idle')
    }
    if (expanded()) {
      pipeline.stopRecording()
      pipeline.cancelInterruptListener()
      setExpanded(false)
      setInterimText('')
      setTimeout(() => pipeline.startWakeWordMode(), 300)
    } else {
      pipeline.stopRecording()
      pipeline.cancelInterruptListener()
      setExpanded(true)
      setJarvis('isConnected', true)
      pipeline.startWakeWordMode()
    }
  }

  function handleFooterClick() {
    if (jarvis.status === 'speaking') {
      stopSpeech()
    } else if (recording() || jarvis.status === 'thinking') {
      pipeline.waitingForResponse = false
      pipeline.stopRecording()
      setJarvis('status', 'idle')
      setInterimText('')
      pipeline.startWakeWordMode()
    } else {
      pipeline.startCommandMode()
    }
  }

  onCleanup(() => {
    pipeline.cleanup()
  })

  const [voiceLevel, setVoiceLevel] = createSignal(0)

  const statusColors: Record<string, string> = {
    idle: 'hsl(217, 91%, 60%)',
    listening: 'hsl(142, 71%, 45%)',
    thinking: 'hsl(271, 81%, 56%)',
    speaking: 'hsl(25, 95%, 53%)',
  }

  const orbStatus = () => {
    if (jarvis.status === 'speaking') return 'speaking'
    if (recording()) return 'listening'
    if (jarvis.status === 'thinking') return 'thinking'
    return 'idle'
  }

  createEffect(() => {
    if (recording()) {
      if (interimText()) {
        setVoiceLevel(0.8)
      } else {
        setVoiceLevel(0.3)
      }
    } else {
      setVoiceLevel(0)
    }
  })

  const badgelabel = () => {
    if (jarvis.status === 'speaking') return 'Speaking'
    if (recording()) return 'Listening'
    if (jarvis.status === 'thinking') return 'Thinking'
    return 'Idle'
  }

  const footerLabel = () => {
    if (jarvis.status !== 'idle') return 'Stop'
    return 'Record'
  }

  const footerDanger = () => jarvis.status !== 'idle'

  return (
    <div
      class="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
      style={{ '--orb-color': statusColors[orbStatus()] }}
    >
      {expanded() && (
        <Card class="w-80 mb-2 shadow-xl">
          <CardHeader class="px-3 py-2 border-b border-border flex flex-row items-center justify-between space-y-0">
            <CardTitle class="text-xs font-medium">Jarvis</CardTitle>
            <Badge variant={footerDanger() ? 'default' : 'secondary'} class="text-[10px] h-5">
              {badgelabel()}
            </Badge>
          </CardHeader>
          <CardContent class="h-48 overflow-y-auto p-2">
            <Show when={error()}>
              <div class="text-xs text-destructive text-center py-4">{error()}</div>
            </Show>
            <Show
              when={jarvis.transcript.length > 0 || interimText()}
              fallback={
                !error() && <div class="text-xs text-center py-8 text-muted-foreground">
                  {recording() ? 'Listening...' : 'Say "Hey Jarvis"'}
                </div>
              }
            >
              <For each={jarvis.transcript}>
                {(entry) => (
                  <div class="text-xs mb-2">
                    <span class="font-medium"
                      classList={{
                        'text-primary': entry.role === 'user',
                        'text-foreground': entry.role !== 'user',
                      }}
                    >
                      {entry.role === 'user' ? 'You' : 'Jarvis'}:
                    </span>
                    <span class="ml-1 text-muted-foreground">{entry.text}</span>
                  </div>
                )}
              </For>
              <Show when={interimText()}>
                <div class="text-xs mb-2 text-muted-foreground/60">
                  <span class="italic">{interimText()}</span>
                  <Show when={recording()}><span class="animate-pulse">▊</span></Show>
                </div>
              </Show>
            </Show>
          </CardContent>
          <div class="px-3 py-2 border-t border-border flex items-center gap-2">
            <button
              type="button"
              onClick={handleFooterClick}
              class="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              classList={{
                'bg-destructive text-destructive-foreground hover:bg-destructive/90': footerDanger(),
                'bg-primary text-primary-foreground hover:bg-primary/90': !footerDanger(),
              }}
            >
              {footerLabel()}
            </button>
          </div>
        </Card>
      )}

      <Orb
        status={orbStatus()}
        isConnected={jarvis.isConnected}
        micActive={recording()}
        voiceLevel={voiceLevel()}
        onClick={handleToggle}
      />
    </div>
  )
}
