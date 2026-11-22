// 2026-11-22 (#105; docs/KART-PERF.md §10): the kart's sound by the graphics quality, so that a phone
// on low spends less of its CPU on WebAudio as well as on the picture. Pure, so that a test can read
// it: how many one-shot sounds (a hit, a boost's bang, an item's cue) may sound at once, how many of
// a track's ambient beds play and whether the sounds now and then (a gull, a bell) come at all, how
// often the engine's and the ambience's parameters are moved, and whether the engine has its twin.
import type { AmbienceRecipe } from './ambience.ts'
import type { Quality } from '../quality.ts'

export interface AudioTier {
  /** One-shot sounds at once; one more waits its turn (it is dropped) */
  readonly maxVoices: number
  /** The ambience's beds that play, the loudest first */
  readonly ambienceLayers: number
  /** Whether the ambience's voices now and then (a gull, a bell, a car passing) sound */
  readonly occasional: boolean
  /** The sound's parameters are moved every this many frames */
  readonly updateEvery: number
  /** Whether the engine has its second saw, a hair apart (the thick note); low has one */
  readonly engineTwin: boolean
}

export const AUDIO_TIERS: Readonly<Record<Quality, AudioTier>> = {
  low: { maxVoices: 4, ambienceLayers: 1, occasional: false, updateEvery: 3, engineTwin: false },
  medium: { maxVoices: 8, ambienceLayers: 2, occasional: true, updateEvery: 2, engineTwin: true },
  high: { maxVoices: 16, ambienceLayers: 4, occasional: true, updateEvery: 1, engineTwin: true },
}

/** A tier for a quality; high when none is said (the tests, a page that never chose) */
export const audioTier = (quality: Quality | undefined): AudioTier => AUDIO_TIERS[quality ?? 'high']

/** A track's ambience with only the beds the tier plays: the loudest `ambienceLayers` */
export function tierRecipe(recipe: AmbienceRecipe, tier: AudioTier): AmbienceRecipe {
  const kept = Object.entries(recipe.layers)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, tier.ambienceLayers)
  return { ...recipe, layers: Object.fromEntries(kept) }
}

/**
 * The one-shot sounds playing, by when each ends on the audio clock: `claim` says whether one more
 * may start now (and counts it if so)
 */
export function voiceBudget(max: number) {
  let ends: number[] = []
  return {
    claim(now: number, seconds: number): boolean {
      ends = ends.filter((end) => end > now)
      if (ends.length >= max) return false
      ends.push(now + seconds)
      return true
    },
    /** How many are sounding at `now` */
    playing(now: number): number {
      return ends.filter((end) => end > now).length
    },
  }
}
