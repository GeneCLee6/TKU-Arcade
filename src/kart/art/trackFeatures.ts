// 2026-11-23 (docs/KART-PERF.md §11, docs/ARCHITECTURE.md §4.78): the art of what only some tracks
// have, each its own lazy chunk, like a track's own quarter (trackScenery.ts): the branches' roads
// (forkArt.ts), the high platforms on them (ledgeArt.ts), a road over a road (crossingArt.ts), the
// moving obstacles (obstacleArt.ts) and the light at night (nightLights.ts), together in one lazy
// chunk (trackParts.ts). They used to come with the engine whatever the track; Riverside has none. A built-in track and an editor's alike
// say what they have by their own data, so the parts are worked out from the track itself, not its
// id: `loadTrackFeatures` fetches what `track` needs, and the scene reads them back with
// `loadedFeatures`, so that building it stays synchronous.
//
// What a track needs is worked out cheaply and on the generous side (a part fetched and not used
// costs a few kB; one used and not fetched would leave a hole in the track): no three.js and no
// physics here, so that the loading screen and a waiting room's prefetch can ask.
import type { Track } from '../../../shared/kart/track.ts'
import { themeNameOf } from './themeName.ts'

type ForkArt = typeof import('./forkArt.ts')
type LedgeArt = typeof import('./ledgeArt.ts')
type CrossingArt = typeof import('./crossingArt.ts')
type ObstacleArt = typeof import('./obstacleArt.ts')
type NightLights = typeof import('./nightLights.ts')

/** The parts a track's scene is built with; each is there when the track has it */
export interface TrackFeatures {
  readonly forks?: ForkArt
  readonly ledges?: LedgeArt
  readonly crossings?: CrossingArt
  readonly obstacles?: ObstacleArt
  readonly night?: NightLights
}

export type FeatureName = keyof TrackFeatures

/** What of a track this module reads; a track known only by its id needs nothing it can tell */
export type FeatureSource = Pick<Track, 'id'> &
  Partial<Pick<Track, 'theme' | 'road' | 'forks' | 'branches' | 'crossings' | 'obstacles'>>

/** The parts `track` needs, by its data (see above): more rather than fewer */
export function featuresOf(track: FeatureSource): FeatureName[] {
  const names: FeatureName[] = []
  const branched = (track.forks?.length ?? 0) > 0 || (track.branches?.length ?? 0) > 0
  // A platform stands on a branch (shared/kart/ledges.ts)
  if (branched) names.push('forks', 'ledges')
  // A checked track has its crossings worked out (shared/kart/levels.ts, track.ts's `courseOf`)
  if ((track.crossings?.length ?? 0) > 0) names.push('crossings')
  if ((track.obstacles?.length ?? 0) > 0) names.push('obstacles')
  if (themeNameOf(track) === 'night') names.push('night')
  return names
}

/** The parts, once fetched: all of them come together (trackParts.ts) */
let parts: typeof import('./trackParts.ts') | null = null
let pending: Promise<unknown> | null = null

function loadParts(): Promise<unknown> {
  if (parts) return Promise.resolve(parts)
  pending ??= import('./trackParts.ts').then(
    (done) => {
      parts = done
      pending = null
      return done
    },
    (error: unknown) => {
      pending = null
      throw error
    },
  )
  return pending
}

/** `track`'s parts if they are all here (at once for a track with none); null while any is not */
export function loadedFeatures(track: FeatureSource): TrackFeatures | null {
  const names = featuresOf(track)
  if (names.length === 0) return {}
  if (!parts) return null
  const out: { -readonly [name in FeatureName]?: unknown } = {}
  for (const name of names) out[name] = parts[name]
  return out as TrackFeatures
}

/**
 * Fetches the parts `track` needs, once; a failed fetch is forgotten, so that asking again
 * tries again
 */
export async function loadTrackFeatures(track: FeatureSource): Promise<TrackFeatures> {
  if (featuresOf(track).length > 0) await loadParts()
  return loadedFeatures(track)!
}
