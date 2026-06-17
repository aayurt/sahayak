import { createStore } from 'solid-js/store'
import type { JarvisState } from '@sahayak/shared'

const [jarvis, setJarvis] = createStore<JarvisState>({
  status: 'idle',
  mode: 'click',
  isConnected: false,
  transcript: [],
  micActive: false,
})

export function useJarvis() {
  let ws: WebSocket | null = null
  let audioContext: AudioContext | null = null
  let mediaStream: MediaStream | null = null

  async function connect(endpoint: string) {
    setJarvis('status', 'connecting')
    try {
      ws = new WebSocket(endpoint)
      ws.onopen = () => {
        setJarvis('isConnected', true)
        setJarvis('status', 'idle')
      }
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.text) {
          setJarvis('transcript', (t) => [...t, { role: 'assistant', text: data.text }])
        }
      }
      ws.onclose = () => {
        setJarvis('isConnected', false)
        setJarvis('status', 'idle')
      }
    } catch {
      setJarvis('status', 'idle')
    }
  }

  function disconnect() {
    ws?.close()
    ws = null
    stopMic()
    setJarvis('isConnected', false)
  }

  async function startMic() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContext = new AudioContext()
      setJarvis('micActive', true)
      return mediaStream
    } catch {
      return null
    }
  }

  function stopMic() {
    mediaStream?.getTracks().forEach((t) => t.stop())
    mediaStream = null
    audioContext?.close()
    audioContext = null
    setJarvis('micActive', false)
  }

  return {
    jarvis,
    setJarvis,
    connect,
    disconnect,
    startMic,
    stopMic,
  }
}
