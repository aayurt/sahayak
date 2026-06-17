import type { JarvisState } from '@sahayak/shared'
import { VoicePoweredOrb } from '../ui/voice-powered-orb'

interface OrbProps {
  status: JarvisState['status']
  isConnected: boolean
  micActive: boolean
  voiceLevel?: number
  onClick: () => void
}

const statusHues: Record<string, number> = {
  idle: 217,
  connecting: 38,
  listening: 142,
  thinking: 271,
  speaking: 25,
}

export function Orb(props: OrbProps) {
  const hue = () => statusHues[props.status] || statusHues.idle

  return (
    <button
      class="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer"
      onClick={props.onClick}
      title={props.status}
    >
      <VoicePoweredOrb
        class="rounded-full w-12 h-12"
        hue={hue()}
        voiceLevel={props.voiceLevel ?? 0}
      />
      {props.micActive && (
        <span
          class="absolute -top-1 -right-1 w-3 h-3 rounded-full"
          style={{ background: 'var(--success)' }}
        />
      )}
    </button>
  )
}
