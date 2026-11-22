// 2026-11-20 (docs/ARCHITECTURE.md §4.46): the kart's volumes, music and sound effects (2026-11-22,
// §4.72: and the ambience), each 0 to 1, kept in this browser (lib/storage.ts never throws: blocked
// storage keeps them for the page). The site's own sound switch (lib/sound.ts) still silences them
// all; these only set how loud each is.
import { readStored, writeStored } from '../../lib/storage.ts'

export interface KartVolumes {
  /** The soundtrack, 0 to 1 */
  readonly music: number
  /** The engine, the tyres, the items, 0 to 1 */
  readonly effects: number
  /** 2026-11-22: the world around the track (ambience.ts), its own volume, 0 to 1 */
  readonly ambience: number
}

export const DEFAULT_VOLUMES: KartVolumes = { music: 0.7, effects: 1, ambience: 0.8 }

const KEY = 'tku-arcade.kart.volumes'
const listeners = new Set<() => void>()
let cached: KartVolumes | null = null

const clamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback

/** What was kept, or the defaults; anything odd in it falls back field by field */
export function parseVolumes(stored: string | null): KartVolumes {
  if (!stored) return DEFAULT_VOLUMES
  try {
    const json = JSON.parse(stored) as Partial<Record<keyof KartVolumes, unknown>> | null
    if (!json || typeof json !== 'object') return DEFAULT_VOLUMES
    return {
      music: clamp(json.music, DEFAULT_VOLUMES.music),
      effects: clamp(json.effects, DEFAULT_VOLUMES.effects),
      ambience: clamp(json.ambience, DEFAULT_VOLUMES.ambience),
    }
  } catch {
    return DEFAULT_VOLUMES
  }
}

export function loadVolumes(): KartVolumes {
  cached ??= parseVolumes(readStored(KEY))
  return cached
}

/** Keeps them, and returns whether the browser did (false: they last until the page closes) */
export function saveVolumes(next: KartVolumes): boolean {
  cached = {
    music: clamp(next.music, 0),
    effects: clamp(next.effects, 0),
    ambience: clamp(next.ambience, DEFAULT_VOLUMES.ambience),
  }
  writeStored(KEY, JSON.stringify(cached))
  for (const listener of listeners) listener()
  return readStored(KEY) === JSON.stringify(cached)
}

export function subscribeVolumes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tests only: read again from storage next time */
export function forgetVolumesForTest(): void {
  cached = null
}
