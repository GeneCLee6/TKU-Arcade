// 2026-11-23 (docs/NEXT.md §5, docs/ARCHITECTURE.md §4.92): the guides of the reversed tracks
// (reverse.ts). A reversed track stands on the same ground as its original, its road the same points
// the other way round: the original's lines (guide.ts) are carried over point by point, each place
// on a line kept where it is (so metres right of the middle become metres left), and with them the
// slots in the walls, which are gaps either way. What is carried over is then looked at, track by
// track, below:
//
// - the drift jumps are not carried over: a lip turned round (reverse.ts) throws the car the other
//   way, into whatever the original's road had come out of. A reversed track's cues are its own,
//   written here where a turned lip leads somewhere worth a drift;
// - the lanes the original's line flew into over a fence (from a drift jump) are dead ends the other
//   way round (the fence is at their far end now): the reversed technical line keeps out of them,
//   on the safe line, unless a cue of its own flies it over that fence from the other side.
//
// `tests/kart/reverseGuides.test.ts` checks every reversed technical line against the walls: it
// crosses none but where a cue of its own flies it over (a wall with a top), and passes through
// every slot. Pure, worked out once per track on first use.
import { routeRoad } from '../branches.ts'
import { roadDirection, type RoadPoint, type Track } from '../track.ts'
import { acrossRoad, chordOffsets, smooth, type DriftJumpCue, type TrackGuide } from './guide.ts'
import { LANES_MARKS } from './lanes.ts'
import { WHARF_MARKS } from './wharf.ts'
import { forwardId } from './reverseId.ts'

const round = (value: number) => Math.round(value * 100) / 100

/** A road a guide belongs to */
interface GuidedRoad {
  readonly road: readonly RoadPoint[]
  readonly guide: TrackGuide
}

/** How near (metres, and in height) a point of the target road must be to one of a source's */
const SAME_POINT = 0.75
const SAME_HEIGHT = 2

/** The source road point at the same place as (x, y, z) running the other way, if any */
function matchAt(
  source: GuidedRoad,
  x: number,
  y: number,
  z: number,
  dx: number,
  dz: number,
): number {
  let best = -1
  let bestDistance = SAME_POINT
  source.road.forEach((point, index) => {
    const distance = Math.hypot(point.x - x, point.z - z)
    if (distance > bestDistance) return
    if (Math.abs((point.y ?? 0) - y) > SAME_HEIGHT) return
    const along = roadDirection(source.road, index)
    if (along.dx * dx + along.dz * dz > -0.3) return
    best = index
    bestDistance = distance
  })
  return best
}

/** Where (x, z) is on `road`: a road point (with a fraction) and metres right of the middle */
export function placeOn(road: readonly RoadPoint[], x: number, z: number): [number, number] {
  const count = road.length
  let best: [number, number] = [0, 0]
  let bestDistance = Infinity
  for (let index = 0; index < count; index++) {
    const a = road[index]!
    const b = road[(index + 1) % count]!
    const ex = b.x - a.x
    const ez = b.z - a.z
    const length2 = ex * ex + ez * ez || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / length2))
    const px = a.x + ex * t
    const pz = a.z + ez * t
    const distance = Math.hypot(x - px, z - pz)
    if (distance < bestDistance) {
      bestDistance = distance
      best = [index + t, 0]
    }
  }
  const middle = acrossRoad(road, best[0], 0)
  const right = acrossRoad(road, best[0], 1)
  return [round(best[0]), round((x - middle.x) * (right.x - middle.x) + (z - middle.z) * (right.z - middle.z))]
}

/**
 * A guide for `target` carried over from guides of the same ground driven the other way (the first
 * source with a point at a target point's place wins), without cues. A target point no source has
 * keeps the middle of the road, with room to the kerbs
 */
