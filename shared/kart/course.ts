// e8-t02b: one car on a course, a step at a time: the kart physics, then the walls, then the reset
// and the safe place it goes back to. Pure, like physics.ts.
//
// On a track (e8-t04, J4) the safe place is the respawn point of the last gate passed, in order. On
// a course without gates (the test arena) it is wherever the car last drove clear of the walls for
// SAFE_CONFIRM_SECONDS.
//
// 2026-11-14: a hard wall hit breaks the chain (release boosts and the boost slide), and boost pads
// on the road boost whoever drives over them.
import {
  DEFAULT_RULES,
  INITIAL_KART,
  KART_TUNING,
  MODEL_CLASSIC,
  stepKart,
  STEP_SECONDS,
  type KartInput,
  type KartRules,
  type KartState,
  type KartTuning,
} from './physics.ts'
import { settleTerrain, stepOnTerrain, type Terrain, type TerrainEvent } from './terrain.ts'
import type { GateLine } from './branches.ts'
import { gateCrossing, type BoostPad, type Gate, type RoadPoint } from './track.ts'
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
    /**
     * On a track with branches (2026-11-20, branches.ts): for each gate, every line that passes it
     * (the gate itself first, then each branch's stand-in). Absent on any other track
     */
    readonly lines?: readonly (readonly GateLine[])[]
  }
  /** On a track with branches: each branch's centre line, from main road point to main road point */
  readonly branches?: readonly (readonly RoadPoint[])[]
  /** Strips on the road that boost whoever drives over them */
  readonly boostPads?: readonly BoostPad[]
  /**
   * Slopes and jumps (2026-11-17, terrain.ts); absent on a flat track, whose cars then take exactly
   * the steps they always took
   */
  readonly terrain?: Terrain
}

/** Whether (x, z) is on `pad`: within half its length along its heading and half its width across */
export function onPad(pad: BoostPad, x: number, z: number): boolean {
  const dx = x - pad.x
  const dz = z - pad.z
  const along = dx * Math.sin(pad.heading) - dz * Math.cos(pad.heading)
  const across = dx * Math.cos(pad.heading) + dz * Math.sin(pad.heading)
  return Math.abs(along) <= pad.length / 2 && Math.abs(across) <= pad.width / 2
}

