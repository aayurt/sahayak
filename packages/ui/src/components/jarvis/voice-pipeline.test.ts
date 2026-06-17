import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVoicePipeline } from './voice-pipeline'
import type { PipelineCallbacks } from './voice-pipeline'

// --- Mocks ---

function createMockSR() {
  const instance: any = {
    continuous: false,
    interimResults: false,
    lang: '',
    start: vi.fn(),
    stop: vi.fn(() => {
      // Fire onend asynchronously
      setTimeout(() => { if (instance.onend) instance.onend() }, 0)
    }),
    onresult: null,
    onerror: null,
    onend: null,
    // Test helpers
    _fireResult: (results: Array<{ transcript: string; isFinal: boolean }>) => {
      if (!instance.onresult) return
      const event = {
        resultIndex: 0,
        results: results.map((r) => ({
          isFinal: r.isFinal,
          '0': { transcript: r.transcript },
          length: 1,
        })),
      }
      instance.onresult(event)
    },
    _fireError: (error: string) => {
      if (instance.onerror) instance.onerror({ error })
    },
  }
  return instance
}

function makeCallbacks(overrides: Partial<PipelineCallbacks> = {}): PipelineCallbacks {
  return {
    setStatus: vi.fn(),
    setMicActive: vi.fn(),
    setError: vi.fn(),
    setInterimText: vi.fn(),
    appendTranscript: vi.fn(),
    setExpanded: vi.fn(),
    setIsConnected: vi.fn(),
    getInterimText: () => '',
    ...overrides,
  }
}

let mockSR: any = null

function setupSR() {
  mockSR = createMockSR()
  const ctor = vi.fn(() => mockSR)
  ;(window as any).SpeechRecognition = ctor
  return ctor
}

function teardownSR() {
  delete (window as any).SpeechRecognition
  delete (window as any).webkitSpeechRecognition
  mockSR = null
}

// Mock Audio
function mockAudio() {
  const audio = {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  }
  ;(globalThis as any).Audio = vi.fn(() => audio)
  return audio
}

// Mock AudioContext for wake tone
let mockOsc: any, mockGain: any, mockCtx: any
function mockAudioContext() {
  mockOsc = { start: vi.fn(), stop: vi.fn(), connect: vi.fn() }
  mockGain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }
  mockCtx = {
    createOscillator: vi.fn(() => mockOsc),
    createGain: vi.fn(() => mockGain),
    createMediaStreamSource: vi.fn(),
    createAnalyser: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    destination: 'mock',
    currentTime: 0,
  }
  ;(window as any).AudioContext = vi.fn(() => mockCtx)
}

// Mock MediaDevices for clap detection
function setupMediaDevices() {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: vi.fn(() => []) }) },
    configurable: true,
  })
  if (mockCtx) {
    mockCtx.createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }))
    mockCtx.createAnalyser = vi.fn(() => ({
      fftSize: 0,
      frequencyBinCount: 256,
      getByteTimeDomainData: vi.fn(),
    }))
  }
}

function teardownMediaDevices() {
  delete (navigator as any).mediaDevices
}

// Mock api.speak
vi.mock('../../lib/api-client', () => ({
  api: {
    speak: vi.fn(),
  },
}))

import { api } from '../../lib/api-client'
const mockApiSpeak = vi.mocked(api.speak)

function tick(ms = 0) {
  return new Promise((r) => setTimeout(r, ms))
}

