// e8-t02b: one car on a course, a step at a time: the kart physics, then the walls, then the reset
// and the safe place it goes back to. Pure, like physics.ts.
//
// On a track (e8-t04, J4) the safe place is the respawn point of the last gate passed, in order. On
// a course without gates (the test arena) it is wherever the car last drove clear of the walls for
// SAFE_CONFIRM_SECONDS.
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
import { gateCrossing, type Gate } from './track.ts'
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
  /** A track's gates in driving order (gate 0 the finish line) and where each sends a reset car */
  readonly checkpoints?: {
    readonly gates: readonly Gate[]
    readonly respawns: readonly Spot[]
    readonly laps: number
  }
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
  /** On a track: the gate to cross next, in order */
  readonly nextGate: number
  /** On a track: how many times the finish line has been crossed going forwards, in order */
  readonly crossings: number
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
    nextGate: 0,
    crossings: 0,
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

export interface GateProgress {
  readonly nextGate: number
  readonly crossings: number
  readonly safe: Spot
}

/**
 * Gates count only in order: crossing the next one forwards moves on (and crossing gate 0 is a lap
 * line crossing); crossing the last one passed backwards moves back, so that driving back over a
 * gate and forwards again does not count it twice. The safe place follows: the respawn point of the
 * last gate passed, or the start before gate 0 has ever been crossed
 */
export function passGates(
  progress: GateProgress,
  from: { x: number; z: number },
  to: { x: number; z: number },
  checkpoints: NonNullable<Course['checkpoints']>,
  start: Spot,
): GateProgress {
  const { gates, respawns } = checkpoints
  const count = gates.length
  const { nextGate, crossings } = progress
  if (gateCrossing(gates[nextGate]!, from.x, from.z, to.x, to.z) === 1) {
    return {
      nextGate: (nextGate + 1) % count,
      crossings: nextGate === 0 ? crossings + 1 : crossings,
      safe: respawns[nextGate]!,
    }
  }
  const behind = (nextGate - 1 + count) % count
  // Before the start line has been crossed there is nothing behind to undo
  const anythingPassed = crossings > 0
  if (anythingPassed && gateCrossing(gates[behind]!, from.x, from.z, to.x, to.z) === -1) {
    const left = behind === 0 ? crossings - 1 : crossings
    const before = (behind - 1 + count) % count
    return {
      nextGate: behind,
      crossings: left,
      safe: left === 0 && behind === 0 ? start : respawns[before]!,
    }
  }
  return progress
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
  const { nextGate, crossings } = run
  const checkpoints = course.checkpoints
  if (checkpoints && checkpoints.gates.length > 0) {
    const passed = passGates(
      { nextGate, crossings, safe },
      run.kart,
      kart,
      checkpoints,
      course.start,
    )
    return {
      kart,
      safe: passed.safe,
      candidate: null,
      candidateSeconds: 0,
      impact,
      hitSpeed,
      resetHeld: input.reset ?? false,
      resets: run.resets,
      nextGate: passed.nextGate,
      crossings: passed.crossings,
    }
  }

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
    nextGate,
    crossings,
  }
}
