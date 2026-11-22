// A design aid (2026-11-23): a built-in track's high platforms (shared/kart/ledges.ts): what parseTrack
// says of the track, and for each platform the lip, the face, the least speed off the lip that
// clears it, and how much shorter the platform's way is than the main road's between the same two
// points. Run: node --experimental-strip-types scripts/kart/ledge-check.ts <id>
import { trackLedges } from '../../shared/kart/ledges.ts'
import { parseTrack } from '../../shared/kart/track.ts'
import { RACE_TRACKS } from '../../shared/kart/tracks/registry.ts'
import { challengeTrack, isChallengeTrackId } from '../../shared/kart/tracks/challenge.ts'
import type { RoadPoint } from '../../shared/kart/track.ts'

const [id] = process.argv.slice(2)
const parsed = isChallengeTrackId(id)
  ? { track: challengeTrack(id) }
  : parseTrack(RACE_TRACKS[id as keyof typeof RACE_TRACKS])
if ('problems' in parsed) {
  console.log(parsed.problems.join('\n'))
  process.exit(1)
}
const { track } = parsed
const length = (points: readonly RoadPoint[]) =>
  points.slice(1).reduce((sum, b, index) => sum + Math.hypot(b.x - points[index]!.x, b.z - points[index]!.z), 0)
const lap = length([...track.road, track.road[0]!])
console.log(`${id}: lap ${lap.toFixed(0)} m`)
for (const ledge of trackLedges(track)) {
  const fork = track.forks![ledge.fork]!
  const main = length(track.road.slice(fork.from, fork.to + 1))
  const own = length(fork.path)
  console.log(
    `  platform ${ledge.fork}: lip road[${fork.from}] ${ledge.lip.y.toFixed(1)} m, face ${ledge.reach.toFixed(1)} m on at ${(Math.acos(Math.min(1, ledge.cos)) * 180 / Math.PI).toFixed(0)}°, top ${ledge.top.toFixed(1)} m (${(ledge.top - ledge.lip.y).toFixed(1)} over the lip): needs ${ledge.need.toFixed(1)} m/s (${(ledge.need * 3.6).toFixed(0)} km/h)`,
  )
  console.log(
    `    main road ${main.toFixed(0)} m, platform ${own.toFixed(0)} m: ${(main - own).toFixed(0)} m shorter (${(((main - own) / lap) * 100).toFixed(1)}% of a lap)`,
  )
}