describe('voice-pipeline', () => {
  let callbacks: PipelineCallbacks
  let pipeline: ReturnType<typeof createVoicePipeline>

  beforeEach(() => {
    setupSR()
    callbacks = makeCallbacks()
    mockApiSpeak.mockResolvedValue(new ArrayBuffer(44))
    mockAudio()
    mockAudioContext()
    setupMediaDevices()
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock')
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    pipeline?.cleanup()
    teardownSR()
    delete (window as any).Audio
    delete (window as any).AudioContext
    teardownMediaDevices()
    mockOsc = mockGain = mockCtx = null
    vi.clearAllMocks()
  })

  // ─── Wake Word Mode ─────────────────────────────────────

  describe('wake word mode', () => {
    it('starts wake word recognition', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      expect(mockSR.continuous).toBe(true)
      expect(mockSR.interimResults).toBe(true)
      expect(mockSR.lang).toBe('en-US')
      expect(mockSR.start).toHaveBeenCalled()
    })

    it('detects wake word and transitions to command mode', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      mockSR._fireResult([{ transcript: 'hey jarvis what time is it', isFinal: true }])

      expect(callbacks.setExpanded).toHaveBeenCalledWith(true)
      expect(callbacks.setIsConnected).toHaveBeenCalledWith(true)
      // Should have stopped wake word and started command mode (new start call)
      expect(mockSR.stop).toHaveBeenCalled()
      expect(mockSR.start).toHaveBeenCalledTimes(2) // initial + command mode
    })

    it('detects alternate wake words like hey sunshine', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      mockSR._fireResult([{ transcript: 'hey sunshine what is the weather', isFinal: true }])

      expect(callbacks.setExpanded).toHaveBeenCalledWith(true)
      expect(mockSR.stop).toHaveBeenCalled()
    })

    it('detects alternate wake words like hey luffy', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      mockSR._fireResult([{ transcript: 'hey luffy', isFinal: true }])

      expect(callbacks.setExpanded).toHaveBeenCalledWith(true)
    })

    it('detects alternate wake words like hey zoro', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      mockSR._fireResult([{ transcript: 'hey zoro', isFinal: true }])

      expect(callbacks.setExpanded).toHaveBeenCalledWith(true)
    })

    it('plays wake tone on detection', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      mockSR._fireResult([{ transcript: 'jarvis', isFinal: true }])

      expect(mockCtx.createOscillator).toHaveBeenCalled()
      expect(mockCtx.createGain).toHaveBeenCalled()
    })

    it('detects wake word and interrupts current audio', () => {
      pipeline = createVoicePipeline(callbacks)
      const audio = mockAudio()
      pipeline.currentAudio = audio as any

      pipeline.startWakeWordMode()
      mockSR._fireResult([{ transcript: 'jarvis', isFinal: true }])

      expect(audio.pause).toHaveBeenCalled()
    })

    it('restarts on end event (continuous loop)', () => {
      vi.useFakeTimers()
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      const initialCalls = mockSR.start.mock.calls.length
      mockSR.onend()
      vi.advanceTimersByTime(2500)
      expect(mockSR.start).toHaveBeenCalledTimes(initialCalls + 1)
      vi.useRealTimers()
    })

    it('handles errors with retries for wake word mode', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      mockSR._fireError('no-speech')
      expect(callbacks.setError).toHaveBeenCalledWith('Wake word unavailable')
    })
  })

  // ─── Clap Detection ─────────────────────────────────────

  describe('clap detection', () => {
    it('starts getUserMedia and analysis when called', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startClapDetection()

      expect(navigator.mediaDevices?.getUserMedia).toHaveBeenCalledWith({ audio: true })
    })

    it('stops speech recognition when starting', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()

      const srStop = mockSR.stop.mock.calls.length
      pipeline.startClapDetection()

      expect(mockSR.stop).toHaveBeenCalledTimes(srStop + 1)
    })

    it('stopClapDetection cleans up and allows restart', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startClapDetection()
      pipeline.stopClapDetection()

      const getUserMedia = vi.mocked(navigator.mediaDevices!.getUserMedia)
      const callsBefore = getUserMedia.mock.calls.length
      pipeline.startClapDetection()
      expect(getUserMedia.mock.calls.length).toBe(callsBefore + 1)
    })

    it('cleanup stops clap detection', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startClapDetection()
      pipeline.cleanup()

      const getUserMedia = vi.mocked(navigator.mediaDevices!.getUserMedia)
      const callsBefore = getUserMedia.mock.calls.length
      pipeline.startClapDetection()
      expect(getUserMedia.mock.calls.length).toBe(callsBefore + 1)
    })
  })

  // ─── Command Mode ────────────────────────────────────────

  describe('command mode', () => {
    it('starts command mode recognition', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      expect(mockSR.continuous).toBe(true)
      expect(mockSR.interimResults).toBe(true)
      expect(mockSR.start).toHaveBeenCalled()
      expect(callbacks.setStatus).toHaveBeenCalledWith('listening')
      expect(callbacks.setMicActive).toHaveBeenCalledWith(true)
    })

    it('sends message on final result', () => {
      const events: CustomEvent[] = []
      const handler = (e: CustomEvent) => events.push(e)
      window.addEventListener('sahayak:jarvis-send', handler as any)

      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      mockSR._fireResult([{ transcript: 'hello world', isFinal: true }])

      expect(callbacks.setStatus).toHaveBeenCalledWith('thinking')
      expect(callbacks.appendTranscript).toHaveBeenCalledWith({ role: 'user', text: 'hello world' })
      expect(events.length).toBe(1)
      expect(events[0].detail.text).toBe('hello world')

      window.removeEventListener('sahayak:jarvis-send', handler as any)
    })

    it('does not send duplicate on race conditions', () => {
      const events: CustomEvent[] = []
      const handler = (e: CustomEvent) => events.push(e)
      window.addEventListener('sahayak:jarvis-send', handler as any)

      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      // Simulate waitingForResponse already being true (message already sent)
      pipeline.waitingForResponse = true
      mockSR._fireResult([{ transcript: 'duplicate', isFinal: true }])

      // Should be blocked by waitingForResponse guard
      expect(events.length).toBe(0)

      window.removeEventListener('sahayak:jarvis-send', handler as any)
    })

    it('shows interim text while user is speaking', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      mockSR._fireResult([{ transcript: 'what is the', isFinal: false }])

      expect(callbacks.setInterimText).toHaveBeenCalledWith('what is the')
    })

    it('handles stop listening phrase', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      mockSR._fireResult([{ transcript: 'stop listening', isFinal: true }])

      expect(callbacks.setExpanded).toHaveBeenCalledWith(false)
      expect(callbacks.setInterimText).toHaveBeenCalledWith('')
      // Should restart wake word mode after 500ms
      expect(mockSR.stop).toHaveBeenCalled()
    })

    it('handles goodbye phrase', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      mockSR._fireResult([{ transcript: 'goodbye', isFinal: true }])

      expect(callbacks.setExpanded).toHaveBeenCalledWith(false)
    })

    it('shows error on microphone denial', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      mockSR._fireError('not-allowed')

      expect(callbacks.setError).toHaveBeenCalledWith('Microphone access denied')
    })
  })

  // ─── Silence VAD ────────────────────────────────────────

  describe('silence VAD timeout', () => {
    it('sends message after 1.5s of silence with interim text', async () => {
      const events: CustomEvent[] = []
      const handler = (e: CustomEvent) => events.push(e)
      window.addEventListener('sahayak:jarvis-send', handler as any)

      callbacks.getInterimText = () => 'what is the weather'
      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      // Fire interim result to start the silence timer
      mockSR._fireResult([{ transcript: 'what is the weather', isFinal: false }])

      // Wait for silence timeout to fire
      await tick(2000)

      expect(callbacks.setStatus).toHaveBeenCalledWith('thinking')
      expect(events.length).toBeGreaterThanOrEqual(1)
      if (events.length > 0) {
        expect(events[0].detail.text).toBe('what is the weather')
      }

      window.removeEventListener('sahayak:jarvis-send', handler as any)
    })

    it('resets silence timer on new speech', () => {
      vi.useFakeTimers()

      const events: CustomEvent[] = []
      const handler = (e: CustomEvent) => events.push(e)
      window.addEventListener('sahayak:jarvis-send', handler as any)

      callbacks.getInterimText = () => 'what is the weather like'
      pipeline = createVoicePipeline(callbacks)
      pipeline.startCommandMode()

      mockSR._fireResult([{ transcript: 'what is', isFinal: false }])
      vi.advanceTimersByTime(1000)
      expect(events.length).toBe(0)

      mockSR._fireResult([{ transcript: 'what is the weather like', isFinal: false }])
      vi.advanceTimersByTime(1000)
      expect(events.length).toBe(0)

      vi.advanceTimersByTime(1000)
      expect(events.length).toBe(1)
      expect(events[0].detail.text).toBe('what is the weather like')

      window.removeEventListener('sahayak:jarvis-send', handler as any)
      vi.useRealTimers()
    })
  })

  // ─── TTS / Speak Response ───────────────────────────────

  describe('speak response (TTS)', () => {
    it('calls api.speak and plays audio', async () => {
      const audio = mockAudio()
      mockApiSpeak.mockResolvedValue(new ArrayBuffer(44))

      pipeline = createVoicePipeline(callbacks)
      const promise = pipeline.speakResponse('Hello world')

      expect(mockApiSpeak).toHaveBeenCalledWith('Hello world')

      await promise

      expect(audio.play).toHaveBeenCalled()
      expect(callbacks.setStatus).toHaveBeenCalledWith('speaking')
    })

    it('starts wake word mode after TTS completes', async () => {
      pipeline = createVoicePipeline(callbacks)

      await pipeline.speakResponse('Hello')

      expect(mockSR.start).toHaveBeenCalled()
    })

    it('handles TTS errors gracefully', async () => {
      mockApiSpeak.mockRejectedValue(new Error('TTS failed'))

      pipeline = createVoicePipeline(callbacks)
      const promise = pipeline.speakResponse('Hello')

      await promise
      // Should not throw
      expect(callbacks.setStatus).toHaveBeenCalledWith('idle')
    })
  })

  // ─── Interrupt During TTS ──────────────────────────────

  describe('interrupt during TTS', () => {
    it('starts interrupt listener 1s after TTS begins', async () => {
      mockApiSpeak.mockImplementation(() => new Promise(() => {})) // never resolves
      mockAudio()

      pipeline = createVoicePipeline(callbacks)
      pipeline.speakResponse('Long story')

      await tick(100)
      await tick(1200)

      expect(mockSR.start).toHaveBeenCalled()
    })
  })

  // ─── Handle Assistant Response ─────────────────────────

  describe('handleAssistantResponse', () => {
    it('appends transcript and speaks when waiting', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.waitingForResponse = true

      pipeline.handleAssistantResponse('Hello back')

      expect(callbacks.appendTranscript).toHaveBeenCalledWith({ role: 'assistant', text: 'Hello back' })
      expect(mockApiSpeak).toHaveBeenCalledWith('Hello back')
    })

    it('ignores response when not waiting', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.waitingForResponse = false

      pipeline.handleAssistantResponse('Hello back')

      expect(callbacks.appendTranscript).not.toHaveBeenCalled()
      expect(mockApiSpeak).not.toHaveBeenCalled()
    })
  })

  // ─── Stop Speech ────────────────────────────────────────

  describe('stopSpeech', () => {
    it('pauses audio and starts wake word mode', () => {
      const audio = mockAudio()
      pipeline = createVoicePipeline(callbacks)
      pipeline.currentAudio = audio as any

      pipeline.stopSpeech()

      expect(audio.pause).toHaveBeenCalled()
      expect(callbacks.setStatus).toHaveBeenCalledWith('idle')
      expect(mockSR.start).toHaveBeenCalled()
    })
  })

  // ─── Cleanup ────────────────────────────────────────────

  describe('cleanup', () => {
    it('stops recording and interrupt listener', () => {
      pipeline = createVoicePipeline(callbacks)
      pipeline.startWakeWordMode()
      mockSR.stop.mockClear()

      pipeline.cleanup()

      expect(mockSR.stop).toHaveBeenCalled()
    })
  })
})
