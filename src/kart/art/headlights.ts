// 2026-11-20 (docs/ARCHITECTURE.md §4.47), on its own since 2026-11-23: how the headlights light the
// road by the quality. The scene asks on every track; the lights themselves (nightLights.ts) come
// only with a night track's parts (trackFeatures.ts)
import type { Quality } from '../quality.ts'

export type HeadlightLevel = 'spot' | 'pool' | 'off'

/** High: a real light on the own kart; medium (or a processor drawing high): the pools; low: none */
export function headlightLevel(quality: Quality, software: boolean): HeadlightLevel {
  if (quality === 'low') return 'off'
  return quality === 'high' && !software ? 'spot' : 'pool'
}
