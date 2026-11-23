// What /kart and /kart/spike drive on (spikeLoop.ts), apart from the engine (2026-11-21, docs/ARCHITECTURE.md
// §4.52): the menu names them and finds a course's track before three.js is here
import { parseTrack, type Track } from '../../shared/kart/track.ts'
import { DANHAI } from '../../shared/kart/tracks/danhai.ts'
import { DATUN } from '../../shared/kart/tracks/datun.ts'
import { FORT } from '../../shared/kart/tracks/fort.ts'
import { GUANYIN } from '../../shared/kart/tracks/guanyin.ts'
import { HARBOUR } from '../../shared/kart/tracks/harbour.ts'
import { LANES } from '../../shared/kart/tracks/lanes.ts'
import { MANGROVE } from '../../shared/kart/tracks/mangrove.ts'
import { OLDSTREET } from '../../shared/kart/tracks/oldstreet.ts'
import { RIVERSIDE } from '../../shared/kart/tracks/riverside.ts'
import { TAMKANG } from '../../shared/kart/tracks/tamkang.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import { WHARF } from '../../shared/kart/tracks/wharf.ts'
import { WORKS } from '../../shared/kart/tracks/works.ts'
import { ZHUWEI } from '../../shared/kart/tracks/zhuwei.ts'
import { BREAKWATER } from '../../shared/kart/tracks/breakwater.ts'
import { REVERSE_TRACK_IDS, type ReverseTrackId } from '../../shared/kart/tracks/list.ts'
import { forwardId, reverseTrack } from '../../shared/kart/tracks/reverse.ts'

/**
 * What /kart/spike drives on: the walled yard of J3, J4's test oval, J5's first track, N1's second or
 * the Tamkang campus (2026-11-14), or N2's item track, the old street
 */
export type SpikeCourse =
  | 'arena'
  | 'oval'
  | 'riverside'
  | 'harbour'
  | 'tamkang'
  | 'oldstreet'
  // 2026-11-17: slopes and jumps (shared/kart/terrain.ts)
  | 'guanyin'
  // 2026-11-18: four more, each made to tell drivers apart (docs/KART-FEEL.md §10.1)
  | 'mangrove'
  | 'fort'
  | 'danhai'
  | 'datun'
  // 2026-11-19: two to learn by heart (docs/KART-FEEL.md §11)
  | 'wharf'
  | 'lanes'
  // 2026-11-20: the first with real branches (shared/kart/branches.ts)
  | 'works'
  // 2026-11-22: the technical showcase, over and under itself (shared/kart/levels.ts)
  | 'zhuwei'
  // 2026-11-23: the high-platform track (shared/kart/ledges.ts)
  | 'breakwater'
  // 2026-11-23 (#131): every track driven the other way round (shared/kart/tracks/reverse.ts)
  | ReverseTrackId

export const SPIKE_COURSES: readonly SpikeCourse[] = [
  'arena',
  'oval',
  'riverside',
  'harbour',
  'tamkang',
  'oldstreet',
  'guanyin',
  'mangrove',
  'fort',
  'danhai',
  'datun',
  'wharf',
  'lanes',
  'works',
  'zhuwei',
  'breakwater',
  ...REVERSE_TRACK_IDS,
]

const TRACKS = {
  oval: TEST_OVAL,
  riverside: RIVERSIDE,
  harbour: HARBOUR,
  tamkang: TAMKANG,
  oldstreet: OLDSTREET,
  guanyin: GUANYIN,
  mangrove: MANGROVE,
  fort: FORT,
  danhai: DANHAI,
  datun: DATUN,
  wharf: WHARF,
  lanes: LANES,
  works: WORKS,
  zhuwei: ZHUWEI,
  breakwater: BREAKWATER,
} as const

/** A course's track, checked like any track file; null for the yard, which is not a track */
export function spikeTrack(course: SpikeCourse): Track | null {
  if (course === 'arena') return null
  const parsed = parseTrack(
    (REVERSE_TRACK_IDS as readonly string[]).includes(course)
      ? reverseTrack(TRACKS[forwardId(course) as keyof typeof TRACKS]).track
      : TRACKS[course as keyof typeof TRACKS],
  )
  if ('problems' in parsed) throw new Error(`${course}: ${parsed.problems.join('; ')}`)
  return parsed.track
}
