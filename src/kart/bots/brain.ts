// A computer opponent's hands (owner 2026-11-17; docs/ARCHITECTURE.md §4.20). The room's autopilot
// (src/kart/race/autopilot.ts) grown into a racer: pure pursuit of the road ahead, off the middle by
// a line of its own; a drift whenever a corner wants more turn than the grip gives, and by skill the
// counter-steer and release boost out of it, the double, tapped drifts down the straights, the start
// boost and stacked charges (the techniques of tests/kart/drivers.ts's expert, docs/ARCHITECTURE.md
// §4.13). It fires its charges where the road runs straight, and puts itself back on the road when it
// is stuck or turned round. Difficulty (skill.ts) sets how precise the line is, how late it drifts,
// how slow its hands are and how near its kart's top speed it drives. Pure, seeded: the same seed
// drives the same race.
import { createRng } from '../../../shared/games/rng.ts'
import {
  ARCADE_TUNING,
  MODEL_CLASSIC,
  NO_INPUT,
  type KartInput,
  type KartTuning,
} from '../../../shared/kart/physics.ts'
import { nearestRoadPoint, type Trial } from '../../../shared/kart/timeTrial.ts'
import { roadDirection, type RoadPoint } from '../../../shared/kart/track.ts'
import type { BotSkill } from './skill.ts'

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
const clampSteer = (value: number) => Math.max(-1, Math.min(1, value))
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Seconds of travel looked ahead for the line, on top of 14 m: the slide answers late */
const REACH = 0.5
/** The share of the tightest turn a drift can make past which the corner needs the brake too */
const BRAKE_AT = 0.8
/** Steps a tapped drift is held: just past chainMinDrift, so that it earns a release boost */
const TAP_STEPS = Math.ceil(ARCADE_TUNING.chainMinDrift * 60) + 2
/**
 * The classic feel (2026-11-18, docs/KART-FEEL.md): a dash takes a drift past dashMinSlip. The hands
 * steer into a drift for this much more slip than the mark, radians, while the corner ahead still
 * turns at least this share of what the grip gives
 */
const CLASSIC_DEEP_MARGIN = (3 * Math.PI) / 180
const CLASSIC_DEEP_CORNER = 0.5
/** A drift this near the dash's length and depth (seconds, radians) is held on for it */
const CLASSIC_NEARLY_SECONDS = 0.2
const CLASSIC_NEARLY_SLIP = (5 * Math.PI) / 180
/** The classic feel: a drift is let go once the turn wanted now and further on are under these shares of the grip's */
const CLASSIC_END_NOW = 0.6
const CLASSIC_END_LATER = 0.8
const DOUBLE_STEPS = 3
const LIFT_STEPS = 2
const TAP_BEFORE_END = 0.1
/** Stuck: slower than this for this long while racing, and the bot resets */
const STUCK_SPEED = 3
const STUCK_STEPS = 90
/** Turned round: the race says wrong way for this long, and the bot resets */
const WRONG_STEPS = 45
/** How long a line holds before it sways the other way, metres of road */
const SWAY_METRES = 160
/**
 * A jump ahead (2026-11-17, shared/kart/terrain.ts) this near, metres plus this many seconds of
 * travel: no new drift, no tap, any drift let go, and the line straight down the middle, so the kart
 * takes off square and lands in line (for the landing boost)
 */
const JUMP_CLEAR = 18
const JUMP_SECONDS = 0.9

type Move =
  | { readonly kind: 'none' }
  | { readonly kind: 'tap'; readonly direction: -1 | 1; readonly steps: number }
  | {
      readonly kind: 'lift'
      readonly steps: number
      readonly double: boolean
      /** The classic feel: the steer held while the throttle is up and pressed again (the counter-steer) */
      readonly counter?: number
    }
  | { readonly kind: 'double'; readonly direction: -1 | 1; readonly steps: number }

const NONE: Move = { kind: 'none' }

/** What the race tells the hands each step, besides the trial */
export interface BotSense {
  /** The share of the kart's top speed to drive at now (the skill's, after the rubber band) */
  readonly speedShare: number
}

export type BotBrain = (trial: Trial, sense: BotSense) => KartInput

/** The road point about `metres` ahead of road point `from`, along the road */
export function pointAhead(
  road: readonly RoadPoint[],
  from: number,
  metres: number,
): { x: number; z: number; index: number } {
  let left = metres
  let index = from
  for (let guard = 0; guard < road.length; guard++) {
    const a = road[index % road.length]!
    const b = road[(index + 1) % road.length]!
    const step = Math.hypot(b.x - a.x, b.z - a.z)
    if (step >= left) {
      const t = left / Math.max(step, 1e-6)
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, index: index % road.length }
    }
    left -= step
    index++
  }
  const point = road[from]!
  return { x: point.x, z: point.z, index: from }
}

