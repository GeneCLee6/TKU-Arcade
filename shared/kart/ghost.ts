// e8-t11 (AC-8.4): a ghost, the best run on a track played back beside the car. Recorded from GO,
// a sample every GHOST_STEPS physics steps, as plain numbers small enough to keep in localStorage
// (a 3-minute run is about 3,600 numbers). Pure: recording, playing back, and checking what comes
// back out of storage, which anyone can edit.
import { STEP_SECONDS } from './physics.ts'

/** A sample every this many steps of 1/60 s: 20 a second */
export const GHOST_STEPS = 3
/** What storage gives back is refused past this: about 15 minutes */
const MAX_SAMPLES = 18_000

export interface Ghost {
  /** The track it was driven on, and its format */
  readonly track: string
  readonly format: 1
  /** From GO to the finish, steps */
  readonly total: number
  readonly laps: readonly number[]
  /** x, z, heading, repeated: one sample every GHOST_STEPS steps from GO */
  readonly samples: readonly number[]
}

export interface GhostRecorder {
  readonly track: string
  readonly samples: number[]
}

export const startRecording = (track: string): GhostRecorder => ({ track, samples: [] })

/** Called once per race step, with the race's step count since GO */
export function recordStep(
  recorder: GhostRecorder,
  step: number,
  pose: { x: number; z: number; heading: number },
): void {
  if (step % GHOST_STEPS !== 0) return
  // + 0: no -0, which JSON would bring back as 0
  recorder.samples.push(
    Math.round(pose.x * 100) / 100 + 0,
    Math.round(pose.z * 100) / 100 + 0,
    Math.round(pose.heading * 1000) / 1000 + 0,
  )
}

export const finishRecording = (
  recorder: GhostRecorder,
  total: number,
  laps: readonly number[],
): Ghost => ({
  track: recorder.track,
  format: 1,
  total,
  laps: [...laps],
  samples: [...recorder.samples],
})

/** Shortest turn from a to b, so that a heading crossing ±π does not spin round */
const turnBetween = (a: number, b: number) => {
  let turn = b - a
  while (turn > Math.PI) turn -= 2 * Math.PI
  while (turn < -Math.PI) turn += 2 * Math.PI
  return turn
}

/** Where the ghost is `steps` after GO, between its samples; its last place once it has finished */
export function ghostAt(
  ghost: Ghost,
  steps: number,
): { x: number; z: number; heading: number } | null {
  const count = ghost.samples.length / 3
  if (count === 0) return null
  const at = Math.max(0, steps / GHOST_STEPS)
  const index = Math.min(count - 1, Math.floor(at))
  const next = Math.min(count - 1, index + 1)
  const t = Math.min(1, at - index)
  const read = (sample: number, offset: number) => ghost.samples[sample * 3 + offset]!
  const heading = read(index, 2)
  return {
    x: read(index, 0) + (read(next, 0) - read(index, 0)) * t,
    z: read(index, 1) + (read(next, 1) - read(index, 1)) * t,
    heading: heading + turnBetween(heading, read(next, 2)) * t,
  }
}

/** A ghost from storage, or null when it is not one (an old format, a hand edit, another track) */
export function parseGhost(value: unknown, track: string): Ghost | null {
  if (typeof value !== 'object' || value === null) return null
  const ghost = value as Record<string, unknown>
  const { samples, laps, total } = ghost
  if (ghost.track !== track || ghost.format !== 1) return null
  if (!Number.isInteger(total) || (total as number) <= 0) return null
  if (!Array.isArray(laps) || !laps.every((lap) => Number.isInteger(lap) && lap > 0)) return null
  if (!Array.isArray(samples) || samples.length % 3 !== 0 || samples.length > MAX_SAMPLES * 3)
    return null
  if (!samples.every((sample) => typeof sample === 'number' && Number.isFinite(sample))) return null
  return {
    track,
    format: 1,
    total: total as number,
    laps: laps as number[],
    samples: samples as number[],
  }
}

/** Seconds, for showing */
export const ghostSeconds = (steps: number): number => steps * STEP_SECONDS
