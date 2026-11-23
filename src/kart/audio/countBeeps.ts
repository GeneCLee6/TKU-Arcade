// 2026-11-22 (owner: "the countdown needs sounds, GO too"; docs/ARCHITECTURE.md §4.73): the start's
// 3, 2, 1 and GO, and the ticks of the ten seconds left after the first finish. Made here, as every
// sound of the kart is (no sound files): a short two-oscillator blip for each count, a brighter
// rising chord for GO, a low wooden tock for each second of the close and a higher one for its last
// three. Our own tones, pitches and envelopes. Into the effects bus (bus.ts): the effects volume and
// the site's sound switch cover them.
import { kartBus } from './bus.ts'

export type CountBeep =
  /** 3, 2, 1 */
  | 'count'
  /** GO */
  | 'go'
  /** A second of the close's countdown */
  | 'close'
  /** One of its last three */
  | 'closeLast'
  /** Time up */
  | 'timeUp'

interface Voice {
  /** Hz, and the waveform */
  readonly notes: readonly { readonly hz: number; readonly type: OscillatorType; readonly level: number }[]
  /** Seconds to rise to full, and to fall away */
  readonly attack: number
  readonly decay: number
  /** Pitch at the end, as a share of the start (a GO rises) */
  readonly bend: number
}

/** Each beep's recipe: pure data, so that a test can read it */
export const BEEPS: Record<CountBeep, Voice> = {
  count: {
    notes: [
      { hz: 740, type: 'triangle', level: 0.32 },
      { hz: 1480, type: 'sine', level: 0.08 },
    ],
    attack: 0.004,
    decay: 0.22,
    bend: 1,
  },
  go: {
    notes: [
      { hz: 988, type: 'triangle', level: 0.24 },
      { hz: 1245, type: 'triangle', level: 0.18 },
      { hz: 1480, type: 'sawtooth', level: 0.06 },
      { hz: 1976, type: 'sine', level: 0.08 },
    ],
    attack: 0.006,
    decay: 0.75,
    bend: 1.06,
  },
  close: {
    notes: [
      { hz: 520, type: 'sine', level: 0.3 },
      { hz: 1560, type: 'triangle', level: 0.05 },
    ],
    attack: 0.003,
    decay: 0.12,
    bend: 0.9,
  },
  closeLast: {
    notes: [
      { hz: 880, type: 'square', level: 0.08 },
      { hz: 880, type: 'sine', level: 0.24 },
    ],
    attack: 0.003,
    decay: 0.18,
    bend: 1,
  },
  timeUp: {
    notes: [
      { hz: 660, type: 'triangle', level: 0.24 },
      { hz: 440, type: 'triangle', level: 0.2 },
      { hz: 330, type: 'sine', level: 0.16 },
    ],
    attack: 0.01,
    decay: 0.9,
    bend: 0.94,
  },
}

let played = 0
/** How many beeps have sounded on this page (the race's e2e reads it, spikeLoop.ts's debug) */
export const beepsPlayed = (): number => played

/** Plays one now; nothing before the first gesture has made the sound (bus.ts) */
export function playBeep(kind: CountBeep): void {
  const bus = kartBus()
  if (!bus) return
  played++
  const { context } = bus
  const voice = BEEPS[kind]
  const start = context.currentTime + 0.005
  const end = start + voice.attack + voice.decay
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(1, start + voice.attack)
  gain.gain.exponentialRampToValueAtTime(0.001, end)
  gain.connect(bus.effects)
  for (const note of voice.notes) {
    const oscillator = context.createOscillator()
    oscillator.type = note.type
    oscillator.frequency.setValueAtTime(note.hz, start)
    if (voice.bend !== 1) {
      oscillator.frequency.exponentialRampToValueAtTime(note.hz * voice.bend, start + voice.decay * 0.6)
    }
    const level = context.createGain()
    level.gain.value = note.level
    oscillator.connect(level).connect(gain)
    oscillator.start(start)
    oscillator.stop(end + 0.02)
    oscillator.onended = () => {
      oscillator.disconnect()
      level.disconnect()
    }
  }
  window.setTimeout(() => gain.disconnect(), (end - context.currentTime + 0.2) * 1000)
}

/**
 * Which beep, if any, a countdown crossing from `before` to `now` seconds left asks for: the start's
 * at 3, 2, 1 and GO
 */
export function startBeep(before: number | null, now: number | null): CountBeep | null {
  if (before === null || now === null || now >= before) return null
  if (before > 0 && now <= 0) return 'go'
  for (const mark of [3, 2, 1]) if (before > mark && now <= mark) return 'count'
  return null
}

/** The close's: a tock for each whole second from 10 down, a higher one for the last three, time up at 0 */
export function closeBeep(before: number | null, now: number | null): CountBeep | null {
  if (before === null || now === null || now >= before) return null
  if (before > 0 && now <= 0) return 'timeUp'
  for (let mark = 10; mark >= 1; mark--) {
    if (before > mark && now <= mark) return mark <= 3 ? 'closeLast' : 'close'
  }
  return null
}