/**
 * A bot's driving, by `skill`, on `road`, with its kart's `tuning`. `seed` gives it its own line and
 * its own coin flips
 */
export function createBotBrain(
  skill: BotSkill,
  road: readonly RoadPoint[],
  tuning: KartTuning,
  seed: number,
  /** The track's jump lips (road point indices), if it has any */
  jumps: readonly number[] = [],
): BotBrain {
  const t = tuning
  const rng = createRng(seed)
  const lineBase = (rng.float() - 0.5) * 0.4
  const swayPhase = rng.float() * Math.PI * 2
  // Distance along the road at each point, for the sway
  const along: number[] = []
  let total = 0
  road.forEach((point, index) => {
    along.push(total)
    const next = road[(index + 1) % road.length]!
    total += Math.hypot(next.x - point.x, next.z - point.z)
  })

  /** How far along the road the next jump lip is from road point `from`; Infinity with none */
  const toJump = (from: number): number => {
    let least = Infinity
    for (const lip of jumps) {
      const ahead = (along[lip]! - along[from]! + total) % total
      if (ahead < least) least = ahead
    }
    return least
  }

  let move: Move = NONE
  /** Straight down the middle for a jump: set each step before the line is worked out */
  let jumpLine = false
  let wasDrifting = false
  let boostPressed = false
  let lastTap: -1 | 1 = 1
  let startPlan: boolean | null = null
  let stuck = 0
  let wrong = 0
  let resetHeld = false
  /** The hands' answers, oldest first: the reaction time */
  const queue: KartInput[] = []

  /** The line's offset from the middle at road point `index`, metres (+ is to the right) */
  const offsetAt = (index: number): number => {
    const half = road[index]!.width / 2
    const sway = Math.sin(swayPhase + (along[index]! / SWAY_METRES) * Math.PI)
    return half * Math.max(-0.6, Math.min(0.6, lineBase * skill.lineNoise + sway * skill.lineNoise))
  }

  /** The turn rate (rad/s, signed) that brings a car along `heading` onto the line `metres` ahead */
  const pursuit = (
    x: number,
    z: number,
    nearest: number,
    metres: number,
    speed: number,
    heading: number,
  ): number => {
    const ahead = pointAhead(road, nearest, metres)
    const { dx, dz } = roadDirection(road, ahead.index)
    // Right of the road's direction: heading 0 faces -z, clockwise
    const offset = jumpLine ? 0 : offsetAt(ahead.index)
    const tx = ahead.x - dz * offset
    const tz = ahead.z + dx * offset
    const angle = wrap(Math.atan2(tx - x, -(tz - z)) - heading)
    const distance = Math.max(1, Math.hypot(tx - x, tz - z))
    return (2 * Math.sin(angle) * Math.max(speed, 5)) / distance
  }

  const classic = t.model === MODEL_CLASSIC
  /** Whether this drift is to end in an instant boost: decided once a drift, by skill */
  let dashPlan: boolean | null = null
  /** The classic feel: a drift decided on, pressed for this many more steps until it has begun */
  const NOT_ENTERING = { direction: 0, steps: 0 }
  let entering = NOT_ENTERING

  /**
   * The classic feel's hands (2026-11-17): drift where the grip is not enough, and by skill end it
   * with the counter-steer and a fresh press of the throttle (the instant boost: let go for
   * LIFT_STEPS, then press) once it is deep and long enough. 2026-11-18: by skill the hands steer
   * into a drift through a corner big enough until it has earned the boost, hold a drift through a
   * long bend, and no longer tap down the straights (a tap earns nothing); the boost is fired on a
   * straight, one at a time
   */
  const classicHands = (
    kart: Trial['run']['kart'],
    sense: BotSense,
    speed: number,
    want: number,
    noseWant: number,
    later: number,
    gripTurn: number,
    jumpNear: boolean,
    slip: number,
  ): KartInput => {
    wasDrifting = kart.drifting
    const straight = Math.abs(later) < gripTurn * 0.4 && Math.abs(want) < gripTurn * 0.4
    // A team boost held (a team race) is fired like a charge, once nothing else burns
    const teamReady = (kart.teamBoosts ?? 0) > 0 && kart.boostSeconds === 0
    const fire =
      !boostPressed &&
      (kart.teamSeconds ?? 0) === 0 &&
      straight &&
      !kart.drifting &&
      // One boost at a time (2026-11-18): the key does nothing while a boost runs
      kart.boostSeconds === 0 &&
      (teamReady || kart.storedBoosts > 0)
    boostPressed = fire
    const calm =
      kart.boostSeconds === 0 &&
      kart.miniSeconds === 0 &&
      (kart.launchSeconds ?? 0) === 0 &&
      (kart.teamSeconds ?? 0) === 0
    const cruising = calm && speed > t.topSpeed * Math.min(1, sense.speedShare)
    const gripSteer = clampSteer(noseWant / gripTurn)
    const base = { ...NO_INPUT, throttle: !cruising, boost: fire }

    if (move.kind === 'tap' || move.kind === 'double') move = NONE
    if (move.kind === 'lift') {
      // A dash waiting (the car still sliding, or just straightened): lift, then press afresh
      const { steps, double, counter } = move
      const steer = counter !== undefined && kart.slideDirection !== 0 ? counter : gripSteer
      if (steps > 0) {
        move = { kind: 'lift', steps: steps - 1, double, counter }
        return { ...base, throttle: false, steer }
      }
      move = NONE
      return { ...base, throttle: true, steer }
    }
    if (kart.releaseWindow > 0 && dashPlan) {
      move = { kind: 'lift', steps: LIFT_STEPS - 1, double: false }
      return { ...base, throttle: false, steer: gripSteer }
    }
    // Sliding out of a drift that earned a dash (let go for a jump, or too slow to hold)
    if (!kart.drifting && kart.slideDirection !== 0 && kart.burstReady && dashPlan && !jumpNear) {
      const counter = -kart.slideDirection
      move = { kind: 'lift', steps: LIFT_STEPS - 1, double: false, counter }
      return { ...base, throttle: false, steer: counter }
    }

    if (jumpNear) {
      entering = NOT_ENTERING
      return { ...base, steer: gripSteer }
    }

    const turnMost = t.driftTurnRate * (1 + t.driftSteerShare)
    /** How far into a drift the stick must be for the slip to pass dashMinSlip, with a margin */
    const deepInto = clamp(
      (t.dashMinSlip + CLASSIC_DEEP_MARGIN - t.driftSlip) / Math.max(1e-3, t.driftSlipSteer),
      0,
      1,
    )
    if (kart.drifting) {
      entering = NOT_ENTERING
      const dir = kart.driftDirection
      if (dashPlan === null) dashPlan = rng.float() < skill.releaseBoosts
      const ramp = Math.min(1, speed / Math.max(1, t.driftFullSpeed))
      // The turn bites only as the slip builds (driftLoose)
      const bite = 1 - t.driftLoose * (1 - Math.min(1, slip / Math.max(1e-3, t.driftSlip)))
      const turn = t.driftTurnRate * Math.max(0.2, ramp) * bite
      let into = (Math.abs(want) / turn - 1) / Math.max(0.05, t.driftSteerShare)
      // A dash takes a deep drift (2026-11-18): while the corner still goes on, steer into it at
      // least far enough for the slip to pass dashMinSlip
      const goesOn = Math.sign(later) === dir && Math.abs(later) > gripTurn * CLASSIC_DEEP_CORNER
      // ... or the drift is nearly there: a little longer, a little deeper
      const nearly =
        kart.driftSeconds >= t.dashMinSeconds - CLASSIC_NEARLY_SECONDS &&
        (kart.driftPeak ?? 0) >= t.dashMinSlip - CLASSIC_NEARLY_SLIP
      const earning = dashPlan && !kart.burstReady && (goesOn || nearly)
      if (earning && (kart.driftPeak ?? 0) < t.dashMinSlip) into = Math.max(into, deepInto)
      // The corner is over (or the car has come round too far) and no dash is about to be earned.
      // Through a long bend the drift is held, steering out of it, not let go and begun again
      const over =
        Math.sign(want) !== dir ||
        (Math.abs(want) < gripTurn * CLASSIC_END_NOW && Math.abs(later) < gripTurn * CLASSIC_END_LATER)
      const done = kart.driftSeconds > 0.15 && over && !earning
      if (done) {
        // Out of the corner: let go, counter-steer and lift, then press afresh for the dash; or
        // just let go
        if (dashPlan && kart.burstReady) {
          move = { kind: 'lift', steps: LIFT_STEPS - 1, double: false, counter: -dir }
          return { ...base, throttle: false, steer: -dir }
        }
        return { ...base, steer: gripSteer }
      }
      // More corner than even a tight drift turns: scrub speed off with the brake, still drifting
      const tooTight = into > 1.25 && speed > 30
      return {
        ...base,
        throttle: base.throttle && !tooTight,
        brake: tooTight,
        drift: true,
        steer: dir * clamp(into, -1, 1),
      }
    }
    if (kart.slideDirection === 0) dashPlan = null
    // A drift decided on is pressed until it has begun: the hands answer late, and a turn that
    // hovers about the mark must not press and let go step by step
    if (entering.steps > 0) {
      entering = { ...entering, steps: entering.steps - 1 }
      return { ...base, drift: true, steer: entering.direction }
    }
    if (speed > t.driftMinSpeed + 4 && Math.abs(want) > gripTurn * skill.driftAt) {
      entering = { direction: Math.sign(want), steps: skill.reactionSteps + 1 }
      return { ...base, drift: true, steer: Math.sign(want) }
    }
    // No taps down the straights (2026-11-18): a tapped drift earns no dash any more, and one deep
    // enough to earn it turns the car half round
    // A corner coming that even a drift cannot take at this speed: slow down before it
    const brake =
      (Math.abs(want) > turnMost * BRAKE_AT || Math.abs(later) > turnMost * (speed / t.topSpeed)) &&
      speed > 30
    const throttle = base.throttle && !brake
    return { ...base, throttle, brake, steer: gripSteer }
  }

  const think = (trial: Trial, sense: BotSense): KartInput => {
    const { kart } = trial.run
    if (trial.phase === 'countdown') {
      startPlan ??= rng.float() < skill.startBoost
      // A start boost: the throttle in the last moment before GO. Or held from early on: a stall
      return {
        ...NO_INPUT,
        throttle: startPlan ? trial.countdown <= t.startWindow - 0.1 : trial.countdown < 1.5,
      }
    }
    if (trial.phase === 'finished') return { ...NO_INPUT, brake: true }

    // Stuck against a wall, or turned round: back on the road
    const speed = Math.hypot(kart.vx, kart.vz)
    stuck = speed < STUCK_SPEED ? stuck + 1 : 0
    wrong = trial.wrongWay ? wrong + 1 : 0
    if (stuck > STUCK_STEPS || wrong > WRONG_STEPS) {
      stuck = 0
      wrong = 0
      move = NONE
      return { ...NO_INPUT, reset: true }
    }

    const nearest = nearestRoadPoint(road, kart.x, kart.z)
    // In the air: hold the throttle for the landing boost, the nose kept in line with the flight
    if ((kart.air ?? 0) > 0) {
      move = NONE
      wasDrifting = false
      const flight = Math.atan2(kart.vx, -kart.vz)
      return { ...NO_INPUT, throttle: true, steer: clampSteer(wrap(flight - kart.heading) * 4) }
    }
    const jumpNear = jumps.length > 0 && toJump(nearest) < JUMP_CLEAR + speed * JUMP_SECONDS
    if (jumpNear && (move.kind === 'tap' || move.kind === 'double')) move = NONE
    jumpLine = jumpNear
    const travel = speed > 3 ? Math.atan2(kart.vx, -kart.vz) : kart.heading
    // Slow hands look further ahead, to make up for answering late
    const reach = 14 + speed * (REACH + skill.reactionSteps / 120)
    const want = pursuit(kart.x, kart.z, nearest, reach, speed, travel)
    const noseWant = pursuit(kart.x, kart.z, nearest, reach, speed, kart.heading)
    const later = pursuit(kart.x, kart.z, nearest, 30 + speed * 0.9, speed, travel)
    const gripTurn = t.turnRate * (1 - t.turnLossAtTopSpeed * Math.min(1, speed / t.topSpeed))
    const slip = Math.abs(wrap(kart.heading - travel))
    if (classic) {
      return classicHands(kart, sense, speed, want, noseWant, later, gripTurn, jumpNear, slip)
    }

    const letGo = wasDrifting && !kart.drifting && (kart.burstReady || kart.releaseWindow > 0)
    if (letGo && move.kind === 'none' && rng.float() < skill.releaseBoosts) {
      move = { kind: 'lift', steps: LIFT_STEPS, double: skill.doubles && !kart.doubleArmed }
    }
    wasDrifting = kart.drifting

    const straight = Math.abs(later) < gripTurn * 0.4 && Math.abs(want) < gripTurn * 0.4
    const fire =
      !boostPressed &&
      kart.storedBoosts > 0 &&
      straight &&
      !kart.drifting &&
      (kart.boostSeconds === 0 || (skill.stackBoosts && kart.stackSeconds === 0))
    boostPressed = fire

    // Its own top speed, eased off by skill and the rubber band; a boost goes over it as for anyone
    const calm = kart.boostSeconds === 0 && kart.miniSeconds === 0
    const cruising = calm && speed > t.topSpeed * Math.min(1, sense.speedShare)

    const gripSteer = clampSteer(noseWant / gripTurn)
    const base = { ...NO_INPUT, throttle: !cruising, boost: fire }

    if (move.kind === 'lift') {
      const { steps, double } = move
      const counter = kart.slideDirection !== 0 ? -kart.slideDirection : gripSteer
      if (steps > 0) {
        move = { kind: 'lift', steps: steps - 1, double }
        return { ...base, throttle: false, steer: counter }
      }
      const direction: -1 | 1 = Math.abs(noseWant) > 0.05 ? (noseWant > 0 ? 1 : -1) : lastTap
      move = double ? { kind: 'double', direction, steps: DOUBLE_STEPS } : NONE
      return { ...base, throttle: true, steer: gripSteer }
    }
    if (move.kind === 'double') {
      const { direction, steps } = move
      if (steps > 0) {
        move = { kind: 'double', direction, steps: steps - 1 }
        return { ...base, drift: true, steer: steps === DOUBLE_STEPS ? direction : -direction }
      }
      move = NONE
      return { ...base, steer: gripSteer }
    }
    if (move.kind === 'tap') {
      const { direction, steps } = move
      if (steps > 0 && kart.drifting) {
        move = { kind: 'tap', direction, steps: steps - 1 }
        return { ...base, drift: true, steer: -direction }
      }
      move = NONE
      return { ...base, steer: gripSteer }
    }

    let drift = false
    let steer = gripSteer
    if (jumpNear) {
      // A jump ahead: let any drift go and line up, on the throttle (a release boost still fires)
      return { ...base, steer: gripSteer }
    }
    if (kart.drifting) {
      const dir = kart.driftDirection
      const slipWanted = Math.min(
        t.driftMaxSlip,
        Math.max(0.15, (Math.abs(want) / t.driftAlign) * 1.1),
      )
      const yaw = want + dir * (slipWanted - slip) * 4
      steer = clampSteer((yaw - dir * t.driftTurnRate) / t.driftSteerRate)
      const least = skill.releaseBoosts > 0 ? t.chainMinDrift + 0.02 : 0.1
      const done = Math.sign(noseWant) !== dir || Math.abs(want) < gripTurn * 0.5
      drift = kart.driftSeconds < least || !done
    } else if (
      speed > t.driftMinSpeed + 4 &&
      Math.abs(want) > gripTurn * skill.driftAt &&
      kart.traction >= 1
    ) {
      drift = true
      steer = Math.sign(want)
    } else if (
      skill.taps &&
      straight &&
      Math.abs(noseWant) < gripTurn * 0.25 &&
      kart.traction >= 1 &&
      kart.boostSeconds === 0 &&
      kart.miniSeconds < TAP_BEFORE_END &&
      speed > t.topSpeed * 0.6
    ) {
      const towards: -1 | 1 = noseWant > 0 ? 1 : -1
      const direction: -1 | 1 = Math.abs(noseWant) > 0.02 ? towards : lastTap === 1 ? -1 : 1
      lastTap = direction
      move = { kind: 'tap', direction, steps: TAP_STEPS - 1 }
      return { ...base, drift: true, steer: direction }
    }
    // Even a drift is not enough: slow down. A bot without release boosts keeps the throttle down
    // under the brake, so it never presses it afresh by accident
    const brake = Math.abs(want) > t.driftAlign * t.driftMaxSlip * BRAKE_AT && speed > 30
    const throttle = base.throttle && (!brake || skill.releaseBoosts === 0)
    return { ...base, throttle, brake, steer, drift }
  }

  return (trial, sense) => {
    let input = think(trial, sense)
    // The reset goes through at once, and only as one press
    if (input.reset) {
      queue.length = 0
      const pressed = !resetHeld
      resetHeld = true
      return pressed ? input : NO_INPUT
    }
    resetHeld = false
    if (trial.phase !== 'racing' || skill.reactionSteps <= 0) return input
    queue.push(input)
    input = queue.length > skill.reactionSteps ? queue.shift()! : (queue[0] ?? input)
    return input
  }
}
