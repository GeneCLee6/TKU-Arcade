// 2026-11-23 (e11-t06): a badge's sound, synthesised with WebAudio like the site's others (lib/sound.ts):
// no file to host or license. A short rising chime, then a bright ping; quieter for a small badge.
// Silent while the site's sound is off, before the page has been touched, or with no WebAudio.
import { isSoundOn } from '../lib/sound.ts'

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window.AudioContext !== 'function') return null
  try {
    context ??= new window.AudioContext()
    if (context.state === 'suspended') void context.resume().catch(() => {})
    return context
  } catch {
    return null
  }
}

function tone(ctx: AudioContext, at: number, frequency: number, length: number, gain: number, wave: OscillatorType) {
  const start = ctx.currentTime + at
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()
  oscillator.type = wave
  oscillator.frequency.setValueAtTime(frequency, start)
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + length)
  oscillator.connect(envelope)
  envelope.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + length + 0.02)
}

/** The chime for a badge of `tier` (1 to 3): one note more for each */
export function playUnlock(tier: 1 | 2 | 3): void {
  if (!isSoundOn()) return
  const ctx = audio()
  if (!ctx || ctx.state !== 'running') return
  const notes = [523.25, 659.25, 783.99, 1046.5].slice(0, tier + 1)
  notes.forEach((frequency, index) => tone(ctx, index * 0.075, frequency, 0.22, 0.07, 'triangle'))
  const end = notes.length * 0.075
  tone(ctx, end, notes.at(-1)! * 2, 0.5, 0.045, 'sine')
  tone(ctx, end + 0.01, notes.at(-1)! * 3, 0.35, 0.015, 'sine')
}
