// 2026-11-21 (docs/ARCHITECTURE.md §4.52): what a kart screen fetches before its scene can be built,
// and how far along it is. The engine (three.js, the scene, the loop: one chunk) and, alongside it, the
// track's own scenery (trackScenery.ts), the families of the vehicles in the race (bodyLoad.ts) and the
// track's song (songs.ts). Once all of it is here, building the scene is as synchronous as it ever
// was: the loop's `startSpikeLoop` and the watch's `startWatchLoop` are called only then, so that a
// room's "drawn and on the grid" (`loaded`, docs/KART-NETCODE.md §3) still means what it says.
//
// Light on purpose: no three.js, so that a page shows its loading screen (KartLoading.tsx) at once and
// a waiting room can fetch the next race in the background (`prefetchKart`).
import type { KartId } from '../../../shared/kart/karts.ts'
import type { Track } from '../../../shared/kart/track.ts'
import { bodiesLoaded, familiesOf, familyLoaded, loadBodyFamily } from '../art/bodyLoad.ts'
import { loadedScenery, loadTrackScenery } from '../art/trackScenery.ts'
import { loadedFeatures, loadTrackFeatures, type FeatureSource } from '../art/trackFeatures.ts'
import { loadedSong, loadSong, songFor } from '../audio/songs.ts'

/** A chunk that is fetched once and kept; a failed fetch is forgotten, so that asking again tries again */
export interface EngineSlot<E> {
  load(): Promise<E>
  /** The engine if it is here */
  peek(): E | null
}

function engineSlot<E>(fetch: () => Promise<E>): EngineSlot<E> {
  let engine: E | null = null
  let pending: Promise<E> | null = null
  return {
    load() {
      if (engine) return Promise.resolve(engine)
      pending ??= fetch().then(
        (done) => {
          engine = done
          pending = null
          return done
        },
        (error: unknown) => {
          pending = null
          throw error
        },
      )
      return pending
    },
    peek: () => engine,
  }
}

/** The race's loop (a time trial, a race against the computer or in a room, the school) */
export const RACE_ENGINE = engineSlot(() => import('../spikeLoop.ts'))
/** Watching a race, live or replayed */
export const WATCH_ENGINE = engineSlot(() => import('../watch/watchLoop.ts'))
/** The scene alone (the editor's 3D view) */
export const SCENE_ENGINE = engineSlot(() => import('../Scene.ts'))

export interface KartLoadPlan<E> {
  readonly engine: EngineSlot<E>
  /**
   * The track to draw; null for the test yard. 2026-11-23: given whole, the parts of what it has
   * (trackFeatures.ts) come too; known by its id alone (a prefetch), only its own quarter
   */
  readonly track: (FeatureSource & Pick<Track, 'id' | 'theme'>) | null
  /** The vehicles that will be on it, as far as they are known (any other is fetched when it shows) */
  readonly bodies?: readonly KartId[]
  /** Whether its song plays (a race; not the editor's view) */
  readonly music?: boolean
}

export interface LoadProgress {
  /** Of `total`, weighed roughly by size: the engine counts most */
  readonly done: number
  readonly total: number
}

const ENGINE_WEIGHT = 8
const SCENERY_WEIGHT = 2
const FAMILY_WEIGHT = 1
const SONG_WEIGHT = 1
const FEATURE_WEIGHT = 1

/** The engine, if the whole plan is here already (nothing to wait for, no loading screen) */
export function peekKartLoad<E>(plan: KartLoadPlan<E>): E | null {
  const engine = plan.engine.peek()
  if (!engine) return null
  if (plan.track && !loadedScenery(plan.track)) return null
  if (plan.track && !loadedFeatures(plan.track)) return null
  if (plan.bodies && !bodiesLoaded(plan.bodies)) return null
  if (plan.music && !loadedSong(songFor(plan.track))) return null
  return engine
}

/** The parts of `plan` to fetch, each with its weight */
function partsOf<E>(plan: KartLoadPlan<E>): { weight: number; load: () => Promise<unknown> }[] {
  const parts: { weight: number; load: () => Promise<unknown> }[] = []
  if (!plan.engine.peek()) parts.push({ weight: ENGINE_WEIGHT, load: () => plan.engine.load() })
  const track = plan.track
  if (track && !loadedScenery(track)) {
    parts.push({ weight: SCENERY_WEIGHT, load: () => loadTrackScenery(track) })
  }
  if (track && !loadedFeatures(track)) {
    parts.push({ weight: FEATURE_WEIGHT, load: () => loadTrackFeatures(track) })
  }
  for (const family of familiesOf(plan.bodies ?? [])) {
    if (!familyLoaded(family))
      parts.push({ weight: FAMILY_WEIGHT, load: () => loadBodyFamily(family) })
  }
  const song = songFor(track)
  if (plan.music && !loadedSong(song))
    parts.push({ weight: SONG_WEIGHT, load: () => loadSong(song) })
  return parts
}

/**
 * Fetches everything `plan` needs, all at once, telling `onProgress` as each part comes; resolves to
 * the engine. Rejects if any part could not be fetched (the network): calling it again fetches only
 * what is still missing
 */
export async function loadKart<E>(
  plan: KartLoadPlan<E>,
  onProgress?: (progress: LoadProgress) => void,
): Promise<E> {
  const parts = partsOf(plan)
  const total = parts.reduce((sum, part) => sum + part.weight, 0)
  let done = 0
  onProgress?.({ done, total })
  await Promise.all(
    parts.map((part) =>
      part.load().then(() => {
        done += part.weight
        onProgress?.({ done, total })
      }),
    ),
  )
  return plan.engine.load()
}

/**
 * Fetches `plan` in the background, when the browser is idle (the waiting room once a track is
 * picked, the Grand Prix's card before its next race). A failure is left for the loading screen
 */
export function prefetchKart<E>(plan: KartLoadPlan<E>): void {
  if (peekKartLoad(plan)) return
  const start = () => void loadKart(plan).catch(() => {})
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 2000 })
  } else {
    setTimeout(start, 200)
  }
}
