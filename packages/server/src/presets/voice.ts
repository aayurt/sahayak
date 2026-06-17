/**
 * Voice sidecar preset — auto-starts the Python voice server
 */

import { startSidecar } from '../sidecar'
import { DEFAULT_VOICE_PORT } from '@sahayak/shared'
import { existsSync } from 'fs'
import { resolve } from 'path'

const VOICESERVER_DIR = resolve(process.env.SAHAYAK_VOICESERVER_DIR || './voiceserver')

export async function startVoiceSidecar(): Promise<{
  id: string
  port: number
  basePath: string
} | null> {
  const mainPy = resolve(VOICESERVER_DIR, 'main.py')
  const serverPy = resolve(VOICESERVER_DIR, 'server.py')
  if (!existsSync(mainPy) && !existsSync(serverPy)) {
    console.warn('[voice] voiceserver/ not found, skipping auto-start')
    return null
  }

  // Prefer env override, then venv, then system python
  const pythonBin = process.env.SAHAYAK_VOICESERVER_PYTHON
    || (existsSync(resolve(VOICESERVER_DIR, '.venv/bin/python3'))
      ? resolve(VOICESERVER_DIR, '.venv/bin/python3')
      : 'python3')

  try {
    const proc = await startSidecar('voice', 'Voice Server', pythonBin, [
      resolve(VOICESERVER_DIR, 'main.py'),
    ], {
      STT_MODEL: process.env.STT_MODEL || 'base',
      STT_DEVICE: process.env.STT_DEVICE || 'cpu',
      STT_COMPUTE: process.env.STT_COMPUTE || 'int8',
      TTS_LANG: process.env.TTS_LANG || 'a',
    })
    console.log(`[voice] sidecar started on port ${proc.port} → ${proc.basePath}`)
    return { id: proc.id, port: proc.port, basePath: proc.basePath }
  } catch (e) {
    console.warn('[voice] failed to start sidecar:', (e as Error).message)
    return null
  }
}
