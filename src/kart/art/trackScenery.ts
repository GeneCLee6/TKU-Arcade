// 2026-11-21 (docs/ARCHITECTURE.md §4.52): a track's own scenery, each its own lazy chunk. Every
// track gets the road, the barriers, the trees, the festival and the corner boards (trackArt.ts); a
// built-in track adds its own quarter on top (the harbour's sea, the campus, the old street, the four
// technical tracks' landmarks, the three tracks to learn by heart). A race draws one track, so the
// others' quarters stay on the server. `loadTrackScenery` fetches what a track needs, and trackArt.ts
// reads it back with `loadedScenery`, so that building the scene itself stays synchronous.
//
// No three.js here at runtime: this module is light, and may be imported by a page that has not
// fetched the engine yet (the loading screen, the waiting room's prefetch).
import type { Track } from '../../../shared/kart/track.ts'

type HarbourArt = typeof import('./harbourArt.ts')
type TamkangArt = typeof import('./tamkangArt.ts')
type OldStreetArt = typeof import('./oldStreetArt.ts')
type WorksArt = typeof import('./worksArt.ts')
type WharfArt = typeof import('./wharfArt.ts')
type LanesArt = typeof import('./lanesArt.ts')
type SkillWalls = typeof import('./skillWalls.ts')
type SkillCues = typeof import('./skillCues.ts')
type LocalPlan = typeof import('./localPlan.ts')
type LocalArt = typeof import('./localArt.ts')

/** What a track's own quarter is built with; a part is there only on its track */
export interface TrackScenery {
  readonly harbour?: HarbourArt
  readonly tamkang?: TamkangArt
  readonly oldStreet?: OldStreetArt
  /** The three tracks to learn by heart (wharf, lanes, works): their walls and cues */
  readonly skill?: { readonly walls: SkillWalls; readonly cues: SkillCues }
  readonly works?: WorksArt
  readonly wharf?: WharfArt
  readonly lanes?: LanesArt
  /** The four technical tracks (mangrove, fort, danhai, datun) */
  readonly local?: { readonly plan: LocalPlan; readonly art: LocalArt }
}

/** A track with nothing of its own (the test oval, Riverside, Guanyin, one from the editor) */
const NONE: TrackScenery = {}

const skill = async () => {
  const [walls, cues] = await Promise.all([import('./skillWalls.ts'), import('./skillCues.ts')])
  return { walls, cues }
}
const local = async (): Promise<TrackScenery> => {
  const [plan, art] = await Promise.all([import('./localPlan.ts'), import('./localArt.ts')])
  return { local: { plan, art } }
}

/** Each built-in track's quarter, by its id; any other id has none */
const LOADERS: Readonly<Record<string, () => Promise<TrackScenery>>> = {
  // 2026-11-22: and the cues for the step (skillCues.ts)
  harbour: async () => {
    const [harbour, kit] = await Promise.all([import('./harbourArt.ts'), skill()])
    return { harbour, skill: kit }
  },
  tamkang: async () => ({ tamkang: await import('./tamkangArt.ts') }),
  // 2026-11-22: and the cues for the step and the lantern alley's doorway (skillCues.ts)
  oldstreet: async () => {
    const [oldStreet, kit] = await Promise.all([import('./oldStreetArt.ts'), skill()])
    return { oldStreet, skill: kit }
  },
  works: async () => {
    const [works, kit] = await Promise.all([import('./worksArt.ts'), skill()])
    return { works, skill: kit }
  },
  wharf: async () => {
    const [wharf, kit] = await Promise.all([import('./wharfArt.ts'), skill()])
    return { wharf, skill: kit }
  },
  lanes: async () => {
    const [lanes, kit] = await Promise.all([import('./lanesArt.ts'), skill()])
    return { lanes, skill: kit }
  },
  mangrove: local,
  fort: local,
  danhai: local,
  datun: local,
}

/** The track ids with a quarter of their own (a test holds it to the twelve that need one) */
export const SCENERY_TRACKS: readonly string[] = Object.keys(LOADERS)

const loaded = new Map<string, TrackScenery>()
const loading = new Map<string, Promise<TrackScenery>>()

/** Whether `track` has a quarter to fetch at all */
export const hasOwnScenery = (track: Pick<Track, 'id'>): boolean => track.id in LOADERS

/**
 * Fetches `track`'s own scenery, once; a failed fetch (the network) is forgotten, so that asking
 * again tries again
 */
export function loadTrackScenery(track: Pick<Track, 'id'>): Promise<TrackScenery> {
  const done = loadedScenery(track)
  if (done) return Promise.resolve(done)
  const load = LOADERS[track.id]
  let pending = loading.get(track.id)
  if (!pending && load) {
    pending = load().then(
      (scenery) => {
        loaded.set(track.id, scenery)
        loading.delete(track.id)
        return scenery
      },
      (error: unknown) => {
        loading.delete(track.id)
        throw error
      },
    )
    loading.set(track.id, pending)
  }
  return pending ?? Promise.resolve(NONE)
}

/** `track`'s scenery if it is here: at once for a track with none of its own; null while it is not */
export function loadedScenery(track: Pick<Track, 'id'>): TrackScenery | null {
  if (!(track.id in LOADERS)) return NONE
  return loaded.get(track.id) ?? null
}