/** After the walls: a hard hit breaks the chain, and a boost pad boosts */
function afterWalls(
  kart: KartState,
  hitSpeed: number,
  touching: boolean,
  course: Course,
  tuning: KartTuning,
) {
  let next = kart
  // The classic feel (2026-11-18): a wall touched in a drift, or sliding out of one, takes the
  // exit's gauge bonus away (classic.ts)
  if (
    touching &&
    tuning.model === MODEL_CLASSIC &&
    !next.driftDirty &&
    (next.drifting || next.burstReady || next.releaseWindow > 0)
  ) {
    next = { ...next, driftDirty: true }
  }
  if (hitSpeed >= tuning.wallBreakSpeed && tuning.model === MODEL_CLASSIC) {
    // The classic feel (2026-11-17): a hard crash also ends the drift and its dash, and keeps only
    // `wallGaugeKeep` of the gauge; the drift key must come up before the next drift
    next = {
      ...next,
      chain: 0,
      chainWindow: 0,
      releaseWindow: 0,
      burstReady: false,
      stackSeconds: 0,
      doubleWindow: 0,
      doubleArmed: false,
      drifting: false,
      driftDirection: 0,
      driftSeconds: 0,
      slideDirection: 0,
      traction: 1,
      driftPeak: 0,
      driftLatch: next.driftKey ?? false,
      driftDirty: false,
      sinceRelease: 0,
      driftWorth: 0,
      driftHeld: 0,
      // The harder the hit the more of the gauge goes: all of the share at three times the mark
      gauge:
        next.gauge *
        (1 -
          (1 - tuning.wallGaugeKeep) *
            Math.min(1, hitSpeed / Math.max(1e-3, tuning.wallBreakSpeed * 3))),
    }
  } else if (hitSpeed >= tuning.wallBreakSpeed) {
    next = {
      ...next,
      chain: 0,
      chainWindow: 0,
      releaseWindow: 0,
      sliding: false,
      stackSeconds: 0,
      doubleWindow: 0,
      doubleArmed: false,
    }
  }
  const pads = course.boostPads
  // A car in the air (terrain.ts) flies over a pad: `air` is never set on a flat track
  if (pads && pads.length > 0 && next.boostSeconds < tuning.padBoostSeconds && !next.air) {
    if (pads.some((pad) => onPad(pad, next.x, next.z))) {
      next = { ...next, boostSeconds: tuning.padBoostSeconds }
    }
  }
  return next
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
  /**
   * On a track with terrain (terrain.ts): whether the last step took off or landed, for the sound
   * and the look. Absent on a flat track
   */
  readonly terrainEvent?: TerrainEvent
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
  if (checkpoints.lines) return passLines(progress, from, to, checkpoints.lines, start)
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

/**
 * passGates on a track with branches (2026-11-20): the same, but any line of a gate passes it, and
 * the safe place is the respawn point of the line crossed. Driving back over a gate's line puts the
 * safe place at the gate before, on the same road where that has a line of its own there
 */
function passLines(
  progress: GateProgress,
  from: { x: number; z: number },
  to: { x: number; z: number },
  lines: readonly (readonly GateLine[])[],
  start: Spot,
): GateProgress {
  const count = lines.length
  const { nextGate, crossings } = progress
  const ahead = lines[nextGate]!.find(
    (line) => gateCrossing(line.gate, from.x, from.z, to.x, to.z) === 1,
  )
  if (ahead) {
    return {
      nextGate: (nextGate + 1) % count,
      crossings: nextGate === 0 ? crossings + 1 : crossings,
      safe: ahead.respawn,
    }
  }
  const behind = (nextGate - 1 + count) % count
  if (crossings <= 0) return progress
  const back = lines[behind]!.find(
    (line) => gateCrossing(line.gate, from.x, from.z, to.x, to.z) === -1,
  )
  if (!back) return progress
  const left = behind === 0 ? crossings - 1 : crossings
  const before = lines[(behind - 1 + count) % count]!
  return {
    nextGate: behind,
    crossings: left,
    safe:
      left === 0 && behind === 0
        ? start
        : (before.find((line) => line.route === back.route) ?? before[0]!).respawn,
  }
}

/**
 * Every line that passes gate `gate`: the gate itself, and on a track with branches each branch's
 * stand-in for it
 */
export function linesOf(
  checkpoints: NonNullable<Course['checkpoints']>,
  gate: number,
): readonly GateLine[] {
  return (
    checkpoints.lines?.[gate] ?? [
      { gate: checkpoints.gates[gate]!, respawn: checkpoints.respawns[gate]!, route: 0 },
    ]
  )
}

/** The respawn point of gate `gate` nearest (x, z): its own, or on a track with branches, a branch's */
export function respawnNear(
  checkpoints: NonNullable<Course['checkpoints']>,
  gate: number,
  x: number,
  z: number,
): Spot {
  const lines = checkpoints.lines?.[gate]
  if (!lines) return checkpoints.respawns[gate]!
  let best = lines[0]!.respawn
  for (const line of lines) {
    if (Math.hypot(line.respawn.x - x, line.respawn.z - z) < Math.hypot(best.x - x, best.z - z)) {
      best = line.respawn
    }
  }
  return best
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

  const terrain = course.terrain
  const moved = terrain
    ? stepOnTerrain(run.kart, input, terrain, tuning, rules)
    : stepKart(run.kart, input, tuning, rules)
  const {
    state: walled,
    impact,
    hitSpeed,
    touching,
  } = collideWalls(run.kart, moved, course.walls, tuning)
  let kart = afterWalls(walled, hitSpeed, touching, course, tuning)
  // On a track with terrain: take off, land, or sit on the ground
  let terrainEvent: TerrainEvent | undefined
  if (terrain) {
    const settled = settleTerrain(
      run.kart,
      kart,
      input,
      terrain,
      undefined,
      tuning.maxStoredBoosts,
    )
    kart = settled.kart
    terrainEvent = settled.event
  }
  const marked = terrainEvent === undefined ? {} : { terrainEvent }

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
      ...marked,
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
    ...marked,
  }
}
