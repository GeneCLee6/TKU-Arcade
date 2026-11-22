// 2026-11-22 (#103, docs/ARCHITECTURE.md §4.65): moving obstacles. A track may list booms that come
// down across part of the road and go up again, and containers that slide across it, each on a
// cycle of its own. What any of them is doing is a pure function of the race clock (the steps of
// 1/60 s since GO, the `tick` every frame already carries; net.ts), so that every browser, the
// Worker's judge (race.ts), a replay and a ghost all see the same boom down at the same moment
// without a byte more on the wire. A track without obstacles has none of this: course.ts steps it
// exactly as it always did.
//
// - A boom closes the stretch of road between `from` and `to` metres right of the middle (a whole
//   road, or one lane of it): a wall while it is down, nothing while it is up. Before it comes down
//   it is warned of for `warn` steps (lamps and a bell: src/kart/art/obstacleArt.ts); the arm is
//   drawn coming down in the warning's last moments and going up in the first moments after it
//   opens, and is a wall exactly while it is closed.
// - A slider is a box `length` along the road and `size` across it, sliding between `a` and `b`
//   metres right of the middle: it holds at one end, slides across in `move` steps, holds at the
//   other and slides back, once each `period`. Its four sides are walls wherever it is at that step;
//   a kart in its way is pushed along in front of it (walls.ts pushes a kart out of any wall it is
//   in), never through it. It is warned of for `warn` steps before each slide.
//
// Pure: the browser, the Worker and the load test run it.
import { roadDirection, type RoadPoint } from './track.ts'
import type { Wall } from './walls.ts'

/** Steps of 1/60 s: the race clock's own unit (net.ts) */
export const OBSTACLE_STEPS_PER_SECOND = 60
/** The arm is drawn coming down over the warning's last this many steps ... */
export const BOOM_LOWER_STEPS = 18
/** ... and going up over the opening's first this many */
export const BOOM_RAISE_STEPS = 30
/** A container is this tall: a kart in the air above it flies over (walls.ts `top`) */
export const SLIDER_HEIGHT = 2.6
/**
 * A box never comes nearer a kerb than this, metres: a kart it pushes ahead of it across the road
 * still fits between them (two of its radii and some room), never squeezed into the kerb
 */
export const SLIDER_KERB_GAP = 3
/** At most this many on a track */
export const MAX_OBSTACLES = 16

export interface BoomJson {
  readonly kind: 'boom'
  /** The main road point it stands across (a fraction is between two) */
  readonly at: number
  /** The road it closes: from `from` to `to` metres right of the middle (negative: left) */
  readonly from: number
  readonly to: number
  /** Its cycle, steps long */
  readonly period: number
  /** The step of the cycle it is down from, counted from GO */
  readonly shift: number
  /** Steps it stays down */
  readonly closed: number
  /** Steps it is warned of before it comes down */
  readonly warn: number
}

export interface SliderJson {
  readonly kind: 'slider'
  readonly at: number
  /** The box: metres along the road and across it */
  readonly length: number
  readonly size: number
  /** Its middle slides between these, metres right of the road's middle */
  readonly a: number
  readonly b: number
  readonly period: number
  /** The step of the cycle that begins its hold at `a`, counted from GO */
  readonly shift: number
  /** Steps each slide across takes */
  readonly move: number
  /** Steps each slide is warned of */
  readonly warn: number
}

export type ObstacleJson = BoomJson | SliderJson

/** An obstacle, checked, with where it is worked out */
export interface Obstacle {
  readonly json: ObstacleJson
  /** The place on the road's middle it stands across, the road's height there */
  readonly x: number
  readonly z: number
  readonly y: number
  /** The road's direction there (unit), and its right: (-dz, dx) */
  readonly dx: number
  readonly dz: number
  /** Half the road's width there */
  readonly half: number
  /** A boom: its line while down (from `from` to `to`); null for a slider */
  readonly line: Wall | null
}

export interface ObstacleState {
  /** A boom: down (a wall). A slider: always true (it is always in the way somewhere) */
  readonly closed: boolean
  /** Lamps flashing and the bell: a boom about to come down, a slider about to slide */
  readonly warn: boolean
  /** A boom: how far down the arm is drawn, 0 (up) to 1 (down). A slider: 1 while it slides */
  readonly shut: number
  /** A slider: its middle, metres right of the road's middle. A boom: 0 */
  readonly across: number
}