export function carryGuide(target: readonly RoadPoint[], sources: readonly GuidedRoad[]): TrackGuide {
  const safe: number[] = []
  const safeRoom: number[] = []
  const tech: number[] = []
  const techRoom: number[] = []
  target.forEach((point, index) => {
    const { dx, dz } = roadDirection(target, index)
    const rx = -dz
    const rz = dx
    let done = false
    for (const source of sources) {
      const at = matchAt(source, point.x, point.y ?? 0, point.z, dx, dz)
      if (at < 0) continue
      const across = (offset: number) => {
        const place = acrossRoad(source.road, at, offset)
        return round((place.x - point.x) * rx + (place.z - point.z) * rz)
      }
      safe.push(across(source.guide.safe[at]!))
      tech.push(across(source.guide.tech[at]!))
      safeRoom.push(source.guide.safeRoom[at]!)
      techRoom.push(source.guide.techRoom[at]!)
      done = true
      break
    }
    if (!done) {
      const room = Math.max(0, point.width / 2 - 5)
      safe.push(0)
      tech.push(0)
      safeRoom.push(room)
      techRoom.push(room)
    }
  })
  // The slots of the first source (the road's own): the same gaps, seen from the other side
  const own = sources[0]
  const slots = (own?.guide.slots ?? []).map((slot) => {
    const place = acrossRoad(own!.road, slot.index, slot.across)
    const [at, across] = placeOn(target, place.x, place.z)
    return { index: at, across }
  })
  slots.sort((a, b) => a.index - b.index)
  return { safe, safeRoom, tech, techRoom, cues: [], slots }
}

/** A carried-over guide being touched up: the same verbs as guide.ts's builder, on what is there */
export interface GuideEdit {
  /** From road point `from` to `to` (wrapping), the technical line on the safe one */
  techOnSafe(from: number, to: number): GuideEdit
  /** From road point `from` to `to`: the technical line `across` metres right, `room` either side */
  techHold(from: number, to: number, across: number, room: number): GuideEdit
  /** The technical line straight (as the crow flies) from one place to another, `room` either side */
  techChord(
    from: readonly [index: number, across: number],
    to: readonly [index: number, across: number],
    room: number,
  ): GuideEdit
  /** Both lines */
  bothHold(from: number, to: number, across: number, room: number): GuideEdit
  /** The safe line */
  safeHold(from: number, to: number, across: number, room: number): GuideEdit
  /** Takes out the slots between road points `from` and `to` */
  dropSlots(from: number, to: number): GuideEdit
  cue(cue: DriftJumpCue): GuideEdit
  build(): TrackGuide
}

export function editGuide(guide: TrackGuide, road: readonly RoadPoint[]): GuideEdit {
  const count = guide.safe.length
  const safe = [...guide.safe]
  const safeRoom = [...guide.safeRoom]
  const tech = [...guide.tech]
  const techRoom = [...guide.techRoom]
  let slots = [...guide.slots]
  const cues = [...guide.cues]
  /** The safe line drawn afresh somewhere: eased as guide.ts eases it */
  let safeDrawn = false
  const each = (from: number, to: number, act: (at: number) => void) => {
    for (let index = from; index <= to; index++) act(((index % count) + count) % count)
  }
  const edit: GuideEdit = {
    techOnSafe(from, to) {
      each(from, to, (at) => {
        tech[at] = safe[at]!
        techRoom[at] = safeRoom[at]!
      })
      return edit
    },
    techHold(from, to, across, room) {
      each(from, to, (at) => {
        tech[at] = across
        techRoom[at] = room
      })
      return edit
    },
    techChord(from, to, room) {
      for (const [at, across] of chordOffsets(road, from, to)) {
        tech[at] = round(across)
        techRoom[at] = room
      }
      return edit
    },
    safeHold(from, to, across, room) {
      safeDrawn = true
      each(from, to, (at) => {
        safe[at] = across
        safeRoom[at] = room
      })
      return edit
    },
    bothHold(from, to, across, room) {
      edit.safeHold(from, to, across, room)
      return edit.techHold(from, to, across, room)
    },
    dropSlots(from, to) {
      slots = slots.filter((slot) => slot.index < from || slot.index > to)
      return edit
    },
    cue(cue) {
      cues.push(cue)
      return edit
    },
    build: () => ({ safe: safeDrawn ? smooth(safe) : [...safe], safeRoom, tech, techRoom, cues, slots }),
  }
  return edit
}

/** What a reversed track's guides are made from */
export interface ReverseSources {
  /** The original track (parsed), and the reversed one */
  readonly forward: Track
  readonly reversed: Track
  readonly main?: TrackGuide
  readonly route?: TrackGuide
}

/**
 * A reversed track's touch-ups, by original id: `at(i)` is the reversed road point of the
 * original's road point i (a fraction kept). Each gets the main guide, then (`route`) the route's;
 * both are on the reversed track's own road points, which the route's are too up to its first branch
 */
