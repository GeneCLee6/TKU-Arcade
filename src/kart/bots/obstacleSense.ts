// 2026-11-22 (#103, docs/ARCHITECTURE.md §4.64): the computer's hands and the moving obstacles
// (shared/kart/obstacles.ts). Laid over the hands of routes.ts, so that brain.ts itself knows
// nothing of them: on a track without obstacles the hands are exactly what they were.
//
// Coming to an obstacle, the hands work out when they will reach it at the speed they have, and
// what of the road across it will be in the way then (a boom down, a box wherever it slides to),
// a little before and after. If the line they are on goes through the free part, nothing changes.
// If not, they steer for the nearest free part (the other lane, round the box); and if nothing is
// free when they get there (a boom across the whole road), they come off the throttle and brake to
// wait short of it, and go once the way stays open long enough to get through. Everything they
// need is the race clock (the trial's steps) and the track: the same wait or the same way round in
// every browser, in the load test and in the scripted drivers.
import {
  blockedAcross,
  obstaclesOf,
  type Obstacle,
} from '../../../shared/kart/obstacles.ts'
import type { KartTuning } from '../../../shared/kart/physics.ts'
import type { Track } from '../../../shared/kart/track.ts'
import { KART_RADIUS } from '../../../shared/kart/walls.ts'
import type { BotBrain } from './brain.ts'

/** Obstacles further ahead than this, metres, are not looked at yet */
export const OBSTACLE_LOOK = 70
/** Room kept from anything in the way, metres beyond the kart's own radius */
const CLEAR = 1
/** ... or as far as this many seconds at the kart's speed */
const LOOK_SECONDS = 2.2
/** Nearer than this, metres, the hands hold the kart inside the free stretch themselves */
const HOLD = 14
/** Room kept from the kerbs at an obstacle, metres from the road's middle to its edge */
const KERB = 1.8
/** The time either side of the arrival looked at, steps: early ... */
const EARLY = 12
/** ... and late, plus the time to get past the obstacle's own length */
const LATE = 14
/** Nearer than this to an obstacle, metres, a kart that has set off past it keeps going */
const COMMIT = 10
/** ... and then only looks this many steps ahead */
const COMMITTED_LOOK = 20
/**
 * A kart held still by these hands this many steps hands itself back to the brain (whose reset
 * comes for a kart stuck) until it is past the obstacle: never stuck for good on a misjudgement
 */
const GIVE_UP = 240
/** A crossing this near a free stretch, metres, is in it (the hands hold it inside) */
const NEAR_FREE = 1.2
/** Steps between two looks at the window */
const EVERY = 3
/** The arrival is worked out from at least this speed, m/s, so that a kart waiting goes */
const SLOWEST = 9
/** A waiting kart stops this far short of a boom's line or a box's near side, metres */
const STOP_SHORT = 3.5
/** How hard the hands steer for a free lane: radians off the nose for a full lock */
const LOCK = 0.45

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Where the kart is from the obstacle: metres ahead along the road (negative: before it) and right */
export function relativeTo(obstacle: Obstacle, x: number, z: number): { along: number; right: number } {
  const rx = x - obstacle.x
  const rz = z - obstacle.z
  return { along: rx * obstacle.dx + rz * obstacle.dz, right: rx * -obstacle.dz + rz * obstacle.dx }
}

/** How far before a kart must stop, metres from the obstacle's line: its box's near side for a slider */
const nearSide = (obstacle: Obstacle): number =>
  obstacle.json.kind === 'slider' ? obstacle.json.length / 2 : 0

/**
 * The free stretches across the road at the obstacles standing at one place, for a kart arriving
 * between `from` and `to` (steps): the road between the kerbs, less everything in the way at any
 * step of that window, each widened by the kart and some room. Low to high, metres right of the middle
 */
