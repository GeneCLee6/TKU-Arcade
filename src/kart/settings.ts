// 2026-11-22 (owner: "the menu can set the music and sound volumes, the animations and effects";
// docs/ARCHITECTURE.md §4.72): the kart's race settings besides the volumes (audio/volumes.ts), the
// quality (quality.ts) and the tips (school/store.ts): how much effect is drawn, whether the camera
// shakes, and how the race opens. Kept in this browser (lib/storage.ts never throws: blocked storage
// keeps them for the page); read by the scene when it is built and by the race loop every frame.
import { readStored, writeStored } from '../lib/storage.ts'
import type { PostLevel } from './post.ts'

export type EffectsLevel = 'low' | 'medium' | 'high'
export const EFFECTS_LEVELS: readonly EffectsLevel[] = ['low', 'medium', 'high']

export interface RaceSettings {
  /** Particles (smoke, sparks, boost fire) and the picture's developing (post.ts) */
  readonly effects: EffectsLevel
  /** The camera's shake on a hit, a landing, a boost's kick */
  readonly shake: boolean
  /** Before the 3, 2, 1: each driver presented in turn */
  readonly driverIntro: boolean
  /** ... or, when the drivers are not presented, the fly round the grid (§4.43) */
  readonly flyby: boolean
}

export const DEFAULT_SETTINGS: RaceSettings = {
  effects: 'high',
  shake: true,
  driverIntro: true,
  flyby: true,
}

/** The share of the particles each level lays */
export const PARTICLE_SHARE: Record<EffectsLevel, number> = { low: 0.35, medium: 0.7, high: 1 }

/** The most developing each level allows; the quality may allow less (quality.ts) */
const POST_CAP: Record<EffectsLevel, PostLevel> = { low: 'off', medium: 'bloom', high: 'full' }
const POST_ORDER: readonly PostLevel[] = ['off', 'bloom', 'full']

/** The developing to use: the quality's, no more than the effects level allows */
export function cappedPost(quality: PostLevel, effects: EffectsLevel): PostLevel {
  const cap = POST_CAP[effects]
  return POST_ORDER.indexOf(quality) <= POST_ORDER.indexOf(cap) ? quality : cap
}

const KEY = 'tku-arcade.kart.settings'
const listeners = new Set<() => void>()
let cached: RaceSettings | null = null

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

/** What was kept, or the defaults; anything odd in it falls back field by field */
export function parseSettings(stored: string | null): RaceSettings {
  if (!stored) return DEFAULT_SETTINGS
  try {
    const json = JSON.parse(stored) as Partial<Record<keyof RaceSettings, unknown>> | null
    if (!json || typeof json !== 'object') return DEFAULT_SETTINGS
    return {
      effects: EFFECTS_LEVELS.includes(json.effects as EffectsLevel)
        ? (json.effects as EffectsLevel)
        : DEFAULT_SETTINGS.effects,
      shake: flag(json.shake, DEFAULT_SETTINGS.shake),
      driverIntro: flag(json.driverIntro, DEFAULT_SETTINGS.driverIntro),
      flyby: flag(json.flyby, DEFAULT_SETTINGS.flyby),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function loadSettings(): RaceSettings {
  cached ??= parseSettings(readStored(KEY))
  return cached
}

/** Keeps them, and returns whether the browser did (false: they last until the page closes) */
export function saveSettings(next: RaceSettings): boolean {
  cached = parseSettings(JSON.stringify(next))
  const text = JSON.stringify(cached)
  writeStored(KEY, text)
  for (const listener of listeners) listener()
  return readStored(KEY) === text
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tests only: read again from storage next time */
export function forgetSettingsForTest(): void {
  cached = null
}
