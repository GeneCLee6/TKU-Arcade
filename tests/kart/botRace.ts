// A race of real drivers for the broadcast's foresight tests (2026-11-23): each seat driven by the
// physics and a driver's hands (bots/drivers.ts) from its own grid spot, some late off the line, and
// recorded as a room records it (replay.ts's tape: a sample every six steps, with headings, speeds
// and lines that are a real kart's). The karts do not touch (each drives its own course), but they
// take their own lines through the bends, so that the passes happen as passes do: on the straights
// for speed, and on the inside of the bends.
import { kartBoosting, kartSkidding, KART_TUNING, NO_INPUT } from '../../shared/kart/physics.ts'
import { gridSpot } from '../../shared/kart/race.ts'
import { createKartTape, type Replay } from '../../shared/kart/replay.ts'
import { applyKart, loadoutByte, type KartId } from '../../shared/kart/karts.ts'
import { startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, type Track } from '../../shared/kart/track.ts'
import { createDriver, DRIVERS, type DriverId } from '../../src/kart/bots/drivers.ts'

export interface BotRacer {
  readonly driver: DriverId
  readonly kart: KartId
  /** Seconds it waits after GO before it moves */
  readonly late?: number
  readonly seed?: number
}

/** The race on `track`, `laps` laps, one seat a racer, each run two seconds past its finish */
export function recordBotRace(track: Track, laps: number, racers: readonly BotRacer[]): Replay {
  const plain = courseOf(track)
  const karts: { seat: number; bytes: Uint8Array }[] = []
  const standings = racers.map((racer, seat) => {
    const tuning = applyKart(KART_TUNING, racer.kart)
    const course: TrialCourse = {
      ...plain,
      start: gridSpot(track, seat),
      checkpoints: { ...plain.checkpoints!, laps },
      road: track.road,
    }
    const pilot = createDriver(DRIVERS[racer.driver], track, tuning, racer.seed ?? 5 + seat)
    const tape = createKartTape()
    const body = loadoutByte(racer.kart, 'spade')
    let trial = startTrial(course)
    let finishedAt: number | null = null
    const lateSteps = Math.round((racer.late ?? 0) * 60)
    for (let step = 0; step < 60 * 60 * 6; step++) {
      const input = trial.phase === 'racing' && trial.steps < lateSteps ? NO_INPUT : pilot(trial)
      const resets = trial.run.resets
      trial = stepTrial(trial, input, course, tuning)
      if (trial.phase === 'countdown') continue
      if (finishedAt === null && trial.phase === 'finished') finishedAt = trial.steps
      const kart = trial.run.kart
      tape.add({
        tick: trial.steps,
        x: kart.x,
        z: kart.z,
        heading: kart.heading,
        vx: kart.vx,
        vz: kart.vz,
        reset: trial.run.resets !== resets,
        drifting: kart.drifting,
        boosting: kartBoosting(kart),
        skidding: kartSkidding(kart),
        finished: finishedAt !== null,
        driftDirection: kart.driftDirection,
        steer: input.steer,
        body,
        crossings: trial.run.crossings,
        nextGate: trial.run.nextGate,
        seq: 0,
        ...((kart.air ?? 0) > 0 ? { airborne: true } : {}),
      })
      if (finishedAt !== null && trial.steps - finishedAt >= 120) break
    }
    karts.push({ seat, bytes: tape.bytes() })
    return {
      seat,
      lapMs: trial.laps.map((steps) => Math.round((steps * 1000) / 60)),
      finishMs: finishedAt === null ? null : Math.round((finishedAt * 1000) / 60),
      out: false,
    }
  })
  return { track: track.id, laps, mode: 'race', racers: standings, karts, events: [], held: [], airborne: true }
}
