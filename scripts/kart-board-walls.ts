// 2026-11-23 (docs/SECURITY.md §11, docs/ARCHITECTURE.md §4.94): every lawful source of a board run,
// judged by the Worker's own checkBoardRun (now with the walls, boardWalls.ts): each board track
// (the 14 and the 14 reversed), each of the four drivers (bots/drivers.ts: novice, average, expert,
// and the master on the technical line: drift jumps, the slots, the platforms, the real branches) and
// the careful autopilot, in karts and bikes taken in turn, every other run with the reset key pressed
// now and then. Prints every refusal (there should be none) and the judge's time per run.
//
//   npm run kart:board-walls -- [first] [count] [karts per driver] [turn]
//   (tracks first..first+count-1 of BOARD_TRACKS; `turn` shifts the karts, seeds and resets taken)
import { BOARD_TRACKS } from '../shared/kart/board.ts'
import { checkBoardRun } from '../shared/kart/boardCheck.ts'
import { KART_IDS, type KartId, DRIVER_IDS as LOADOUT_DRIVERS } from '../shared/kart/karts.ts'
import { readReplayFile } from '../shared/kart/replayFile.ts'
import { decodeTape } from '../shared/kart/replay.ts'
import { throughWall } from '../shared/kart/boardWalls.ts'
import { courseOf } from '../shared/kart/track.ts'
import { raceTrack } from '../shared/kart/tracks/registry.ts'
import { boardFile, driveBoardRun } from '../tests/kart/boardDrive.ts'
import { DRIVER_IDS, type DriverId } from '../src/kart/bots/drivers.ts'

const first = Number(process.argv[2] ?? 0)
const count = Number(process.argv[3] ?? BOARD_TRACKS.length)
const KARTS_PER_DRIVER = Number(process.argv[4] ?? 2)

let runs = 0
let refused = 0
let unfinished = 0
let samples = 0
let resets = 0
const times: number[] = []
const wallTimes: number[] = []
let turn = Number(process.argv[5] ?? 0)

for (const id of BOARD_TRACKS.slice(first, first + count)) {
  const track = raceTrack(id)!
  const hands: (DriverId | undefined)[] = [undefined, ...DRIVER_IDS]
  for (const driver of hands) {
    for (let k = 0; k < (driver ? KARTS_PER_DRIVER : 1); k++) {
      const kart: KartId = KART_IDS[(turn * 5 + 3) % KART_IDS.length]!
      const loadout = LOADOUT_DRIVERS[turn % LOADOUT_DRIVERS.length]!
      const presses = turn % 2 ? Array.from({ length: 30 }, (_, n) => 500 + n * 211 + (turn % 7) * 13) : []
      const seed = 11 + turn
      turn++
      const replay = driveBoardRun(track, kart, loadout, undefined, driver, seed, presses)
      if (!replay) {
        unfinished++
        console.log(`unfinished ${id} ${driver ?? 'autopilot'} ${kart}`)
        continue
      }
      const read = await readReplayFile(await boardFile(replay, track))
      if (!read.ok) throw new Error(read.problem)
      const tape = decodeTape(replay.karts[0]!.bytes)
      samples += tape.length
      resets += tape.filter((sample) => sample.reset).length
      const started = performance.now()
      const verdict = checkBoardRun(read.file, track, track.revision ?? 1)
      times.push(performance.now() - started)
      runs++
      const course = courseOf(track)
      const wallStarted = performance.now()
      throughWall(course.walls, course.terrain, tape)
      wallTimes.push(performance.now() - wallStarted)
      if (!verdict.ok) {
        refused++
        const at = verdict.at === undefined ? null : tape[verdict.at]
        const before = verdict.at ? tape[verdict.at - 1] : null
        console.log(
          `REFUSED ${id} ${driver ?? 'autopilot'} ${kart} ${verdict.why} at ${verdict.at}` +
            (at && before
              ? ` (${before.x.toFixed(2)},${before.z.toFixed(2)}${before.airborne ? ' air' : ''}) -> (${at.x.toFixed(2)},${at.z.toFixed(2)}${at.airborne ? ' air' : ''}) tick ${at.tick}`
              : ''),
        )
      }
    }
  }
}

times.sort((a, b) => a - b)
wallTimes.sort((a, b) => a - b)
const mean = times.reduce((sum, ms) => sum + ms, 0) / Math.max(1, times.length)
console.log(
  JSON.stringify({
    tracks: `${first}..${first + count - 1}`,
    runs,
    refused,
    unfinished,
    samples,
    resets,
    judgeMs: {
      mean: +mean.toFixed(2),
      median: +(times[Math.floor(times.length / 2)] ?? 0).toFixed(2),
      max: +(times[times.length - 1] ?? 0).toFixed(2),
    },
    wallMs: {
      median: +(wallTimes[Math.floor(wallTimes.length / 2)] ?? 0).toFixed(2),
      p90: +(wallTimes[Math.floor(wallTimes.length * 0.9)] ?? 0).toFixed(2),
      max: +(wallTimes[wallTimes.length - 1] ?? 0).toFixed(2),
    },
  }),
)
