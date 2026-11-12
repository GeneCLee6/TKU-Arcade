// e8-t02b: one car on a course, a step at a time: the kart physics, then the walls, then the reset
// and the safe place it goes back to. Pure, like physics.ts.
//
// Until tracks have checkpoints (e8-t04, J4) the safe place is wherever the car last drove clear of
// the walls for SAFE_CONFIRM_SECONDS; a track's respawn points will take its place.
import {
  DEFAULT_RULES,
  INITIAL_KART,
  KART_TUNING,
  stepKart,
  STEP_SECONDS,
  type KartInput,
  type KartRules,
  type KartState,
  type KartTuning,
} from './physics.ts'
import { collideWalls, KART_RADIUS, wallClearance, type Wall } from './walls.ts'

/** A place and the way to face there */
export interface Spot {
  readonly x: number
  readonly z: number
  readonly heading: number
}

export interface Course {
  readonly walls: readonly Wall[]
  readonly start: Spot
}

/** A place is safe this far from every wall: a car put there can steer before it reaches one */
export const SAFE_CLEARANCE = 4
/** and the car is going forwards at least this fast, so its direction of travel says which way is forward */
export const SAFE_MIN_SPEED = 3
/** A safe place counts only once the car has driven on from it for this long without trouble */
export const SAFE_CONFIRM_SECONDS = 1

export interface Run {
  readonly kart: KartState
  /** Where a reset puts the car */
  readonly safe: Spot
  /** A place waiting to become `safe`, and how long the car has stayed clear since */
  readonly candidate: Spot | null
  readonly candidateSeconds: number
  /** The hardest wall hit of the last step, 0 to 1 (see collideWalls) */
  readonly impact: number
  /** How fast the car went into the wall at that hit, m/s (see collideWalls) */
  readonly hitSpeed: number
  /** Whether the reset input was down at the last step, so that holding it resets once */
  readonly resetHeld: boolean
  /** How many times the car has been reset */
  readonly resets: number
}

const placed = (spot: Spot): KartState => ({ ...INITIAL_KART, ...spot })

export function startRun(course: Course): Run {
  return {
    kart: placed(course.start),
    safe: course.start,
    candidate: null,
    candidateSeconds: 0,
    impact: 0,
    hitSpeed: 0,
    resetHeld: false,
    resets: 0,
  }
}

/**
 * Back to the safe place, facing the way the car was going there, stopped. The gauge and stored
 * boosts stay (a reset should not cost them twice); a boost, a chain or a drift in progress ends.
 */
export function resetRun(run: Run): Run {
  const { gauge, storedBoosts, boostHeld } = run.kart
  return {
    ...run,
    kart: { ...placed(run.safe), gauge, storedBoosts, boostHeld },
    candidate: null,
    candidateSeconds: 0,
    impact: 0,
    hitSpeed: 0,
    resets: run.resets + 1,
  }
}

/** Which way the car is going, as a heading (heading 0 faces -z and grows clockwise) */
const travelHeading = (kart: KartState): number => Math.atan2(kart.vx, -kart.vz)

/** One step of 1/60 s: physics, walls, then the safe place and the reset */
export function stepRun(
  run: Run,
  input: KartInput,
  course: Course,
  tuning: KartTuning = KART_TUNING,
  rules: KartRules = DEFAULT_RULES,
): Run {
  const resetPressed = (input.reset ?? false) && !run.resetHeld
  if (resetPressed) return { ...resetRun(run), resetHeld: true }

  const moved = stepKart(run.kart, input, tuning, rules)
  const {
    state: kart,
    impact,
    hitSpeed,
    touching,
  } = collideWalls(run.kart, moved, course.walls, tuning)

  let { safe, candidate, candidateSeconds } = run
  // Forwards, not just fast: a place passed in reverse would face the wrong way
  const forward = kart.vx * Math.sin(kart.heading) - kart.vz * Math.cos(kart.heading)
  const clear =
    !touching &&
    forward >= SAFE_MIN_SPEED &&
    wallClearance(course.walls, kart.x, kart.z) >= Math.max(SAFE_CLEARANCE, KART_RADIUS)
  if (!clear) {
    candidate = null
    candidateSeconds = 0
  } else if (candidate === null) {
    candidate = { x: kart.x, z: kart.z, heading: travelHeading(kart) }
    candidateSeconds = 0
  } else {
    candidateSeconds += STEP_SECONDS
    if (candidateSeconds >= SAFE_CONFIRM_SECONDS - 1e-9) {
      safe = candidate
      candidate = { x: kart.x, z: kart.z, heading: travelHeading(kart) }
      candidateSeconds = 0
    }
  }

  return {
    kart,
    safe,
    candidate,
    candidateSeconds,
    impact,
    hitSpeed,
    resetHeld: input.reset ?? false,
    resets: run.resets,
  }
}