type Touch = (edit: GuideEdit, at: (index: number) => number, route: boolean, sources: ReverseSources) => void

/**
 * The inside lane of a wide hairpin the original flew into over a fence (reverse.ts leaves the fence
 * out the other way round, so the lane is open at both ends): the carried line runs down it as the
 * original's did, 25 m left of the middle; out of its far end (the original's way in, `laneIn`, plus
 * `out` road points) it comes back across to `across` metres right of the middle `before` road
 * points ahead of the lip (`lip`, turned round), and keeps there to the lip, square to it
 */
function lane(
  edit: GuideEdit,
  at: (index: number) => number,
  laneIn: number,
  lip: number,
  out: number,
  before: number,
  across: number,
): void {
  const end = Math.round(at(lip))
  edit.techChord([at(laneIn) + out, -25], [end - before, across], 4).techHold(end - before, end, across, 3)
}

/**
 * A row of walls with a slot in each (wharf.ts's container rows, lanes.ts's yards), measured the
 * other way round (2026-11-23, docs/KART-FEEL.md §28): the straight line through the slots is no
 * faster there than the safe line, which passes close by the end of each wall, and costs the charges
 * the drifts round the walls would have built. The technical line keeps to the safe one from
 * `from` to `to` (reversed road points) and the slots there are taken out
 */
function noSlots(edit: GuideEdit, from: number, to: number): void {
  edit.techOnSafe(from, to).dropSlots(from - 3, to + 3)
}

const TOUCH: Readonly<Record<string, Touch>> = {
  // The quay's inside lane, open the other way round; through the first two rows' slots (the last
  // one's line is slower); out of the shed's lane on the safe line (the lane's slot is its way out,
  // and the line the original's cut in by meets its wall), and none of the stacks' run-up
  wharf: (edit, at, route, { reversed }) => {
    const m = WHARF_MARKS
    lane(edit, at, m.quayIn, m.ramp2, 2, 3, -6)
    noSlots(edit, Math.round(at(m.rows[0])) - 5, Math.round(at(m.rowsIn)) + 10)
    if (!route) return
    const fork = reversed.forks![0]!
    const rejoin = routeRoad(reversed, [0]).main[fork.to]!
    edit.techOnSafe(rejoin - 17, rejoin + 13)
    edit.techOnSafe(Math.round(at(m.stackFrom)) - 6, Math.round(at(m.stackFrom)) + 16)
  },
  // The well's inside lane, open the other way round; none of the yards' slots; and a drift jump off
  // the lower step (turned round, now a climb) into the left-hand hairpin 40 m after it
  lanes: (edit, at) => {
    const m = LANES_MARKS
    lane(edit, at, m.wellIn, m.step3, -1, 6, 0)
    noSlots(edit, Math.round(at(m.yardsOut)) - 2, Math.round(at(m.yardsIn)) + 10)
    const lip = Math.round(at(m.step2))
    edit.cue({ lip, way: -1, land: [lip + 5, 6], into: 0.15, nose: (40 * Math.PI) / 180, most: 55 })
  },
}

/**
 * Tracks whose carried guides were measured and left out: the old street's lantern alley the other
 * way round costs the master a reset or two with any line down it (2026-11-23; the alley is taken by
 * every hand that knows the shortcuts, guide or none)
 */
const NONE = new Set(['oldstreet'])

const routeOf = (track: Track) =>
  routeRoad(
    track,
    (track.forks ?? []).map((_, index) => index),
  ).road

/** Road points before an original cue's lip its technical line was set up on (guide.ts holds) */
const CUE_SETUP = 14

/**
 * What every carried-over guide needs before its own touch-ups: the technical line back on the safe
 * one where the original's set up a drift jump (the stretch before each lip, now after it), and over
 * every stretch where it would cross a wall (a lane flown into over a fence, now a dead end)
 */
