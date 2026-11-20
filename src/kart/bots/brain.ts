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
import { TERRAIN_TUNING } from '../../../shared/kart/terrain.ts'
import { roadDirection, type RoadPoint } from '../../../shared/kart/track.ts'
import {
  acrossRoad,
  type DriftJumpCue,
  type TrackGuide,
} from '../../../shared/kart/tracks/guide.ts'
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
/**
 * The hands' own mark (2026-11-18, later: the dash is earned by any real drift, well short of this):
 * through a corner that goes on they still drift this deep and this long, which is the line that
 * holds the road. Radians, seconds
 */
const CLASSIC_HOLD_SLIP = (32 * Math.PI) / 180
const CLASSIC_HOLD_SECONDS = 0.45
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
/**
 * A jump into a corner (2026-11-19): the road is taken to turn where it has come round this far
 * past the lip, radians; a car must be down this many metres before that; never slower than this,
 * m/s
 */
const LANDING_TURN = 0.3
const LANDING_MARGIN = 6
const LANDING_SLOWEST = 34
/** A drift jump is begun this long before the lip at the latest, seconds: the tail must be out */
const DRIFT_JUMP_LEAST = 0.14
/** A drift jump's cue: the nose is steered to its mark in the air this hard, per radian */
const AIR_NOSE_GAIN = 6
/**
 * A slot on the technical line: the hands aim at it from this far before it, metres of road, until
 * the car is this near its line; the aim is this far beyond it, so that the car goes on straight
 */
const SLOT_FROM = 70
const SLOT_PASSED = 1.5
const SLOT_BEYOND = 10
/** ... nearer it than this the car is committed: straight on, whatever is left to correct */
const SLOT_COMMIT = 20
/** ... and from this far before it they line up: no new drift, no boost fired, the car straight */
const SLOT_CALM = 85
/**
 * The technical line is for a car at speed: after a reset, or coming to a drift jump slower than
 * this share of the top speed, the hands take the safe line for this many metres
 */
const TRICK_SPEED = 0.7
const SAFE_AFTER = 260
/** ... and goes back to the technical one only where the two are no further apart than this, metres */
const LINES_APART = 4

/** The racing line: the road's curvature is averaged over this far either way, metres ... */
const LINE_WINDOW = 28
/** ... a bend of this radius or tighter takes the line all the way to the inside ... */
const LINE_RADIUS = 60
/** ... which is this far in from the kerb, metres ... */
const LINE_KERB = 5
/** Past an island the line keeps this far from it at the most, metres ... */
const LANE_REACH = 12
/** ... from this many road points before it to this many after */
const LANE_LEAD = 6
/** ... but a bend this tight or tighter, metres, is taken down the middle, and one twice as wide in full */
const LINE_TIGHT = 35

