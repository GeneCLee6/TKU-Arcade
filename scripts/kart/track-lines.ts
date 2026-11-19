// A design aid (2026-11-19): the four feel drivers (scripts/kart/drivers.ts, hands and all) on one
// built-in track: their times, crashes and resets over a few seeds, and where the master and the
// expert lose speed against a wall, by road point. For a track with a guide (shared/kart/tracks/
// guide.ts): whether the technical line is worth what it asks.
// Run: node --experimental-strip-types scripts/kart/track-lines.ts <id> [seeds]
import { KART_TUNING } from '../../shared/kart/physics.ts'
import {
  nearestRoadPoint,
  seconds,
  startTrial,
  stepTrial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { createDriver, DRIVER_IDS, DRIVERS } from './drivers.ts'

const [id, seedsText] = process.argv.slice(2)
const seeds = Number(seedsText ?? 3)
const track = raceTrack(id!)!
const plain = courseOf(track)
const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
for (const name of DRIVER_IDS) {
  for (let seed = 1; seed <= seeds; seed++) {
    const drive = createDriver(DRIVERS[name], track, KART_TUNING, seed * 7)
    let trial = startTrial(course)
    const hits: number[] = []
    let jumps = 0
    for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
      const before = trial.run.kart
      trial = stepTrial(trial, drive(trial), course, KART_TUNING)
      const { kart } = trial.run
      if (trial.run.hitSpeed >= KART_TUNING.wallBreakSpeed) {
        hits.push(nearestRoadPoint(track.road, kart.x, kart.z))
      }
      if ((kart.driftJumps ?? 0) > (before.driftJumps ?? 0)) jumps++
    }
    console.log(
      `${name.padEnd(8)} seed ${seed * 7} ${trial.phase === 'finished' ? 'ok ' : 'DNF'} ${seconds(trial.steps).toFixed(1).padStart(6)} s  laps ${trial.laps.map((lap) => seconds(lap).toFixed(1)).join(' ')}  resets ${trial.run.resets}  drift jumps ${jumps}  hits ${[...new Set(hits)].sort((a, b) => a - b).join(' ')}`,
    )
  }
}
