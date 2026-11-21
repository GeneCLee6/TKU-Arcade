// 2026-11-20 (owner: "keep going"; docs/ARCHITECTURE.md §4.50): the driving school's own two
// tracks (src/kart/school/), laid corner by corner (shared/kart/tracks/lay.ts). Original and plain on purpose: wide
// (30 m), flat, no walls, corners of every kind a drift is learnt on.
//
// - the yard (700 m): a long straight, a square right, a long right, a left kink and a long right
//   back. Every corner holds a drift; a lap is about 15 s. The first six lessons and the start;
// - the test track (870 m, two laps): a right, a left, a hairpin, a fast kink, a left and two long
//   rights. The final test.
//
// Neither is a race track: they are not in RACE_TRACK_IDS, so no room can be set to them. The other
// two lessons drive the first stretch of a race track (the wharf's loading ramp, the lanes' yards).
import { parseTrack, TRACK_FORMAT, type Track, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'
import { raceTrack } from './registry.ts'

function laidTrack(
  id: string,
  name: TrackJson['name'],
  laps: number,
  steps: Parameters<typeof lay>[0],
): TrackJson {
  const laid = lay(steps, { width: 32 })
  const made = circuit({ control: laid.control, sample: LAY_SAMPLE, line: [0, 0] })
  return {
    format: TRACK_FORMAT,
    id,
    name,
    laps,
    road: made.road,
    gates: made.gates,
    respawns: made.respawns,
    grid: made.grid,
    solo: made.solo,
    walls: [],
    boostPads: [],
    itemBoxes: [],
    decor: [],
  }
}

/** The yard: as many laps as a track may have, since a lesson ends when its goal is met */
export const SCHOOL_YARD: TrackJson = laidTrack(
  'school-yard',
  { en: 'School Yard', 'zh-TW': '駕訓場' },
  20,
  [
    line(160, 32),
    right(90, 42, 30),
    line(70, 30),
    right(120, 36, 30),
    fitted(30),
    left(60, 50, 30),
    right(120, 38, 30),
    fitted(30),
    right(90, 45, 30),
  ],
)

export const SCHOOL_TEST: TrackJson = laidTrack(
  'school-test',
  { en: 'Test Track', 'zh-TW': '考驗賽道' },
  2,
  [
    line(150, 32),
    right(90, 40, 30),
    left(90, 50, 30),
    right(180, 34, 30),
    fitted(30),
    right(60, 60, 30),
    left(120, 36, 30),
    right(150, 40, 30),
    fitted(30),
    right(90, 45, 30),
  ],
)

/** Where a lesson drives: one of the school's tracks, or a race track's first stretch */
export type SchoolTrackId = 'yard' | 'test' | 'wharf' | 'lanes'

const parsed = new Map<SchoolTrackId, Track>()

function parsedTrack(json: TrackJson): Track {
  const result = parseTrack(json)
  if ('problems' in result) throw new Error(`${json.id}: ${result.problems.join('; ')}`)
  return result.track
}

/** The track, checked like any track file */
export function schoolTrack(id: SchoolTrackId): Track {
  const known = parsed.get(id)
  if (known) return known
  const track =
    id === 'yard'
      ? parsedTrack(SCHOOL_YARD)
      : id === 'test'
        ? parsedTrack(SCHOOL_TEST)
        : raceTrack(id)!
  parsed.set(id, track)
  return track
}