export function freeAcross(
  obstacles: readonly Obstacle[],
  from: number,
  to: number,
): (readonly [number, number])[] {
  const first = obstacles[0]!
  const reach = KART_RADIUS + CLEAR
  const blocked: [number, number][] = []
  for (let tick = Math.floor(from); tick <= Math.ceil(to); tick += EVERY) {
    for (const obstacle of obstacles) {
      const span = blockedAcross(obstacle, tick)
      if (span) blocked.push([span[0] - reach, span[1] + reach])
    }
  }
  for (const obstacle of obstacles) {
    const span = blockedAcross(obstacle, Math.ceil(to))
    if (span) blocked.push([span[0] - reach, span[1] + reach])
  }
  blocked.sort((a, b) => a[0] - b[0])
  const free: [number, number][] = []
  let low = -first.half + KERB
  const high = first.half - KERB
  for (const [start, end] of blocked) {
    if (start > low) free.push([low, Math.min(start, high)])
    low = Math.max(low, end)
    if (low >= high) break
  }
  if (low < high) free.push([low, high])
  return free.filter(([a, b]) => b - a > 0.2)
}

/**
 * `brain`, minding the moving obstacles of `track`; `brain` itself on a track without any. Looks
 * only while racing (the countdown holds the kart, the finish has no clock)
 */
