import { STEP_SECONDS } from './physics.ts'

// A tab that was asleep must not simulate the whole gap in one frame
export const MAX_FRAME_SECONDS = 0.25

// Summing frame times drifts by far less than this over a session, and a drift must not turn into a
// missing step: 30 fps and 144 fps have to run the same number of steps in the same total time.
const ROUNDING = 1e-9

export interface ClockAdvance {
  /** How many fixed steps to run now */
  readonly steps: number
  /** Time carried over to the next frame */
  readonly accumulator: number
  /** How far the display is between the last two steps, 0 to 1 */
  readonly alpha: number
}

/** Turns one rendered frame's duration into fixed steps. Rendering speed never touches the physics. */
export function advanceClock(accumulator: number, frameSeconds: number): ClockAdvance {
  const frame = Math.min(Math.max(0, frameSeconds), MAX_FRAME_SECONDS)
  let left = accumulator + frame
  let steps = 0
  while (left + ROUNDING >= STEP_SECONDS) {
    left -= STEP_SECONDS
    steps++
  }
  const carried = Math.max(0, left)
  return { steps, accumulator: carried, alpha: Math.min(1, carried / STEP_SECONDS) }
}