function tidy(
  guide: TrackGuide,
  road: readonly RoadPoint[],
  track: Track,
  forwardGuides: readonly GuidedRoad[],
): TrackGuide {
  const edit = editGuide(guide, road)
  const count = road.length
  for (const { road: forwardRoad, cue } of forwardGuides.flatMap((one) =>
    one.guide.cues.map((cue) => ({ road: one.road, cue })),
  )) {
    const lip = forwardRoad[cue.lip]!
    const [at] = placeOn(road, lip.x, lip.z)
    const from = Math.round(at)
    edit.techOnSafe(from - 1, from + CUE_SETUP)
  }
  let now = edit.build()
  const wrap = (index: number) => ((index % count) + count) % count
  for (const hit of crossedWalls(road, now.tech, track.walls)) {
    // The whole stretch the technical line is off the safe one round the crossing
    const apart = (index: number) => Math.abs(now.tech[wrap(index)]! - now.safe[wrap(index)]!) > 1
    let from = hit.index
    let to = hit.index + 1
    while (from > hit.index - count / 4 && apart(from - 1)) from--
    while (to < hit.index + count / 4 && apart(to + 1)) to++
    edit.techOnSafe(from - 2, to + 2)
    now = edit.build()
  }
  return now
}

/** Whether a guide asks anything of the hands the road alone does not: a slot, a cue, a line apart */
export const technical = (guide: TrackGuide): boolean =>
  guide.slots.length > 0 ||
  guide.cues.length > 0 ||
  guide.tech.some((across, index) => Math.abs(across - guide.safe[index]!) > 1)

/**
 * The reversed track's main guide and route guide, from its original's. A guide that would ask
 * nothing technical of the hands (the original's only a drift jump, or only lines onto a closed
 * platform) is left out, so that the reversed track is driven by its road as before
 */
export function reverseGuides(sources: ReverseSources): { main?: TrackGuide; route?: TrackGuide } {
  const { forward, reversed, main, route } = sources
  const id = forwardId(reversed.id)
  if (NONE.has(id)) return {}
  const count = forward.road.length
  const at = (index: number) => round((count - index) % count)
  const touch = TOUCH[id]
  const forwardMain = main && !main.cuesOnly ? { road: forward.road, guide: main } : null
  const forwardRoute = route && (forward.forks ?? []).length > 0 ? { road: routeOf(forward), guide: route } : null
  const out: { main?: TrackGuide; route?: TrackGuide } = {}
  if (forwardMain) {
    const edit = editGuide(tidy(carryGuide(reversed.road, [forwardMain]), reversed.road, reversed, [forwardMain]), reversed.road)
    touch?.(edit, at, false, sources)
    const made = edit.build()
    if (technical(made)) out.main = made
  }
  if (forwardRoute && (reversed.forks ?? []).length > 0) {
    const road = routeOf(reversed)
    const from = forwardMain ? [forwardRoute, forwardMain] : [forwardRoute]
    const edit = editGuide(tidy(carryGuide(road, from), road, reversed, from), road)
    touch?.(edit, at, true, sources)
    const made = edit.build()
    if (technical(made)) out.route = made
  }
  return out
}

/** Whether segment a-b crosses segment c-d (touching at an end does not count) */
function crosses(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const side = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
    (qx - px) * (rz - pz) - (qz - pz) * (rx - px)
  const d1 = side(cx, cz, dx, dz, ax, az)
  const d2 = side(cx, cz, dx, dz, bx, bz)
  const d3 = side(ax, az, bx, bz, cx, cz)
  const d4 = side(ax, az, bx, bz, dx, dz)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/**
 * Where a line (metres right of the middle at every road point) crosses a wall: the road point the
 * crossing leaves from, and the wall's top (undefined: one nothing flies over). A wall with a `base`
 * stands at a crossing of the road over itself and is counted only within its height
 */
export function crossedWalls(
  road: readonly RoadPoint[],
  line: readonly number[],
  walls: readonly import('../walls.ts').Wall[],
): { index: number; top: number | undefined }[] {
  const count = road.length
  const out: { index: number; top: number | undefined }[] = []
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count
    const a = acrossRoad(road, index, line[index]!)
    const b = acrossRoad(road, next, line[next]!)
    const y = Math.min(road[index]!.y ?? 0, road[next]!.y ?? 0)
    for (const wall of walls) {
      if (wall.base !== undefined && (y + 1.5 < wall.base || y >= (wall.top ?? Infinity))) continue
      if (crosses(a.x, a.z, b.x, b.z, wall.ax, wall.az, wall.bx, wall.bz)) out.push({ index, top: wall.top })
    }
  }
  return out
}
