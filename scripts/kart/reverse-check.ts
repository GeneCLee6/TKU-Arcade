// How each built-in race track reverses (docs/ARCHITECTURE.md §4.90): whether the reversed track
// passes the track check, and what was done to its jumps and branches. `npm run kart:reverse`
import { parseTrack } from '../../shared/kart/track.ts'
import { RACE_TRACKS } from '../../shared/kart/tracks/registry.ts'
import { reverseTrack } from '../../shared/kart/tracks/reverse.ts'

for (const [id, json] of Object.entries(RACE_TRACKS)) {
  const { track, notes } = reverseTrack(json)
  const parsed = parseTrack(track)
  const verdict = 'problems' in parsed ? `FAIL ${parsed.problems.slice(0, 4).join(' | ')}` : 'ok'
  console.log(
    `${id.padEnd(11)} lips ${(json.jumps ?? []).length}->${notes.jumpsTurned} (out ${notes.jumpsRemoved})` +
      ` branches kept ${notes.branchesKept} closed ${notes.branchesClosed} fences-${notes.fencesOpened}` +
      ` pads-${notes.padsDropped} boxes-${notes.boxesDropped} obstacles ${(json.obstacles ?? []).length}  ${verdict}`,
  )
}
