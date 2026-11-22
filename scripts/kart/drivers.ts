// 2026-11-18 (docs/KART-FEEL.md §5): what `npm run kart:feel` measures, and the drivers it measures
// with (src/kart/bots/drivers.ts: a novice, an average driver and an expert, people's hands and
// mistakes on top of the computer opponents' pursuit). Reusable: a track's author runs
// `measure(track, DRIVERS.expert)` on a track of their own; scripts/kart-feel.ts does it for the
// built-in ones.
//
// The measure is the boost cover: the share of the race (GO to the finish) spent in any boost at all
// (a charge, an instant boost, a pad, a landing or the start). The owner's targets: the expert 70% or
// more, the novice 15% or less, the average 30 to 45%.
import {
  kartBoosting,
  KART_TUNING,
  type KartState,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { onPlatform, trackLedges } from '../../shared/kart/ledges.ts'
import { seconds, startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, type Track } from '../../shared/kart/track.ts'
import { createDriver, type Driver } from '../../src/kart/bots/drivers.ts'

export {
  createDriver,
  DRIVER_IDS,
  DRIVERS,
  type Driver,
  type DriverId,
  type Hands,
} from '../../src/kart/bots/drivers.ts'

export interface Measure {
  readonly finished: boolean
  /** The whole race, GO to the finish, seconds */
  readonly seconds: number
  /** The best lap, seconds (0 when no lap was finished) */
  readonly bestLap: number
  /** The share of the race spent in any boost at all, 0 to 1: the boost cover */
  readonly cover: number
  /** ... of which a charge, a pad or a landing burns (the long boost); the rest is instant boosts and the start */
  readonly charge: number
  /** Charges fired */
  readonly fired: number
  /** Instant boosts fired, and how many of them perfect, good and late */
  readonly dashes: number
  readonly perfect: number
  readonly good: number
  readonly late: number
  /** The longest combo */
  readonly combo: number
  /** Hard hits on a wall (the ones that halve the gauge and end the combo) */
  readonly crashes: number
  /** Resets (stuck, or turned round) */
  readonly resets: number
  /** Timed landings (2026-11-22, shared/kart/terrain.ts) */
  readonly timedLandings: number
  /** High platforms flown onto (2026-11-23, shared/kart/ledges.ts) */
  readonly platforms: number
}

const LAPS_CAP_SECONDS = 400

/** One driver, the track's own laps (or 400 s), measured */
export function measure(
  track: Track,
  driver: Driver,
  tuning: KartTuning = KART_TUNING,
  seed = 7,
): Measure {
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
  const drive = createDriver(driver, track, tuning, seed)
  let trial = startTrial(course)
  let racing = 0
  let boosted = 0
  let charged = 0
  let fired = 0
  let dashes = 0
  const grades = [0, 0, 0, 0]
  let combo = 0
  let crashes = 0
  const ledges = trackLedges(track)
  let platforms = 0
  let up = -1
  for (let step = 0; trial.phase !== 'finished' && step < LAPS_CAP_SECONDS * 60; step++) {
    const before: KartState = trial.run.kart
    const wasRacing = trial.phase === 'racing'
    trial = stepTrial(trial, drive(trial), course, tuning)
    const kart = trial.run.kart
    if (!wasRacing) continue
    racing++
    if (kartBoosting(kart)) boosted++
    if (kart.boostSeconds > 0 || (kart.teamSeconds ?? 0) > 0) charged++
    if (kart.storedBoosts < before.storedBoosts) fired++
    if ((kart.dashCount ?? 0) > (before.dashCount ?? 0)) {
      dashes++
      grades[kart.dashGrade ?? 0]!++
    } else if (kart.dashCount === undefined && kart.miniSeconds > before.miniSeconds) {
      // The arcade feel has no grades
      dashes++
    }
    combo = Math.max(combo, kart.chain)
    if (trial.run.hitSpeed >= tuning.wallBreakSpeed) crashes++
    if (ledges.length > 0) {
      const on = onPlatform(track, ledges, kart)
      if (on >= 0 && on !== up) platforms++
      up = on
    }
  }
  const laps = trial.laps.map(seconds)
  return {
    finished: trial.phase === 'finished',
    seconds: seconds(trial.steps),
    bestLap: laps.length > 0 ? Math.min(...laps) : 0,
    cover: racing > 0 ? boosted / racing : 0,
    charge: racing > 0 ? charged / racing : 0,
    fired,
    dashes,
    perfect: grades[3]!,
    good: grades[2]!,
    late: grades[1]!,
    combo,
    crashes,
    resets: trial.run.resets,
    timedLandings: trial.run.kart.timedLandings ?? 0,
    platforms,
  }
}
