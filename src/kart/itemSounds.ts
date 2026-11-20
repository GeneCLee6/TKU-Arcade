// 2026-11-17: the item race's sounds, as recipes for kartAudio.ts to synthesise with WebAudio (no
// sound files, like the rest of the kart's). Each cue is a few voices: a tone gliding from one pitch
// to another, or a burst of filtered noise sweeping its filter. Our own simple shapes: chimes, sweeps,
// whooshes and thumps, not modelled on any game's sounds. Pure data, so a test can read them.
import type { ItemId } from '../../shared/kart/items.ts'
import type { ItemCue } from './hitFx.ts'

export type Voice =
  | {
      readonly kind: 'tone'
      readonly wave: OscillatorType
      /** Hz at the start and the end */
      readonly from: number
      readonly to: number
      readonly seconds: number
      readonly gain: number
      /** Starts this long after the cue, s */
      readonly delay?: number
    }
  | {
      readonly kind: 'noise'
      readonly filter: BiquadFilterType
      /** The filter's frequency at the start and the end, Hz */
      readonly from: number
      readonly to: number
      readonly q?: number
      readonly seconds: number
      readonly gain: number
      readonly delay?: number
    }

const tone = (
  wave: OscillatorType,
  from: number,
  to: number,
  seconds: number,
  gain: number,
  delay = 0,
): Voice => ({ kind: 'tone', wave, from, to, seconds, gain, delay })

const noise = (
  filter: BiquadFilterType,
  from: number,
  to: number,
  seconds: number,
  gain: number,
  q = 1,
  delay = 0,
): Voice => ({ kind: 'noise', filter, from, to, q, seconds, gain, delay })

/** What each item sounds like when this racer uses it */
export const USE_SOUNDS: Record<ItemId, readonly Voice[]> = {
  // A rising sweep with a hiss under it
  boost: [tone('sawtooth', 180, 720, 0.35, 0.18), noise('highpass', 1200, 3000, 0.35, 0.18)],
  // A bright three-note chime going up
  shield: [
    tone('triangle', 784, 784, 0.18, 0.22),
    tone('triangle', 988, 988, 0.18, 0.22, 0.07),
    tone('triangle', 1319, 1319, 0.3, 0.2, 0.14),
  ],
  // A low pull, wobbling up
  tow: [tone('sine', 120, 260, 0.45, 0.3), tone('square', 240, 330, 0.2, 0.06, 0.1)],
  // A whoosh sweeping up
  headwind: [noise('bandpass', 300, 1800, 0.6, 0.45, 1.2)],
  // Two tones trading places
  swap: [
    tone('square', 523, 784, 0.12, 0.1),
    tone('square', 784, 523, 0.12, 0.1, 0.12),
    tone('square', 523, 784, 0.12, 0.08, 0.24),
  ],
  // A quick throw: a flick of noise and a high ping falling
  hail: [noise('highpass', 2500, 5000, 0.12, 0.3), tone('sine', 1760, 1100, 0.2, 0.14)],
  // A distant rumble
  cloud: [noise('lowpass', 260, 120, 0.7, 0.55), tone('sine', 70, 55, 0.6, 0.18)],
  // A plop
  puddle: [tone('sine', 420, 90, 0.22, 0.3), noise('lowpass', 700, 200, 0.15, 0.2)],
  // 2026-11-20. A glassy ring: two high tones a fifth apart, shimmering down
  mirror: [tone('sine', 1568, 1480, 0.4, 0.14), tone('sine', 2349, 2217, 0.35, 0.08, 0.03)],
  // A soft low hiss rolling in
  fog: [noise('lowpass', 900, 300, 0.8, 0.35, 0.7), tone('sine', 110, 90, 0.6, 0.08)],
  // A skip across water: three quick ticks rising, then a splash
  skip: [
    tone('triangle', 600, 760, 0.06, 0.16),
    tone('triangle', 760, 920, 0.06, 0.16, 0.09),
    tone('triangle', 920, 1100, 0.06, 0.16, 0.18),
    noise('bandpass', 2000, 600, 0.25, 0.3, 1, 0.26),
  ],
  // A dry crackle with a buzzing tone under it
  jam: [noise('highpass', 4000, 2500, 0.4, 0.3, 2), tone('square', 95, 90, 0.4, 0.05)],
  // A cheerful two-note call going up, twice
  rally: [
    tone('triangle', 523, 523, 0.12, 0.18),
    tone('triangle', 784, 784, 0.18, 0.18, 0.12),
    tone('triangle', 659, 659, 0.12, 0.14, 0.3),
    tone('triangle', 1047, 1047, 0.22, 0.14, 0.42),
  ],
  // A hollow thunk of a box set down
  decoy: [tone('sine', 220, 160, 0.18, 0.3), noise('lowpass', 500, 200, 0.1, 0.18)],
}

/** The other cues: an item taken, a hit taken, a hit landed, a bubble popped */
export const CUE_SOUNDS = {
  // Two quick rising blips
  pickup: [tone('sine', 660, 700, 0.08, 0.2), tone('sine', 990, 1050, 0.12, 0.2, 0.08)],
  // A crack and a falling wobble
  hit: [noise('lowpass', 1800, 300, 0.3, 0.7), tone('triangle', 520, 110, 0.55, 0.22)],
  // A small bright ding: yours landed
  landed: [tone('sine', 1175, 1175, 0.22, 0.14)],
  // A short snap and a falling squeak
  pop: [noise('highpass', 3000, 6000, 0.05, 0.45), tone('sine', 1400, 380, 0.14, 0.2)],
  // 2026-11-20. A bright ping and a ring going up: yours sent it back
  bounce: [tone('sine', 1320, 1760, 0.12, 0.18), tone('sine', 2640, 2640, 0.25, 0.08, 0.08)],
  // A muffled whoosh closing in
  fogged: [noise('lowpass', 1400, 250, 0.6, 0.4, 0.6)],
  // A short buzz, cut off
  jammed: [tone('square', 140, 120, 0.25, 0.08), noise('highpass', 3500, 3000, 0.2, 0.2, 3)],
} satisfies Record<Exclude<ItemCue['kind'], 'use'>, readonly Voice[]>

export const voicesOf = (cue: ItemCue): readonly Voice[] =>
  cue.kind === 'use' ? USE_SOUNDS[cue.item] : CUE_SOUNDS[cue.kind]

/** How long a cue lasts, s */
export const cueSeconds = (cue: ItemCue): number =>
  Math.max(...voicesOf(cue).map((voice) => (voice.delay ?? 0) + voice.seconds))
