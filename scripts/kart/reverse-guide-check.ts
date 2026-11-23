// 2026-11-23 (shared/kart/tracks/reverseGuides.ts): every guide's technical and safe lines against
// the walls, the original's and the reversed track's, and the slots carried over.
//   node --experimental-strip-types scripts/kart/reverse-guide-check.ts [ids]
import { routeRoad } from '../../shared/kart/branches.ts'
import { routeGuide, trackGuide } from '../../shared/kart/tracks/guides.ts'
import { ALL_RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { crossedWalls } from '../../shared/kart/tracks/reverseGuides.ts'

const asked = process.argv[2]?.split(',')
for (const id of asked ?? ALL_RACE_TRACK_IDS) {
  const track = raceTrack(id)!
  const main = trackGuide(id)
  const route = routeGuide(id)
  if (!main && !route) continue
  const show = (name: string, road: typeof track.road, guide: NonNullable<typeof main>) => {
    const list = (line: readonly number[]) =>
      crossedWalls(road, line, track.walls)
        .map((hit) => `${hit.index}${hit.top === undefined ? '' : `^${hit.top.toFixed(1)}`}`)
        .join(' ')
    console.log(
      `${id.padEnd(16)}${name.padEnd(6)} n=${road.length} cues=${guide.cues.map((cue) => cue.lip).join(',')} slots=${guide.slots.map((slot) => `${slot.index.toFixed(1)}@${slot.across.toFixed(1)}`).join(' ')}`,
    )
    if (!guide.cuesOnly) console.log(`    tech crosses: ${list(guide.tech) || '-'}\n    safe crosses: ${list(guide.safe) || '-'}`)
  }
  if (main) show('main', track.road, main)
  if (route) show('route', routeRoad(track, (track.forks ?? []).map((_, k) => k)).road, route)
}
