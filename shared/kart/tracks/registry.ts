// Every track a race can be run on, by id (list.ts has the ids alone, for the first load). The
// Worker judges laps on these (shared/games/kart/rules.ts) and the race screen draws them, so both
// sides always agree on the gates.
import { parseTrack, type Track, type TrackJson } from '../track.ts'
import { HARBOUR } from './harbour.ts'
import { OLDSTREET } from './oldstreet.ts'
import type { RaceTrackId } from './list.ts'
import { RIVERSIDE } from './riverside.ts'
import { TAMKANG } from './tamkang.ts'

export const RACE_TRACKS: Readonly<Record<RaceTrackId, TrackJson>> = {
  riverside: RIVERSIDE,
  harbour: HARBOUR,
  tamkang: TAMKANG,
  oldstreet: OLDSTREET,
}

const parsed = new Map<string, Track>()

/** The track with this id, checked; null for an id that is not one (ids come off the network) */
export function raceTrack(id: string): Track | null {
  if (!Object.hasOwn(RACE_TRACKS, id)) return null
  const known = parsed.get(id)
  if (known) return known
  const result = parseTrack(RACE_TRACKS[id as RaceTrackId])
  if ('problems' in result) throw new Error(`${id}: ${result.problems.join('; ')}`)
  parsed.set(id, result.track)
  return result.track
}
