// 2026-11-23: the social layer's sounds, synthesised with WebAudio like the site's others
// (lib/sound.ts, achievements/sound.ts): no file to host or license. Short and soft, under the game's
// own: a pop for an emote, a two-note tick for a phrase, a rising and a falling flick for the card.
// Silent while the site's sound is off, before the page has been touched, or with no WebAudio.
import { isSoundOn } from '../../lib/sound.ts'

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null
  try {
    context ??= new window.AudioContext()
    if (context.state === 'suspended') void context.resume().catch(() => {})
    return context.state === 'running' ? context : null
  } catch {
    return null
  }
}

function tone(ctx: AudioContext, at: number, from: number, to: number, length: number, gain: number, wave: OscillatorType) {
  const start = ctx.currentTime + at
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()
  oscillator.type = wave
  oscillator.frequency.setValueAtTime(from, start)
  oscillator.frequency.exponentialRampToValueAtTime(to, start + length)
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + length)
  oscillator.connect(envelope)
  envelope.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + length + 0.02)
}

export type SocialSound = 'emote' | 'phrase' | 'open' | 'close'

export function playSocial(sound: SocialSound): void {
  if (!isSoundOn()) return
  const ctx = audio()
  if (!ctx) return
  switch (sound) {
    case 'emote':
      tone(ctx, 0, 420, 880, 0.09, 0.05, 'sine')
      break
    case 'phrase':
      tone(ctx, 0, 660, 660, 0.06, 0.035, 'triangle')
      tone(ctx, 0.07, 990, 990, 0.08, 0.03, 'triangle')
      break
    case 'open':
      tone(ctx, 0, 300, 620, 0.12, 0.035, 'triangle')
      break
    case 'close':
      tone(ctx, 0, 620, 300, 0.1, 0.03, 'triangle')
      break
  }
}
