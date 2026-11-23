// A time trial driven without a screen and recorded for the leaderboard, as /kart records it
// (spikeLoop.ts): the board's tests judge real runs with it, and change them to see them refused
import { createBoardRecorder } from '../../shared/kart/boardRun.ts'
import { applyKart, loadoutByte, type DriverId, type KartId } from '../../shared/kart/karts.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { createKartTape, decodeTape, type Replay, type ReplaySample } from '../../shared/kart/replay.ts'
import { writeReplayFile } from '../../shared/kart/replayFile.ts'
import { startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, type Track } from '../../shared/kart/track.ts'
import { createAutopilot } from '../../src/kart/race/autopilot.ts'
import { createDriver, DRIVERS, type DriverId as HandsId } from '../../src/kart/bots/drivers.ts'

export function driveBoardRun(
  track: Track,
  kart: KartId = 'tide',
  driver: DriverId = 'spade',
  most = 60 * 60 * 8,
  /** A driver's hands (bots/drivers.ts) instead of the careful autopilot */
  hands?: HandsId,
  seed = 7,
  /** Presses the reset key on these steps (a player putting the kart back on the road) */
  resets: readonly number[] = [],
): Replay | null {
  const tuning = applyKart(KART_TUNING, kart)
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
  const pilot = hands ? createDriver(DRIVERS[hands], track, tuning, seed) : createAutopilot(track, tuning)
  const recorder = createBoardRecorder(track.id, track.laps, loadoutByte(kart, driver))
  let trial = startTrial(course)
  for (let step = 0; step < most && trial.phase !== 'finished'; step++) {
    const driven = pilot(trial)
    const input = resets.includes(step) ? { ...driven, reset: true } : driven
    const before = trial.run.resets
    trial = stepTrial(trial, input, course, tuning)
    recorder.step(trial, input, trial.run.resets !== before)
  }
  return recorder.finish(trial)
}

/** The replay with its kart's samples changed by `change` (a tampered upload) and coded again */
export function retape(
  replay: Replay,
  change: (sample: ReplaySample, index: number) => ReplaySample | null,
): Replay {
  const tape = createKartTape()
  decodeTape(replay.karts[0]!.bytes).forEach((sample, index) => {
    const changed = change(sample, index)
    if (changed) tape.add({ ...changed, seq: 0 })
  })
  return { ...replay, karts: [{ seat: 0, bytes: tape.bytes() }] }
}

/** The replay as the file a browser uploads */
export const boardFile = (replay: Replay, track: Track, name = 'Ann'): Promise<Uint8Array> =>
  writeReplayFile(replay, {
    revision: track.revision ?? 1,
    names: [{ seat: 0, name }],
    you: 0,
    savedAt: 1,
  })
