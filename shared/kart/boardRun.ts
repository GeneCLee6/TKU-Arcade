// A time trial recorded for the leaderboard (2026-11-23, board.ts), and a board's replay turned back
// into a ghost to chase. The recorder keeps the kart as a race room's replay does (replay.ts's tape:
// a tenth of a second a sample, with its speed, its gates and its kart), so that the Worker can judge
// every sample as the room judges a frame (boardCheck.ts) and anyone can watch it on /kart/replay.
// Pure: spikeLoop.ts records with it, the tests drive it without a screen.
import { GHOST_STEPS, type Ghost } from './ghost.ts'
import { loadoutOfByte, type DriverId, type KartId } from './karts.ts'
import { kartBoosting, kartSkidding, kartSlip, type KartInput } from './physics.ts'
import { createKartTape, decodeTape, sampleAt, TICKS_PER_SECOND, type KartTape, type Replay } from './replay.ts'
import type { Trial } from './timeTrial.ts'

/** Steps (ticks) to ms, rounded */
export const stepsToMs = (steps: number): number => Math.round((steps * 1000) / TICKS_PER_SECOND)

export interface BoardRecorder {
  /** After every step of the race from GO on (the step's trial, the input, whether it reset the kart) */
  step(trial: Trial, input: KartInput, reset: boolean): void
  /** At the finish: the replay, or null if the run was not recorded from its start */
  finish(trial: Trial): Replay | null
}

/** A recorder for a time trial on `track` in the kart of loadout byte `body` (karts.ts loadoutByte) */
export function createBoardRecorder(track: string, laps: number, body: number): BoardRecorder {
  let tape: KartTape | null = null
  let fromStart = false
  let done = false
  return {
    step(trial, input, reset) {
      if (trial.phase === 'countdown' || done) return
      if (!tape) {
        tape = createKartTape()
        // The step that says GO is tick 0, the kart still on the grid: a run recorded from its start
        fromStart = trial.steps === 0
      }
      // The finish is the tape's last sample: the roll to a stop after it is no part of the run
      if (trial.phase === 'finished') done = true
      const kart = trial.run.kart
      tape.add({
        tick: trial.steps,
        x: kart.x,
        z: kart.z,
        heading: kart.heading,
        vx: kart.vx,
        vz: kart.vz,
        reset,
        drifting: kart.drifting,
        boosting: kartBoosting(kart),
        skidding: kartSkidding(kart),
        finished: trial.phase === 'finished',
        driftDirection:
          kart.driftDirection || (kartSkidding(kart) ? (-Math.sign(kartSlip(kart)) as -1 | 0 | 1) : 0),
        steer: input.steer,
        body,
        crossings: trial.run.crossings,
        nextGate: trial.run.nextGate,
        seq: 0,
        ...((kart.air ?? 0) > 0 ? { airborne: true } : {}),
      })
    },
    finish(trial) {
      if (!tape || !fromStart || trial.phase !== 'finished' || trial.laps.length !== laps) return null
      return {
        track,
        laps,
        mode: 'race',
        racers: [
          {
            seat: 0,
            lapMs: trial.laps.map(stepsToMs),
            finishMs: stepsToMs(trial.steps),
            out: false,
          },
        ],
        karts: [{ seat: 0, bytes: tape.bytes() }],
        events: [],
        held: [],
        airborne: true,
      }
    },
  }
}

/** The kart and driver a board replay was driven by: its first sample's */
export function replayLoadout(replay: Replay): { kart: KartId; driver: DriverId } | null {
  const bytes = replay.karts[0]?.bytes
  const first = bytes ? decodeTape(bytes)[0] : undefined
  return first ? loadoutOfByte(first.body) : null
}

/**
 * A board's replay as a ghost for the time trial (ghost.ts): a sample every GHOST_STEPS from GO to
 * the finish, read off the replay's tape, with its flights. `key` is the track's record key
 * (track.ts recordKey). Null for a replay that is not one kart's finished run
 */
export function ghostFromReplay(replay: Replay, key: string): Ghost | null {
  const racer = replay.racers[0]
  const bytes = replay.karts[0]?.bytes
  if (!racer || racer.finishMs === null || !bytes || replay.racers.length !== 1) return null
  const samples = decodeTape(bytes)
  if (samples.length === 0) return null
  const total = Math.round((racer.finishMs * TICKS_PER_SECOND) / 1000)
  const out: number[] = []
  const air: number[] = []
  for (let tick = 0, index = 0; tick <= total; tick += GHOST_STEPS, index++) {
    const at = sampleAt(samples, tick)!
    if ((at.airborne === true) !== (air.length % 2 === 1)) air.push(index)
    out.push(
      Math.round(at.x * 100) / 100 + 0,
      Math.round(at.z * 100) / 100 + 0,
      Math.round(at.heading * 1000) / 1000 + 0,
    )
  }
  const kart = loadoutOfByte(samples[0]!.body).kart
  return {
    track: key,
    format: 1,
    total,
    laps: racer.lapMs.map((ms) => Math.max(1, Math.round((ms * TICKS_PER_SECOND) / 1000))),
    samples: out,
    kart,
    ...(replay.airborne ? { air } : {}),
  }
}