const mod = (value: number, by: number): number => ((value % by) + by) % by
const ease = (t: number): number => t * t * (3 - 2 * t)

/** Where a boom is in its cycle at `tick` (a fraction is fine, for drawing) */
export function boomState(boom: BoomJson, tick: number): ObstacleState {
  const t = mod(tick - boom.shift, boom.period)
  const closed = t < boom.closed
  const warn = !closed && t >= boom.period - boom.warn
  const shut = closed
    ? 1
    : t >= boom.period - BOOM_LOWER_STEPS
      ? (t - (boom.period - BOOM_LOWER_STEPS)) / BOOM_LOWER_STEPS
      : t < boom.closed + BOOM_RAISE_STEPS
        ? 1 - (t - boom.closed) / BOOM_RAISE_STEPS
        : 0
  return { closed, warn, shut: Math.max(0, Math.min(1, shut)), across: 0 }
}

/** Where a slider is in its cycle at `tick` */
export function sliderState(slider: SliderJson, tick: number): ObstacleState {
  const t = mod(tick - slider.shift, slider.period)
  const half = slider.period / 2
  const hold = half - slider.move
  let across: number
  let moving = false
  if (t < hold) across = slider.a
  else if (t < half) {
    across = slider.a + (slider.b - slider.a) * ease((t - hold) / slider.move)
    moving = true
  } else if (t < half + hold) across = slider.b
  else {
    across = slider.b + (slider.a - slider.b) * ease((t - half - hold) / slider.move)
    moving = true
  }
  const warn =
    (t >= hold - slider.warn && t < hold) || (t >= half + hold - slider.warn && t < half + hold)
  return { closed: true, warn, shut: moving ? 1 : 0, across }
}

export const obstacleState = (obstacle: Obstacle, tick: number): ObstacleState =>
  obstacle.json.kind === 'boom'
    ? boomState(obstacle.json, tick)
    : sliderState(obstacle.json, tick)

/** The place `across` metres right of the obstacle's spot on the road's middle */
export const besideObstacle = (obstacle: Obstacle, across: number): { x: number; z: number } => ({
  x: obstacle.x - obstacle.dz * across,
  z: obstacle.z + obstacle.dx * across,
})

/** A slider's four corners at `across`: near left, near right, far right, far left */
export function sliderCorners(
  obstacle: Obstacle,
  slider: SliderJson,
  across: number,
): { x: number; z: number }[] {
  const along = slider.length / 2
  const side = slider.size / 2
  const at = (forward: number, right: number) => ({
    x: obstacle.x + obstacle.dx * forward - obstacle.dz * (across + right),
    z: obstacle.z + obstacle.dz * forward + obstacle.dx * (across + right),
  })
  return [at(-along, -side), at(-along, side), at(along, side), at(along, -side)]
}

/** Every boom's down wall, made once */
const downWalls = new WeakMap<Obstacle, readonly Wall[]>()

/**
 * The walls the obstacles make at `tick`: each boom that is down, each slider where it is. Empty
 * when none is in the way (most steps, on most of the road)
 */
export function obstacleWalls(obstacles: readonly Obstacle[], tick: number): Wall[] {
  const walls: Wall[] = []
  for (const obstacle of obstacles) {
    const { json } = obstacle
    if (json.kind === 'boom') {
      if (!boomState(json, tick).closed) continue
      let down = downWalls.get(obstacle)
      if (!down) {
        down = [obstacle.line!]
        downWalls.set(obstacle, down)
      }
      walls.push(...down)
      continue
    }
    const { across } = sliderState(json, tick)
    const corners = sliderCorners(obstacle, json, across)
    const top = Math.round((obstacle.y + SLIDER_HEIGHT) * 100) / 100
    corners.forEach((a, index) => {
      const b = corners[(index + 1) % corners.length]!
      walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, top })
    })
  }
  return walls
}