export function withObstacles(brain: BotBrain, track: Track, tuning: KartTuning): BotBrain {
  const all = obstaclesOf(track)
  if (all.length === 0) return brain
  // The obstacles standing at one place (two booms over the two halves of the road) are one
  const groups: Obstacle[][] = []
  for (const obstacle of all) {
    const same = groups.find(
      (group) =>
        Math.hypot(group[0]!.x - obstacle.x, group[0]!.z - obstacle.z) < 1 &&
        group[0]!.dx * obstacle.dx + group[0]!.dz * obstacle.dz > 0.99,
    )
    if (same) same.push(obstacle)
    else groups.push([obstacle])
  }
  /** The group the kart has set off past, until it is behind it */
  let committed: Obstacle[] | null = null
  /** Steps held still in front of the group ahead, and the group given up on */
  let held = 0
  let givenUp: Obstacle[] | null = null
  return (trial, sense) => {
    const input = brain(trial, sense)
    if (trial.phase !== 'racing') {
      committed = null
      return input
    }
    const { kart } = trial.run
    const speed = Math.hypot(kart.vx, kart.vz)
    const look = Math.max(OBSTACLE_LOOK, speed * LOOK_SECONDS)
    // The nearest group not yet behind the kart: on its road, the kart going its way
    let ahead: Obstacle[] | null = null
    let distance = Infinity
    for (const group of groups) {
      const head = group[0]!
      const { along, right } = relativeTo(head, kart.x, kart.z)
      const gap = -along - nearSide(head)
      if (along > nearSide(head) + KART_RADIUS || -along > look) continue
      if (Math.abs(right) > head.half + 6) continue
      // Pointing its way: a kart turned across the road (or stuck) is the brain's to sort out
      const facing = Math.sin(kart.heading) * head.dx - Math.cos(kart.heading) * head.dz
      if (facing < 0.7) continue
      if (gap < distance) {
        distance = gap
        ahead = group
      }
    }
    if (committed !== ahead) committed = null
    if (givenUp !== ahead) givenUp = null
    if (!ahead || givenUp === ahead) {
      held = 0
      return input
    }
    held = speed < 2 ? held + 1 : 0
    if (held > GIVE_UP) {
      givenUp = ahead
      held = 0
      return input
    }
    const head = ahead[0]!
    const { along, right } = relativeTo(head, kart.x, kart.z)
    const pace = Math.max(speed, SLOWEST)
    const length = nearSide(head) * 2
    // Alongside (a box): what is in the way until the kart is past it; before it: at the arrival
    const alongside = distance < 0
    const arrive = trial.steps + (Math.max(0, distance) / pace) * 60
    const pass = ((length + 2 * KART_RADIUS + 1 - (alongside ? -distance : 0)) / pace) * 60
    // Set off past it: only what comes into the way in the next moment counts now
    const going = committed === ahead
    const free = going
      ? freeAcross(ahead, trial.steps, trial.steps + COMMITTED_LOOK)
      : freeAcross(
          ahead,
          alongside ? trial.steps : arrive - EARLY,
          (alongside ? trial.steps : arrive) + pass + LATE,
        )
    // Where the kart will cross: where it is, carried on across by the way it is going
    const sideways = kart.vx * -head.dz + kart.vz * head.dx
    const crossing = alongside
      ? right
      : right + clamp(sideways, -12, 12) * Math.min(1, Math.max(0, distance) / pace) * 0.5
    const calm = input
    /** Straight along the road towards `target` metres right of the middle, `beyond` m on */
    const steerFor = (target: number, beyond: number) => {
      const forward = Math.max(along + beyond, along + 4)
      const tx = head.x - head.dz * target + head.dx * forward
      const tz = head.z + head.dx * target + head.dz * forward
      const angle = wrap(Math.atan2(tx - kart.x, -(tz - kart.z)) - kart.heading)
      return clamp(angle / LOCK, -1, 1)
    }
    if (alongside && !free.some(([a, b]) => crossing >= a - NEAR_FREE && crossing <= b + NEAR_FREE)) {
      // Beside a box with no better line: on past it, straight along the road
      return { ...calm, steer: steerFor(right, 10), throttle: true, brake: false, drift: false, reset: false }
    }
    const within = free.find(([a, b]) => crossing >= a - NEAR_FREE && crossing <= b + NEAR_FREE)
    if (within && distance < COMMIT) committed = ahead
    if (within) {
      // On a free line: the brain's own hands far off; near, held inside the free stretch
      if (distance > HOLD) return input
      const [a, b] = within
      const edge = Math.min(1, (b - a) / 2)
      const target = clamp(right, a + edge, b - edge)
      return {
        ...calm,
        steer: steerFor(target, Math.max(10, speed * 0.4)),
        drift: false,
        // Set off: on through it, whatever the brain thinks of standing still
        ...(going ? { throttle: true, brake: false, reset: false } : {}),
      }
    }
    if (free.length > 0) {
      // Steer for the nearest free stretch: to its middle, or to the near end of a wide one
      let target = 0
      let least = Infinity
      for (const [a, b] of free) {
        const edge = Math.min(1.5, (b - a) / 2)
        const goal = clamp(crossing, a + edge, b - edge)
        if (Math.abs(goal - crossing) < least) {
          least = Math.abs(goal - crossing)
          target = goal
        }
      }
      const shift = Math.abs(target - right)
      const steep = shift / Math.max(1, distance)
      if (!alongside && (steep < 1.2 || speed > 4)) {
        // Too far across to make at this speed: off the throttle, and the brake when it is hopeless
        return {
          ...calm,
          steer: steerFor(target, Math.max(4, Math.min(12, distance * 0.3))),
          drift: false,
          boost: false,
          throttle: (input.throttle || speed < 6) && (steep < 0.6 || distance > 25 || speed < 6),
          brake: steep > 0.9 && speed > 8,
        }
      }
      // Nose up against it, or beside it, no way round from here: wait for it to clear
    }
    // Nothing free when the kart gets there: wait short of it
    const room = Math.max(0, distance - STOP_SHORT)
    const needed = (speed * speed) / (2 * Math.max(0.5, room))
    // ... and never reset for standing still in front of it
    return {
      ...calm,
      reset: false,
      steer: input.steer,
      drift: false,
      boost: false,
      throttle: room > 12 && needed < tuning.braking * 0.35,
      brake: (needed > tuning.braking * 0.5 || room < 2) && speedForward(kart) > 0.5,
    }
  }
}

/** The kart's speed along its nose (backwards negative): the brake is the reverse below zero */
function speedForward(kart: { vx: number; vz: number; heading: number }): number {
  return kart.vx * Math.sin(kart.heading) - kart.vz * Math.cos(kart.heading)
}
