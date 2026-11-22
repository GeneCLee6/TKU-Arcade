// The Worker's judgement of a run uploaded to the leaderboard (2026-11-23, board.ts; docs/SECURITY.md
// §11, docs/KART-NETCODE.md §11.5). The replay file has already been read strictly (replayFile.ts:
// sizes limited, every field checked); here the run itself is judged, sample by sample, by the very
// function a race room judges a live kart's frames with (race.ts judgeFrame): its kart's own speed
// cap, no jump further than that speed allows, a reset only onto a respawn point, never through a
// moving obstacle, and the gates counted by the server in order. On top of what a room checks:
//
//   - one kart alone, the track's own laps, no items: the time trial's shape and nothing else
//   - the samples a tenth of a second apart at most, from the grid at GO to the finish, in one kart
//   - the gates counted by the server alone (a room believes a kart's own count near a gate it may
//     have missed; a replay misses nothing, so only a reset's count is believed)
//   - the laps the judge counted are the laps the file claims, each finish within a sample of it
//   - the total is the last sample's tick, and the laps add up to it
//
// What it cannot tell is who drove (docs/SECURITY.md §11): a script driving a real browser within
// the physics' limits makes a run that is judged believable. Pure: the Worker and the tests run it.
import type { ReplayFile } from './replayFile.ts'
import { decodeTape, TICKS_PER_SECOND, type ReplaySample } from './replay.ts'
import { judgeFrame, lapsDone, speedCapFor, startTracking } from './race.ts'
import { loadoutOfByte, type DriverId, type KartId } from './karts.ts'
import { courseOf, type Track } from './track.ts'
import type { KartFrame } from './net.ts'
import type { BoardRefusal } from './board.ts'

/** The most samples a run may have: 15 minutes at ten a second, with room for resets */
export const BOARD_MAX_SAMPLES = 12_000
/** A sample at least every this many ticks (the recorder keeps one every 6) */
export const BOARD_MAX_GAP_TICKS = 6
/** A judged lap may end this much before or after the file says, ms: one sample and a little */
export const BOARD_LAP_SLACK_MS = 120
/** The first sample is the grid: this close to the start, metres, and this slow, m/s */
const START_REACH = 2
const START_SPEED = 1

/** A run that passed: what the board keeps of it */
export interface BoardRun {
  readonly kart: KartId
  readonly driver: DriverId
  readonly totalMs: number
  readonly lapMs: readonly number[]
  readonly bestLapMs: number
}

export type BoardVerdict =
  | { readonly ok: true; readonly run: BoardRun }
  | { readonly ok: false; readonly why: BoardRefusal; readonly at?: number }

const refuse = (why: BoardRefusal, at?: number): BoardVerdict =>
  at === undefined ? { ok: false, why } : { ok: false, why, at }

const frameOf = (sample: ReplaySample): KartFrame => ({
  tick: sample.tick,
  x: sample.x,
  z: sample.z,
  heading: sample.heading,
  vx: sample.vx,
  vz: sample.vz,
  reset: sample.reset,
  drifting: sample.drifting,
  boosting: sample.boosting,
  skidding: sample.skidding,
  finished: sample.finished,
  driftDirection: sample.driftDirection,
  steer: sample.steer,
  body: sample.body,
  crossings: sample.crossings,
  nextGate: sample.nextGate,
  seq: 0,
  ...(sample.airborne ? { airborne: true } : {}),
})

/**
 * Whether `file` is a believable time trial on `track` (the Worker's current layout of it) at
 * layout revision `revision`, and if so what the board keeps of it
 */