/** Whether segments p0-p1 and q0-q1 cross (touching counts) */
function segmentsCross(
  p0: { x: number; z: number },
  p1: { x: number; z: number },
  q0: { x: number; z: number },
  q1: { x: number; z: number },
): boolean {
  const cross = (a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
  const d1 = cross(q0, q1, p0)
  const d2 = cross(q0, q1, p1)
  const d3 = cross(p0, p1, q0)
  const d4 = cross(p0, p1, q1)
  return d1 * d2 <= 0 && d3 * d4 <= 0 && !(d1 === 0 && d2 === 0)
}

/** A slider counts as passed through only this far inside it: a bump may push a kart a little in */
export const SLIDER_JUDGE_INSET = 0.6

/**
 * The Worker's judge (race.ts): whether a kart's move from `from` (at tick `fromTick`) to `to` (at
 * `toTick`) went through an obstacle that was in the way the whole time. A boom down at both ticks,
 * and down all the steps between (its closing is one stretch of its cycle), whose line the move
 * crosses; or a slider the kart ends up inside (by more than SLIDER_JUDGE_INSET) at `toTick`. A
 * boom that came down or went up during the move is given the benefit of the doubt
 */
export function throughObstacle(
  obstacles: readonly Obstacle[],
  from: { x: number; z: number },
  fromTick: number,
  to: { x: number; z: number },
  toTick: number,
  /** A kart in the air (FLAG_AIRBORNE) may be over a box, which is only so tall */
  airborne = false,
): boolean {
  for (const obstacle of obstacles) {
    const { json } = obstacle
    if (json.kind === 'boom') {
      if (toTick - fromTick >= json.closed) continue
      if (!boomState(json, fromTick).closed || !boomState(json, toTick).closed) continue
      // Down at both ends of a stretch shorter than its closing: down all the way between, unless
      // the stretch wrapped round the cycle (then it was up in between)
      const start = mod(fromTick - json.shift, json.period)
      if (start + (toTick - fromTick) >= json.closed) continue
      const line = obstacle.line!
      if (segmentsCross(from, to, { x: line.ax, z: line.az }, { x: line.bx, z: line.bz })) {
        return true
      }
      continue
    }
    if (airborne) continue
    const { across } = sliderState(json, toTick)
    // In the box's own frame: along the road and across it from its middle
    const rx = to.x - obstacle.x
    const rz = to.z - obstacle.z
    const along = rx * obstacle.dx + rz * obstacle.dz
    const right = rx * -obstacle.dz + rz * obstacle.dx - across
    if (
      Math.abs(along) < json.length / 2 - SLIDER_JUDGE_INSET &&
      Math.abs(right) < json.size / 2 - SLIDER_JUDGE_INSET
    ) {
      return true
    }
  }
  return false
}

/**
 * The stretch of road across the obstacle that is in the way at `tick`, metres right of the
 * middle, [low, high]; null when nothing is
 */
export function blockedAcross(obstacle: Obstacle, tick: number): readonly [number, number] | null {
  const { json } = obstacle
  if (json.kind === 'boom') {
    return boomState(json, tick).closed ? [json.from, json.to] : null
  }
  const { across } = sliderState(json, tick)
  return [across - json.size / 2, across + json.size / 2]
}

// ── Checking ───────────────────────────────────────────────────────────────────────────────────

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const isStep = (value: unknown, least: number, most: number): value is number =>
  Number.isInteger(value) && (value as number) >= least && (value as number) <= most

/** The road's middle at road point `at` (a fraction is between two), its height, direction and half width */
function spotOn(road: readonly RoadPoint[], at: number) {
  const count = road.length
  const whole = Math.floor(at)
  const share = at - whole
  const i = ((whole % count) + count) % count
  const j = (i + 1) % count
  const a = road[i]!
  const b = road[j]!
  const da = roadDirection(road, i)
  const db = roadDirection(road, j)
  const dx = da.dx + (db.dx - da.dx) * share
  const dz = da.dz + (db.dz - da.dz) * share
  const length = Math.hypot(dx, dz) || 1
  return {
    x: a.x + (b.x - a.x) * share,
    z: a.z + (b.z - a.z) * share,
    y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * share,
    dx: dx / length,
    dz: dz / length,
    half: (a.width + (b.width - a.width) * share) / 2,
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000

/** The obstacle `json` stands for on `road`, worked out (the json taken as checked) */
export function placeObstacle(road: readonly RoadPoint[], json: ObstacleJson): Obstacle {
  const spot = spotOn(road, json.at)
  const base = {
    json,
    x: round(spot.x),
    z: round(spot.z),
    y: round(spot.y),
    dx: spot.dx,
    dz: spot.dz,
    half: spot.half,
  }
  if (json.kind === 'slider') return { ...base, line: null }
  const a = besideObstacle({ ...base, line: null }, json.from)
  const b = besideObstacle({ ...base, line: null }, json.to)
  return { ...base, line: { ax: round(a.x), az: round(a.z), bx: round(b.x), bz: round(b.z) } }
}

/**
 * The obstacles of a track (TrackJson.obstacles), checked against its road; every problem goes in
 * `problems`. A boom: its stretch inside the kerbs (a metre and a half over them at most) and at
 * least 3 m long; a cycle of 1 to 60 s, down at least half a second, warned at least half a second,
 * up at least half a second. A slider: a box of 2 to 20 m by 2 to 16 m that never leaves the road
 * by more than a metre, warned at least half a second before each slide, which takes at least half
 * a second
 */
export function parseObstacles(
  value: unknown,
  road: readonly RoadPoint[],
  problems: string[],
): ObstacleJson[] {
  if (!Array.isArray(value)) {
    problems.push('obstacles: not a list')
    return []
  }
  if (value.length > MAX_OBSTACLES) problems.push(`obstacles: more than ${MAX_OBSTACLES}`)
  const out: ObstacleJson[] = []
  value.slice(0, MAX_OBSTACLES).forEach((item: unknown, index) => {
    const at = `obstacles[${index}]`
    if (typeof item !== 'object' || item === null) {
      problems.push(`${at}: not an object`)
      return
    }
    const o = item as Record<string, unknown>
    if (!isNumber(o.at) || o.at < 0 || o.at >= road.length) {
      problems.push(`${at}: at must be a road point`)
      return
    }
    const half = spotOn(road, o.at).half
    const cycle = isStep(o.period, 60, 3600) && isStep(o.shift, 0, (o.period as number) - 1)
    if (!cycle) {
      problems.push(`${at}: period 60 to 3600 steps, shift within it`)
      return
    }
    const period = o.period as number
    if (o.kind === 'boom') {
      if (!isNumber(o.from) || !isNumber(o.to) || o.to - o.from < 3) {
        problems.push(`${at}: from and to, at least 3 m apart`)
        return
      }
      if (o.from < -half - 1.5 || o.to > half + 1.5) {
        problems.push(`${at}: inside the kerbs`)
        return
      }
      if (
        !isStep(o.closed, 30, period) ||
        !isStep(o.warn, 30, period) ||
        (o.closed as number) + (o.warn as number) + 30 > period
      ) {
        problems.push(`${at}: closed and warn at least 30 steps each, up at least 30`)
        return
      }
      out.push({
        kind: 'boom',
        at: o.at,
        from: o.from,
        to: o.to,
        period,
        shift: o.shift as number,
        closed: o.closed as number,
        warn: o.warn as number,
      })
      return
    }
    if (o.kind === 'slider') {
      const sized =
        isNumber(o.length) && o.length >= 2 && o.length <= 20 && isNumber(o.size) && o.size >= 2 && o.size <= 16
      if (!sized || !isNumber(o.a) || !isNumber(o.b)) {
        problems.push(`${at}: length 2 to 20 m, size 2 to 16 m, a and b`)
        return
      }
      // A kart caught between the box and the kerb must fit: never closer to a kerb than that
      const reach = half - SLIDER_KERB_GAP - (o.size as number) / 2
      if (Math.abs(o.a) > reach || Math.abs(o.b) > reach) {
        problems.push(`${at}: the box must stay ${SLIDER_KERB_GAP} m off the kerbs`)
        return
      }
      if (
        period % 2 !== 0 ||
        !isStep(o.move, 30, period / 2) ||
        !isStep(o.warn, 30, period / 2) ||
        (o.move as number) + (o.warn as number) > period / 2
      ) {
        problems.push(`${at}: an even period; move and warn at least 30 steps each, both within half of it`)
        return
      }
      out.push({
        kind: 'slider',
        at: o.at,
        length: o.length as number,
        size: o.size as number,
        a: o.a,
        b: o.b,
        period,
        shift: o.shift as number,
        move: o.move as number,
        warn: o.warn as number,
      })
      return
    }
    problems.push(`${at}: kind must be boom or slider`)
  })
  return out
}

/** Each obstacle list's places, worked out once per road */
const placed = new WeakMap<readonly ObstacleJson[], readonly Obstacle[]>()

/** The obstacles of `track`, placed on its road; empty for a track without any */
export function obstaclesOf(track: {
  readonly road: readonly RoadPoint[]
  readonly obstacles?: readonly ObstacleJson[]
}): readonly Obstacle[] {
  const list = track.obstacles
  if (!list || list.length === 0) return []
  let out = placed.get(list)
  if (!out) {
    out = list.map((json) => placeObstacle(track.road, json))
    placed.set(list, out)
  }
  return out
}