type Move =
  | { readonly kind: 'none' }
  | { readonly kind: 'tap'; readonly direction: -1 | 1; readonly steps: number }
  | {
      readonly kind: 'lift'
      readonly steps: number
      readonly double: boolean
      /** The classic feel: the steer held while the throttle is up and pressed again (the counter-steer) */
      readonly counter?: number
      /** Steps the throttle still stays down before it comes up (slow hands: skill.exitWait) */
      readonly wait?: number
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
  /**
   * The track's own walls, on the road (2026-11-18): an island that splits it into two lanes. The
   * line keeps to one lane all the way past it: by skill (`shortcuts`) the one on the inside of the
   * bend, the shorter and tighter; otherwise the other
   */
  walls: readonly { ax: number; az: number; bx: number; bz: number }[] = [],
  /**
   * The track's guide, if it has one (2026-11-19, shared/kart/tracks/guide.ts): its safe line and,
   * by skill (`tricks`), the line through its shortcuts and the drift jumps that line asks for
   */
  guide?: TrackGuide,
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

  /** The next jump lip from road point `from` and how far along the road it is; Infinity with none */
  const nextJump = (from: number): { lip: number; ahead: number } => {
    let least = Infinity
    let which = -1
    for (const lip of jumps) {
      const ahead = (along[lip]! - along[from]! + total) % total
      if (ahead < least) {
        least = ahead
        which = lip
      }
    }
    return { lip: which, ahead: least }
  }

  // The guide's line for these hands: the shortcuts by skill, otherwise the safe one
  const tricks = (skill.tricks ?? false) && guide !== undefined
  const line = guide
    ? tricks
      ? { offsets: guide.tech, room: guide.techRoom }
      : { offsets: guide.safe, room: guide.safeRoom }
    : null
  const cues = new Map<number, DriftJumpCue>()
  const landings = new Map<number, { x: number; z: number }>()
  if (tricks) {
    for (const cue of guide!.cues) {
      cues.set(cue.lip, cue)
      landings.set(cue.lip, acrossRoad(road, cue.land[0], cue.land[1]))
    }
  }
  // The slots: where each is, which way the road runs through it and how far along the road
  const slots = (tricks ? guide!.slots : []).map((slot) => {
    const whole = ((Math.round(slot.index) % road.length) + road.length) % road.length
    return {
      ...acrossRoad(road, slot.index, slot.across),
      ...roadDirection(road, whole),
      at: along[whole]!,
    }
  })
  /** The slot the car is coming to, if it is within `metres` of road and not yet through it */
  const slotAhead = (x: number, z: number, nearest: number, metres: number) => {
    let found: (typeof slots)[number] | null = null
    let least = metres
    for (const slot of slots) {
      const ahead = (slot.at - along[nearest]! + total + 30) % total
      if (ahead - 30 > least) continue
      // Not yet through its line
      if ((slot.x - x) * slot.dx + (slot.z - z) * slot.dz < SLOT_PASSED) continue
      if (ahead - 30 < least) {
        least = ahead - 30
        found = slot
      }
    }
    return found
  }

  /**
   * How far the direction of travel comes round in the first `seconds` of a drift at speed, the
   * stick `into` it, radians (classic.ts: the slip swings out, and the turn bites as it does)
   */
  const driftTurn = (into: number, seconds: number): number => {
    const target = t.driftSlip + t.driftSlipSteer * into
    let turned = 0
    let slip = 0
    for (let time = 0; time < seconds; time += 1 / 60) {
      slip += (target - slip) * (1 - Math.exp(-Math.LN10 / 60 / Math.max(1 / 60, t.driftSlipIn)))
      const bite = 1 - t.driftLoose * (1 - Math.min(1, slip / Math.max(1e-3, t.driftSlip)))
      turned += (t.driftTurnRate * bite * (1 + t.driftSteerShare * into)) / 60
    }
    return turned
  }

  /** How far along the road a car that leaves `lip` at `speed` comes down, metres */
  const flightOver = (lip: number, speed: number): number => {
    const count = road.length
    const from = road[lip]!.y ?? 0
    let run = 0
    for (let index = lip + 1; index < lip + count; index++) {
      run += (along[index % count]! - along[(index - 1) % count]! + total) % total
      const time = run / speed
      const height =
        from + TERRAIN_TUNING.jumpLift * speed * time - (TERRAIN_TUNING.gravity * time * time) / 2
      if (height <= (road[index % count]!.y ?? 0)) return run
      if (run > 400) break
    }
    return run
  }

  // A jump into a corner (2026-11-19): the fastest a car may leave each lip and still be down
  // before the road turns. Lifting before the crest is the plain way through; the drift jump (a
  // cue) is the fast one
  const takeOff = new Map<number, number>()
  for (const lip of jumps) {
    const count = road.length
    let turned = 0
    let run = 0
    let before = roadDirection(road, lip)
    for (let index = lip + 1; index < lip + count && run < 160; index++) {
      const now = roadDirection(road, index % count)
      turned += Math.asin(clamp(before.dx * now.dz - before.dz * now.dx, -1, 1))
      run += (along[index % count]! - along[(index - 1) % count]! + total) % total
      before = now
      if (Math.abs(turned) >= LANDING_TURN) break
    }
    if (Math.abs(turned) < LANDING_TURN) continue
    const reach = Math.max(1, run - LANDING_MARGIN)
    // The fastest take-off whose flight (over the road as it falls or climbs beyond the lip) is
    // down within that reach
    let low = LANDING_SLOWEST
    let high = t.topSpeed * 2
    if (flightOver(lip, low) > reach) {
      takeOff.set(lip, low)
      continue
    }
    for (let pass = 0; pass < 12; pass++) {
      const middle = (low + high) / 2
      if (flightOver(lip, middle) > reach) high = middle
      else low = middle
    }
    if (low < t.topSpeed * 1.9) takeOff.set(lip, low)
  }

  /** How much the road turns over the next `metres` from road point `from`, radians, signed */
  const turnAhead = (from: number, metres: number): number => {
    const count = road.length
    let sum = 0
    let run = 0
    let before = roadDirection(road, from % count)
    for (let index = from + 1; run < metres && index < from + count; index++) {
      const now = roadDirection(road, index % count)
      sum += Math.asin(clamp(before.dx * now.dz - before.dz * now.dx, -1, 1))
      run += (along[index % count]! - along[(index - 1) % count]! + total) % total || 1
      before = now
    }
    return sum
  }

  let move: Move = NONE
  /** Straight down the middle for a jump: set each step before the line is worked out */
  let jumpLine = false
  /** The drift jump under way: begun before its lip, carried through the air */
  let carrying: DriftJumpCue | null = null
  /** Metres of road still to be driven on the safe line by hands that know the technical one */
  let fallback = 0
  let wasDrifting = false
  let boostPressed = false
  let lastTap: -1 | 1 = 1
  let startPlan: boolean | null = null
  let stuck = 0
  let wrong = 0
  let resetHeld = false
  /** The hands' answers, oldest first: the reaction time */
  const queue: KartInput[] = []

  // The racing line (2026-11-18, the technical tracks): how far towards the inside kerb each road
  // point is taken, -1 (hard left) to 1 (hard right): the road's curvature there, averaged over
  // LINE_WINDOW metres either way, so that the line clips each apex, crosses over between two esses
  // and straightens a chicane, but leaves a hairpin alone. By skill (`apex`): an easy bot stays in the middle of the road
  const inside: number[] = []
  if ((skill.apex ?? 0) > 0) {
    const count = road.length
    const headingAt = (index: number) => {
      const a = road[((index % count) + count) % count]!
      const b = road[(((index + 1) % count) + count) % count]!
      return Math.atan2(b.x - a.x, -(b.z - a.z))
    }
    const turned = road.map((_, index) => wrap(headingAt(index) - headingAt(index - 1)))
    for (let index = 0; index < count; index++) {
      let sum = 0
      let run = 0
      for (let near = index; run < LINE_WINDOW; near++) {
        sum += turned[near % count]!
        run += (along[(near + 1) % count]! - along[near % count]! + total) % total || 1
      }
      let back = 0
      for (let near = index - 1; back < LINE_WINDOW; near--) {
        const k = ((near % count) + count) % count
        sum += turned[k]!
        back += (along[(k + 1) % count]! - along[k]! + total) % total || 1
      }
      const curve = sum / (run + back)
      // A hairpin is taken down the middle: the slide of a drift needs the room on both sides
      const open = clamp(2 - Math.abs(curve) * LINE_TIGHT * 2, 0, 1)
      inside.push(clamp(curve * LINE_RADIUS, -1, 1) * open)
    }
  }

  // Islands: at each road point beside one, the lane the line keeps to, as an offset from the middle
  const lane = new Map<number, number>()
  if (walls.length > 0 && !line) {
    const count = road.length
    const band = new Map<number, { low: number; high: number }>()
    for (const wall of walls) {
      const index = nearestRoadPoint(road, wall.ax, wall.az)
      const { dx, dz } = roadDirection(road, index)
      const point = road[index]!
      // Metres to the right of the middle: the road's right is (-dz, dx)
      const across = (wall.ax - point.x) * -dz + (wall.az - point.z) * dx
      const known = band.get(index)
      band.set(index, {
        low: Math.min(known?.low ?? across, across),
        high: Math.max(known?.high ?? across, across),
      })
    }
    const indices = [...band.keys()].sort((a, b) => a - b)
    // Which way the road bends past the island, as a whole
    let bend = 0
    for (const index of indices) {
      const a = roadDirection(road, index)
      const b = roadDirection(road, (index + 1) % count)
      bend += a.dx * b.dz - a.dz * b.dx
    }
    const inner = bend >= 0 ? 1 : -1
    const side = skill.shortcuts ? inner : -inner
    for (const index of indices) {
      const { low, high } = band.get(index)!
      const half = road[index]!.width / 2
      // The middle of the lane on that side, but no further from the island than LANE_REACH
      const edge = side > 0 ? high : low
      const middle = (edge + side * half) / 2
      const target =
        side > 0 ? Math.min(middle, edge + LANE_REACH) : Math.max(middle, edge - LANE_REACH)
      for (let near = index - LANE_LEAD; near <= index + LANE_LEAD; near++) {
        const k = ((near % count) + count) % count
        if (!band.has(k) || k === index) lane.set(k, lane.get(k) ?? target)
      }
      lane.set(index, target)
    }
  }

  /** The line's offset from the middle at road point `index`, metres (+ is to the right) */
  const offsetAt = (index: number): number => {
    if (line) {
      // A guide's line, and its own room either side to wander and clip the apex in
      const cautious = tricks && fallback > 0
      const room = cautious ? guide!.safeRoom[index]! : line.room[index]!
      const middle = cautious ? guide!.safe[index]! : line.offsets[index]!
      if (jumpLine) return middle
      const sway = Math.sin(swayPhase + (along[index]! / SWAY_METRES) * Math.PI)
      const wander =
        room * Math.max(-0.6, Math.min(0.6, lineBase * skill.lineNoise + sway * skill.lineNoise))
      const apex = inside.length === 0 ? 0 : inside[index]! * (skill.apex ?? 0) * room
      return middle + clamp(wander + apex, -room, room)
    }
    const kept = lane.get(index)
    if (kept !== undefined) return kept
    const half = road[index]!.width / 2
    const sway = Math.sin(swayPhase + (along[index]! / SWAY_METRES) * Math.PI)
    const wander =
      half * Math.max(-0.6, Math.min(0.6, lineBase * skill.lineNoise + sway * skill.lineNoise))
    if (inside.length === 0) return wander
    const room = Math.max(0, half - LINE_KERB)
    return clamp(wander + inside[index]! * (skill.apex ?? 0) * room, -room, room)
  }

  /** The turn rate (rad/s, signed) that brings a car along `heading` onto the line `metres` ahead */
  const pursuit = (
    x: number,
    z: number,
    nearest: number,
    metres: number,
    speed: number,
    heading: number,
    /** Aim at a slot ahead, if there is one within the reach */
    aimAtSlots = false,
  ): number => {
    const ahead = pointAhead(road, nearest, metres)
    const { dx, dz } = roadDirection(road, ahead.index)
    // Right of the road's direction: heading 0 faces -z, clockwise
    const offset = jumpLine && !line ? 0 : offsetAt(ahead.index)
    let tx = ahead.x - dz * offset
    let tz = ahead.z + dx * offset
    const slot =
      aimAtSlots && slots.length > 0 && fallback === 0
        ? slotAhead(x, z, nearest, Math.min(metres, SLOT_FROM))
        : null
    if (slot) {
      // Through the middle of the slot, and straight on beyond it; committed once it is near
      const gap = Math.max(1e-3, Math.hypot(slot.x - x, slot.z - z))
      if (gap < SLOT_COMMIT) return 0
      tx = slot.x + ((slot.x - x) / gap) * SLOT_BEYOND
      tz = slot.z + ((slot.z - z) / gap) * SLOT_BEYOND
    }
    const angle = wrap(Math.atan2(tx - x, -(tz - z)) - heading)
    const distance = Math.max(1, Math.hypot(tx - x, tz - z))
    return (2 * Math.sin(angle) * Math.max(speed, 5)) / distance
  }

  const classic = t.model === MODEL_CLASSIC
  /** A whole number between the two, drawn; `fallback` (and nothing drawn) when the skill has none */
  const drawn = (range: readonly [number, number] | undefined, fallback: number): number =>
    range ? Math.round(range[0] + (range[1] - range[0]) * rng.float()) : fallback
  /** The lift that fires a dash, timed by skill: at once for two steps, or later and longer */
  const liftMove = (counter?: number): Extract<Move, { kind: 'lift' }> => ({
    kind: 'lift',
    steps: drawn(skill.liftSteps, LIFT_STEPS) - 1,
    double: false,
    counter,
    wait: drawn(skill.exitWait, 0),
  })
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
    nearest: number,
    /** The fastest the car may leave the jump ahead, m/s; Infinity for no limit */
    takeOffMost: number,
    /** Lining up for a slot: no new drift, no boost fired */
    lineUp: boolean,
  ): KartInput => {
    wasDrifting = kart.drifting
    const boostAt = skill.boostAt ?? 0.4
    const straight = Math.abs(later) < gripTurn * boostAt && Math.abs(want) < gripTurn * boostAt
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
    // The foot flat down (the scripted drivers, the expert) unless the rubber band eases it off
    const flat = skill.flatOut === true && sense.speedShare >= 1
    const cruising = calm && !flat && speed > t.topSpeed * Math.min(1, sense.speedShare)
    const gripSteer = clampSteer(noseWant / gripTurn)
    // Hands that do not mean to fire a dash that waits never press the throttle afresh by chance
    // (easing off at their own top speed and coming back on): the throttle stays as it was
    const waiting = kart.burstReady || kart.releaseWindow > 0
    const gas = waiting && !dashPlan ? kart.throttleHeld : !cruising
    const base = { ...NO_INPUT, throttle: gas, boost: fire }

    if (move.kind === 'tap' || move.kind === 'double') move = NONE
    if (move.kind === 'lift') {
      // A dash waiting (the car still sliding, or just straightened): lift, then press afresh
      const { steps, double, counter, wait = 0 } = move
      const steer = counter !== undefined && kart.slideDirection !== 0 ? counter : gripSteer
      if (wait > 0) {
        // Slow hands: the drift is let go, the throttle still down for a moment
        move = { kind: 'lift', steps, double, counter, wait: wait - 1 }
        return { ...base, throttle: kart.throttleHeld, steer }
      }
      if (steps > 0) {
        move = { kind: 'lift', steps: steps - 1, double, counter }
        return { ...base, throttle: false, steer }
      }
      move = NONE
      return { ...base, throttle: true, steer }
    }
    if (kart.releaseWindow > 0 && dashPlan) {
      move = { ...liftMove(), wait: 0 }
      return { ...base, throttle: false, steer: gripSteer }
    }
    // Sliding out of a drift that earned a dash (let go for a jump, or too slow to hold)
    if (!kart.drifting && kart.slideDirection !== 0 && kart.burstReady && dashPlan && !jumpNear) {
      const counter = -kart.slideDirection
      move = { ...liftMove(counter), wait: 0 }
      return { ...base, throttle: false, steer: counter }
    }

    if (jumpNear) {
      entering = NOT_ENTERING
      // A jump into a corner: off the throttle before the crest (and on the brake, well over)
      const fast = speed > takeOffMost
      return {
        ...base,
        throttle: base.throttle && !fast,
        boost: base.boost && !fast,
        brake: speed > takeOffMost + 3,
        steer: gripSteer,
      }
    }

    const turnMost = t.driftTurnRate * (1 + t.driftSteerShare)
    const holdSlip = Math.max(t.dashMinSlip, CLASSIC_HOLD_SLIP)
    const holdSeconds = Math.max(t.dashMinSeconds, CLASSIC_HOLD_SECONDS)
    /** How far into a drift the stick must be for the slip to pass dashMinSlip, with a margin */
    const deepInto = clamp(
      (holdSlip + CLASSIC_DEEP_MARGIN - t.driftSlip) / Math.max(1e-3, t.driftSlipSteer),
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
        kart.driftSeconds >= holdSeconds - CLASSIC_NEARLY_SECONDS &&
        (kart.driftPeak ?? 0) >= holdSlip - CLASSIC_NEARLY_SLIP
      const held = (kart.driftPeak ?? 0) >= holdSlip && kart.driftSeconds >= holdSeconds
      // By skill, every drift is seen through: long enough to be worth its bonus
      const committed =
        skill.holdSeconds !== undefined &&
        (kart.driftSeconds < skill.holdSeconds || !kart.burstReady)
      const earning = dashPlan && ((!held && (goesOn || nearly)) || committed)
      if (earning && (kart.driftPeak ?? 0) < holdSlip) into = Math.max(into, deepInto)
      // The corner is over (or the car has come round too far) and no dash is about to be earned.
      // Through a long bend the drift is held, steering out of it, not let go and begun again
      const over =
        Math.sign(want) !== dir ||
        (Math.abs(want) < gripTurn * CLASSIC_END_NOW &&
          Math.abs(later) < gripTurn * CLASSIC_END_LATER)
      const done = (kart.driftSeconds > 0.15 && over && !earning) || lineUp
      if (done) {
        // Out of the corner: let go, counter-steer and lift, then press afresh for the dash; or
        // just let go
        if (dashPlan && kart.burstReady) {
          const lift = liftMove(-dir)
          move = lift
          const waits = (lift.wait ?? 0) > 0
          return { ...base, throttle: waits ? kart.throttleHeld : false, steer: -dir }
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
    // By skill, only into a corner big enough to hold a drift through
    const worthIt =
      skill.cornerTurn === undefined ||
      turnAhead(nearest, 24 + speed * 0.8) * Math.sign(want) >= skill.cornerTurn
    if (
      speed > t.driftMinSpeed + 4 &&
      Math.abs(want) > gripTurn * skill.driftAt &&
      worthIt &&
      !lineUp
    ) {
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
    // Back to the technical line only where the two lines run together
    if (fallback > 0) {
      const here = nearestRoadPoint(road, kart.x, kart.z)
      const apart = Math.abs(guide!.tech[here]! - guide!.safe[here]!) > LINES_APART
      fallback = Math.max(apart ? 1 : 0, fallback - speed / 60)
    }
    if (stuck > STUCK_STEPS || wrong > WRONG_STEPS) {
      stuck = 0
      wrong = 0
      move = NONE
      carrying = null
      if (tricks) fallback = SAFE_AFTER
      return { ...NO_INPUT, reset: true }
    }

    const nearest = nearestRoadPoint(road, kart.x, kart.z)
    // In the air: hold the throttle for the landing boost, the nose kept in line with the flight
    if ((kart.air ?? 0) > 0) {
      move = NONE
      wasDrifting = false
      const flight = Math.atan2(kart.vx, -kart.vz)
      if (carrying && (kart.airDrift ?? 0) !== 0) {
        // A drift jump: the drift key held, the nose swung out to the cue's mark for the landing
        const out = wrap(kart.heading - flight) * carrying.way
        return {
          ...NO_INPUT,
          throttle: true,
          drift: true,
          steer: carrying.way * clampSteer((carrying.nose - out) * AIR_NOSE_GAIN),
        }
      }
      return { ...NO_INPUT, throttle: true, steer: clampSteer(wrap(flight - kart.heading) * 4) }
    }
    const jump = jumps.length > 0 ? nextJump(nearest) : { lip: -1, ahead: Infinity }
    let cue = fallback > 0 ? undefined : cues.get(jump.lip)
    // Too slow for it (a crash just before): the plain way this time
    if (cue && !carrying && jump.ahead <= 60 && speed < t.topSpeed * TRICK_SPEED) {
      fallback = SAFE_AFTER
      cue = undefined
    }
    // A drift jump (by skill, where the guide has a cue): the drift begun this long before the lip,
    // measured to the lip's own line (a road point is too coarse for a fifth of a second)
    const lipAt = cue ? road[cue.lip]! : null
    const lipWay = cue ? roadDirection(road, cue.lip) : null
    const toLip =
      lipAt && lipWay ? (lipAt.x - kart.x) * lipWay.dx + (lipAt.z - kart.z) * lipWay.dz : Infinity
    // Begun just early enough to have come round to the cue's angle at the lip, from the way the
    // car is going now; never later than it takes for the tail to be out
    let begin = false
    if (cue && lipWay && jump.ahead <= 60) {
      // From where the car will cross the lip to where the flight is to come down
      const land = landings.get(cue.lip)!
      const travel = Math.atan2(kart.vx, -kart.vz)
      const crossX = kart.x + Math.sin(travel) * toLip
      const crossZ = kart.z - Math.cos(travel) * toLip
      const turn = wrap(Math.atan2(land.x - crossX, -(land.z - crossZ)) - travel) * cue.way
      const left = toLip / Math.max(1, speed) - (skill.reactionSteps + 1) / 60
      begin = carrying === cue || left <= DRIFT_JUMP_LEAST || driftTurn(cue.into, left) <= turn
    }
    if (cue && begin) {
      carrying = cue
      move = NONE
      return {
        ...NO_INPUT,
        throttle: speed <= (cue.most ?? Infinity),
        brake: speed > (cue.most ?? Infinity) + 3,
        drift: true,
        steer: cue.way * Math.max(0.12, cue.into),
      }
    }
    if (carrying && !kart.drifting) carrying = null
    const jumpNear = jump.ahead < JUMP_CLEAR + speed * JUMP_SECONDS
    if (jumpNear && (move.kind === 'tap' || move.kind === 'double')) move = NONE
    jumpLine = jumpNear
    const takeOffMost = !jumpNear
      ? Infinity
      : cue
        ? (cue.most ?? Infinity)
        : (takeOff.get(jump.lip) ?? Infinity)
    const travel = speed > 3 ? Math.atan2(kart.vx, -kart.vz) : kart.heading
    // Slow hands look further ahead, to make up for answering late
    const reach = 14 + speed * (REACH + skill.reactionSteps / 120)
    const want = pursuit(kart.x, kart.z, nearest, reach, speed, travel, true)
    const noseWant = pursuit(kart.x, kart.z, nearest, reach, speed, kart.heading, true)
    const later = pursuit(kart.x, kart.z, nearest, 30 + speed * 0.9, speed, travel)
    const gripTurn = t.turnRate * (1 - t.turnLossAtTopSpeed * Math.min(1, speed / t.topSpeed))
    const slip = Math.abs(wrap(kart.heading - travel))
    if (classic) {
      return classicHands(
        kart,
        sense,
        speed,
        want,
        noseWant,
        later,
        gripTurn,
        jumpNear,
        slip,
        nearest,
        takeOffMost,
        slots.length > 0 &&
          fallback === 0 &&
          slotAhead(kart.x, kart.z, nearest, SLOT_CALM) !== null,
      )
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