export function checkBoardRun(file: ReplayFile, track: Track, revision: number): BoardVerdict {
  const { replay } = file
  const current = track.revision ?? 1
  if (replay.track !== track.id) return refuse('track')
  if (revision !== current || file.revision !== current) return refuse('revision')

  // The time trial's shape: one kart, its own laps, nothing thrown or held
  const racer = replay.racers[0]
  const kart = replay.karts[0]
  if (
    replay.mode !== 'race' ||
    replay.racers.length !== 1 ||
    replay.karts.length !== 1 ||
    !racer ||
    !kart ||
    racer.seat !== kart.seat ||
    racer.out ||
    racer.team !== undefined ||
    replay.laps !== track.laps ||
    replay.events.length > 0 ||
    replay.held.length > 0 ||
    (replay.shots?.length ?? 0) > 0 ||
    replay.teams !== undefined
  )
    return refuse('shape')
  if (racer.finishMs === null || racer.lapMs.length !== track.laps) return refuse('laps')
  if (!racer.lapMs.every((ms) => Number.isFinite(ms) && ms > 0)) return refuse('laps')

  // The samples: from the grid at GO, a sample at least every BOARD_MAX_GAP_TICKS, one kart, the
  // last (and only the last) at the finish
  if (kart.bytes.byteLength > BOARD_MAX_SAMPLES * 23) return refuse('samples')
  const samples = decodeTape(kart.bytes)
  if (samples.length < 2 || samples.length > BOARD_MAX_SAMPLES) return refuse('samples')
  const first = samples[0]!
  const course = courseOf(track)
  const start = course.start
  if (
    first.tick !== 0 ||
    first.reset ||
    first.crossings !== 0 ||
    first.nextGate !== 0 ||
    Math.hypot(first.x - start.x, first.z - start.z) > START_REACH ||
    Math.hypot(first.vx, first.vz) > START_SPEED
  )
    return refuse('samples', 0)
  for (let index = 1; index < samples.length; index++) {
    const gap = samples[index]!.tick - samples[index - 1]!.tick
    if (gap < 1 || gap > BOARD_MAX_GAP_TICKS) return refuse('samples', index)
    if (samples[index]!.body !== first.body) return refuse('samples', index)
    if (samples[index]!.finished !== (index === samples.length - 1)) return refuse('samples', index)
  }
  if (first.finished) return refuse('samples', 0)
  const loadout = loadoutOfByte(first.body)

  // Every sample judged as a room judges a frame, the clock running with the samples
  const speedCap = speedCapFor(loadout.kart)
  // The time trial starts from its own place (track.solo), which a reset before the first gate
  // goes back to: it stands in for the judge's pole. Made once: courseOf keeps its terrain by track
  const judged: Track = track.solo ? { ...track, grid: [track.solo, ...track.grid.slice(1)] } : track
  let tracked = startTracking(judged, 0)
  const lapEnds: number[] = []
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index]!
    // The gates are the server's to count. A live frame's own count is believed one gate ahead,
    // near that gate (a frame lost on the way can hide a crossing); a replay loses no sample, so its
    // count is believed only where the recorder may have missed a crossing: a reset, which is kept
    // at once, whenever it comes, and may follow a crossing between two samples
    const frame = sample.reset
      ? frameOf(sample)
      : { ...frameOf(sample), crossings: tracked.crossings, nextGate: tracked.nextGate }
    const verdict = judgeFrame(tracked, frame, {
      track: judged,
      slot: 0,
      now: (frame.tick * 1000) / TICKS_PER_SECOND,
      goAt: 0,
      laps: lapEnds.length,
      speedCap,
    })
    if (verdict.kind === 'refused') return refuse(verdict.why, index)
    tracked = verdict.tracked
    if (verdict.lapAt !== null) lapEnds.push(verdict.lapAt)
  }
  if (lapsDone(tracked.crossings) !== track.laps || lapEnds.length !== track.laps) return refuse('laps')

  // The times: each judged lap end within a sample of the file's, the total the last sample's tick
  let claimed = 0
  for (let lap = 0; lap < track.laps; lap++) {
    claimed += racer.lapMs[lap]!
    if (Math.abs(lapEnds[lap]! - claimed) > BOARD_LAP_SLACK_MS + lap) return refuse('time')
  }
  const lastMs = (samples[samples.length - 1]!.tick * 1000) / TICKS_PER_SECOND
  if (Math.abs(racer.finishMs - lastMs) > 1) return refuse('time')
  if (Math.abs(claimed - racer.finishMs) > track.laps) return refuse('time')

  const totalMs = Math.round(racer.finishMs)
  return {
    ok: true,
    run: {
      kart: loadout.kart,
      driver: loadout.driver,
      totalMs,
      lapMs: racer.lapMs.map((ms) => Math.round(ms)),
      bestLapMs: Math.round(Math.min(...racer.lapMs)),
    },
  }
}
