import { api } from '../../lib/api-client'
import type { JarvisState } from '@sahayak/shared'

export interface PipelineCallbacks {
  setStatus: (status: JarvisState['status']) => void
  setMicActive: (active: boolean) => void
  setError: (msg: string) => void
  setInterimText: (text: string) => void
  appendTranscript: (entry: { role: 'user' | 'assistant'; text: string }) => void
  setExpanded: (expanded: boolean) => void
  setIsConnected: (connected: boolean) => void
  getInterimText: () => string
}

export const WAKE_WORDS = ['jarvis', 'hey jarvis', 'hey sunshine', 'hey luffy', 'hey zoro']

const SILENCE_TIMEOUT_MS = 1500
const INTERRUPT_COOLDOWN_MS = 1000
const INTERRUPT_MIN_WORDS = 2
const CLAP_WINDOW_MS = 1500
const CLAP_THRESHOLD = 2.5
const CLAP_DEBOUNCE_MS = 250

function playWakeTone() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.15)
  } catch {}
}

function getSpeechRecognition(): any {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
}

export function createVoicePipeline(cb: PipelineCallbacks) {
  let recognition: any = null
  let currentAudio: HTMLAudioElement | null = null
  let waitingForResponse = false
  let silenceTimer: ReturnType<typeof setTimeout> | undefined
  let interruptRecognition: any = null
  let wakeWordRetries = 0
  let wakeWordTimer: ReturnType<typeof setTimeout> | undefined
  let wakeWordDetected = false
  let micPermissionDenied = false
  let commandModeActive = false

  // Clap detection state
  let clapStream: MediaStream | null = null
  let clapContext: AudioContext | null = null
  let clapAnimFrame = 0
  let lastClapTime = 0
  let clapCount = 0
  let clapBaseline = 0
  let clapRunning = false

  function handleClap() {
    const now = Date.now()
    if (now - lastClapTime > CLAP_WINDOW_MS) clapCount = 0
    if (now - lastClapTime < CLAP_DEBOUNCE_MS) return
    lastClapTime = now
    clapCount++
    if (clapCount >= 2) {
      clapCount = 0
      stopClapDetection()
      if (currentAudio) {
        currentAudio.pause()
        currentAudio = null
        cb.setStatus('idle')
      }
      stopRecording()
      cb.setExpanded(true)
      cb.setIsConnected(true)
      playWakeTone()
      startCommandMode()
    }
  }

  function stopClapDetection() {
    clapRunning = false
    cancelAnimationFrame(clapAnimFrame)
    if (clapContext) clapContext.close().catch(() => {})
    if (clapStream) clapStream.getTracks().forEach((t) => t.stop())
    clapContext = null
    clapStream = null
    clapCount = 0
  }

  function startClapDetection() {
    stopClapDetection()
    stopRecording()
    clapRunning = true
    if (!navigator.mediaDevices?.getUserMedia) return
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
      if (!clapRunning) { stream.getTracks().forEach((t) => t.stop()); return }
      clapStream = stream
      const ctx = new AC()
      clapContext = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const buffer = new Uint8Array(analyser.frequencyBinCount)

      function analyze() {
        if (!clapRunning) return
        analyser.getByteTimeDomainData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buffer.length)
        if (clapBaseline === 0) clapBaseline = rms
        else clapBaseline = clapBaseline * 0.95 + rms * 0.05
        if (rms > clapBaseline * CLAP_THRESHOLD && rms > 0.03) {
          handleClap()
        }
        clapAnimFrame = requestAnimationFrame(analyze)
      }
      analyze()
    }).catch(() => {})
  }

  function stopRecording() {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    commandModeActive = false
    clearTimeout(silenceTimer)
    if (recognition) {
      try { recognition.stop() } catch {}
      recognition = null
    }
    cb.setMicActive(false)
  }

  function cancelInterruptListener() {
    if (interruptRecognition) {
      try { interruptRecognition.stop() } catch {}
      interruptRecognition = null
    }
  }

  function startInterruptListener() {
    cancelInterruptListener()
    const SR = getSpeechRecognition()
    if (!SR) return

    const ir = new SR()
    ir.continuous = true
    ir.interimResults = false
    ir.lang = 'en-US'

    ir.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const words = event.results[i][0].transcript.trim().split(/\s+/)
          if (words.length >= INTERRUPT_MIN_WORDS) {
            if (currentAudio) {
              currentAudio.pause()
              currentAudio = null
            }
            try { ir.stop() } catch {}
            interruptRecognition = null
            currentAudio = null
            cb.setStatus('idle')
            startCommandMode()
            return
          }
        }
      }
    }

    ir.onerror = () => {}
    ir.onend = () => { interruptRecognition = null }

    try {
      ir.start()
      interruptRecognition = ir
    } catch (err) {
      console.warn('[voice-pipeline] interrupt listener start failed:', err)
    }
  }

  function speakResponse(text: string): Promise<void> {
    stopRecording()
    cancelInterruptListener()
    cb.setInterimText('')

    const interruptTimer = setTimeout(() => startInterruptListener(), INTERRUPT_COOLDOWN_MS)

    return api.speak(text)
      .then((audioBuf: ArrayBuffer) => {
        const blob = new Blob([audioBuf], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        currentAudio = audio
        cb.setStatus('speaking')
        return audio.play().then(() => {
          currentAudio = null
          cb.setStatus('idle')
          URL.revokeObjectURL(url)
        })
      })
      .catch((err: Error) => {
        console.error('[voice-pipeline] TTS error:', err)
        currentAudio = null
        cb.setStatus('idle')
      })
      .finally(() => {
        clearTimeout(interruptTimer)
        cancelInterruptListener()
        startWakeWordMode()
      })
  }

  function handleAssistantResponse(content: string) {
    if (waitingForResponse) {
      waitingForResponse = false
      cb.appendTranscript({ role: 'assistant', text: content })
      speakResponse(content)
    }
  }

  function stopSpeech() {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    cancelInterruptListener()
    cb.setStatus('idle')
    startWakeWordMode()
  }

  function startWakeWordMode() {
    stopRecording()
    stopClapDetection()
    wakeWordDetected = false
    micPermissionDenied = false
    const SR = getSpeechRecognition()
    if (!SR) return

    const wakeRec = new SR()
    recognition = wakeRec
    wakeRec.continuous = true
    wakeRec.interimResults = true
    wakeRec.lang = 'en-US'

    wakeRec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.toLowerCase().trim()
        if (WAKE_WORDS.some((w) => text.includes(w))) {
          if (currentAudio) {
            currentAudio.pause()
            currentAudio = null
            cb.setStatus('idle')
          }
          wakeWordDetected = true
          try { wakeRec.stop() } catch {}
          cb.setExpanded(true)
          cb.setIsConnected(true)
          playWakeTone()
          startCommandMode()
          return
        }
      }
    }

    wakeRec.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        micPermissionDenied = true
        cb.setError('Microphone access denied — allow mic access and click the orb to try again')
        cb.setIsConnected(false)
        return
      }
      cb.setError('Wake word unavailable')
      wakeWordRetries++
      cb.setIsConnected(false)
      if (wakeWordRetries < 5) {
        wakeWordTimer = setTimeout(startWakeWordMode, 2000)
      }
    }

    wakeRec.onend = () => {
      if (micPermissionDenied) return
      if (wakeWordDetected) return
      if (recognition !== wakeRec) return
      wakeWordTimer = setTimeout(startWakeWordMode, 2000)
    }

    try {
      recognition.start()
    } catch {
      cb.setError('Wake word unavailable')
      cb.setIsConnected(false)
    }
  }

  function startCommandMode() {
    stopRecording()
    stopClapDetection()
    clearTimeout(wakeWordTimer)

    const SR = getSpeechRecognition()
    if (!SR) {
      cb.setError('Speech recognition not supported in this browser')
      return
    }

    cb.setError('')
    commandModeActive = true
    const cmdRec = new SR()
    recognition = cmdRec
    cmdRec.continuous = true
    cmdRec.interimResults = true
    cmdRec.lang = 'en-US'

    cmdRec.onresult = (event: any) => {
      clearTimeout(silenceTimer)
      if (waitingForResponse) return

      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        if (result.isFinal) {
          const trimmed = text.trim()
          if (trimmed.toLowerCase().includes('stop listening') || trimmed.toLowerCase().includes('goodbye')) {
            try { cmdRec.stop() } catch {}
            cb.setExpanded(false)
            cb.setInterimText('')
            setTimeout(startWakeWordMode, 500)
            return
          }
          final += ' ' + trimmed
        } else {
          interim += text
        }
      }

      if (final.trim()) {
        stopRecording()
        waitingForResponse = true
        cb.setStatus('thinking')
        cb.appendTranscript({ role: 'user', text: final.trim() })
        dispatchSendEvent(final.trim())
        return
      }

      if (interim.trim()) {
        cb.setInterimText(interim.trim())
        silenceTimer = setTimeout(() => {
          if (cb.getInterimText().trim()) {
            const txt = cb.getInterimText().trim()
            stopRecording()
            waitingForResponse = true
            cb.setStatus('thinking')
            cb.appendTranscript({ role: 'user', text: txt })
            dispatchSendEvent(txt)
          }
        }, SILENCE_TIMEOUT_MS)
      }
    }

    cmdRec.onerror = (event: any) => {
      const msg = event.error === 'not-allowed' ? 'Microphone access denied' : `Error: ${event.error}`
      cb.setError(msg)
      cb.setInterimText(msg)
    }

    cmdRec.onend = () => {
      cb.setMicActive(false)
      if (commandModeActive && recognition === cmdRec) {
        startWakeWordMode()
      }
    }

    try {
      cmdRec.start()
      cb.setStatus('listening')
      cb.setMicActive(true)
      cb.setInterimText('')
    } catch (err) {
      console.error('[voice-pipeline] command mode error:', err)
    }
  }

  function dispatchSendEvent(text: string) {
    window.dispatchEvent(new CustomEvent('sahayak:jarvis-send', { detail: { text } }))
  }

  function toggleCard() {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
      cb.setStatus('idle')
    }
    // Expanded state managed by caller
  }

  function cleanup() {
    stopRecording()
    stopClapDetection()
    cancelInterruptListener()
    clearTimeout(wakeWordTimer)
  }

  return {
    startWakeWordMode,
    startCommandMode,
    speakResponse,
    handleAssistantResponse,
    stopSpeech,
    stopRecording,
    startClapDetection,
    stopClapDetection,
    cancelInterruptListener,
    cleanup,
    toggleCard,
    get waitingForResponse() { return waitingForResponse },
    get currentAudio() { return currentAudio },
    set currentAudio(val) { currentAudio = val },
    get recognition() { return recognition },
    set waitingForResponse(val: boolean) { waitingForResponse = val },
  }
}
