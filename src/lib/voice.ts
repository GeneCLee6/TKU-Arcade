// The voice link (e1-t14): whether this site can open a LongTalk room, asked once a page, and
// opening one. worker/voice.ts is the other end
import { useEffect, useState } from 'react'
import type { VoiceResponse, VoiceStatus } from '../../shared/protocol.ts'

let asked: Promise<boolean> | null = null

function voiceAvailable(): Promise<boolean> {
  asked ??= fetch('/api/voice')
    .then((response) =>
      response.ok ? (response.json() as Promise<VoiceStatus>) : { available: false },
    )
    .then((status) => status.available === true)
    .catch(() => false)
  return asked
}

/** For tests: forget the answer */
export function resetVoiceForTests(): void {
  asked = null
}

/** False until the site says it can open a voice room, and whenever it cannot */
export function useVoiceAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let live = true
    void voiceAvailable().then((answer) => {
      if (live) setAvailable(answer)
    })
    return () => {
      live = false
    }
  }, [])
  return available
}

/** The new voice room's address, or null when none could be opened */
export async function openVoiceRoom(): Promise<string | null> {
  try {
    const response = await fetch('/api/voice', { method: 'POST' })
    if (response.status !== 201) return null
    const { url } = (await response.json()) as VoiceResponse
    return typeof url === 'string' && url.startsWith('https://') ? url : null
  } catch {
    return null
  }
}
