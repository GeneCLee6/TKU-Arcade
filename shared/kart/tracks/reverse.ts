// 2026-11-23 (#131, docs/NEXT.md §5: "reverse tracks; the jumps and branches have a direction, see
// to them first"): a track driven the other way round, docs/ARCHITECTURE.md §4.90. The reversed
// track is worked out from the track itself, never drawn by hand, so that it follows every change
// to the original: same ground, same walls, same scenery, the other way round.
//
// - The road: its points in the opposite order, road point 0 kept where it is (so the start and
//   finish line, and the gantry over it, stay put): reversed point i is the original's (n - i) % n.
//   Each point's lean is turned over (a bend banked for the right is a bend banked for the left the
//   other way round).
// - The gates: gate 0 stays the finish line, the others in the opposite order, each with its two
//   ends swapped (a gate's `a` is on the left of whoever drives through it the right way); each
//   respawn point stays at its gate, turned round.
// - The grid and the time trial's start: one row LINE_BACK behind the line, the other side of it
//   (circuit.ts's gridBehindLine).
// - A jump (a lip with its ramp before it) is turned round where it stands: the lip's two
//   neighbours swap their heights over the plain road, so that the ramp is on the side the reversed
//   road comes from and the drop on the other (reversing again puts it back). A ramp that would
//   then be too steep (the editor's jumps drop in 3 m) is lowered to the steepest a road may be;
//   where even that cannot be (a lip at the top of a tall step: driven up, a wall), the jump is
//   taken out and the road eased over the step instead. None of the built-in tracks needs that.
// - A branch leaves where it joined and joins where it left, its own road reversed, its jumps
//   turned round as the main road's are. A branch flown into from a lip of the main road (a high
//   platform, ledges.ts; the works' loading deck over its fence) cannot be got into from its far end
//   (the drop at its end is a face to drive up, the fence is a wall): it is closed, and with it
//   whatever stood on it alone (a boost pad, item boxes). The lip that led into it stays, as a jump.
// - Boost pads face the other way; item boxes, walls, scenery stay where they are, but for a fence
//   across a lane flown into over it from a lip (FENCE_TOP, 2026-11-23): the lane is a dead end the
//   other way round, and the reversed track leaves the fence out.
// - A moving obstacle stays on its own clock at its own place; its sides are swapped (right of the
//   middle is left the other way round).
// - The guides (guide.ts) belong to the original's road and are not carried over: the reversed
//   track has none (the computer karts drive it by its road, its walls and its jumps, as they do any
//   track without a guide), nor drift-jump cues or slots. Corner boards and kerbs are worked out
//   from the road where they are drawn (cornerSigns.ts), so they point the new way by themselves.
//
// A reversed track's id is the original's with REVERSE_SUFFIX; its revision is the original's plus
// REVERSE_REVISION - 1, so that a change to either the original's layout or to how it is reversed
// sets the reversed track's records aside (recordKey). Pure.
import { branchPath, roadDepth } from '../branches.ts'
import type { Spot } from '../course.ts'
import type { ObstacleJson } from '../obstacles.ts'
import { MAX_GRADE, type Gate, type RoadPoint, type TrackJson } from '../track.ts'
import type { Wall } from '../walls.ts'
import type { BranchJson } from '../branches.ts'
import { gridBehindLine } from './circuit.ts'
import { reverseId } from './reverseId.ts'

export { forwardId, isReverseId, REVERSE_SUFFIX, reverseId } from './reverseId.ts'

/**
 * Raised whenever the way a track is reversed changes enough that old times no longer compare: a
 * reversed track's revision is its original's plus this, less one
 */
export const REVERSE_REVISION = 2

/**
 * 2026-11-23 (REVERSE_REVISION 2, reverseGuides.ts): a fence flown over from a lip (no higher than
 * this over the road) that stands within FENCE_AFTER road points after the lip and reaches more than
 * FENCE_INTO metres into the road closes a lane inside the road (wharf.ts's quay, lanes.ts's well).
 * The other way round nothing flies over it (the lip throws the car the other way) and the lane is
 * a dead end: the reversed track leaves the fence out, and the lane is open at both ends. A fence
 * along the kerb (the works' loading deck) is not such a fence
 */
export const FENCE_TOP = 2.5
export const FENCE_AFTER = 12
export const FENCE_INTO = 3

const round = (value: number) => Math.round(value * 100) / 100
const wrap = (angle: number) => {
  let a = angle
  while (a > Math.PI) a -= 2 * Math.PI
  while (a <= -Math.PI) a += 2 * Math.PI
  return Math.round(a * 1e6) / 1e6
}

/** A road point turned round: its lean the other way */
const turned = (point: RoadPoint): RoadPoint => {
  const { bank, ...rest } = point
  return bank === undefined || bank === 0 ? rest : { ...rest, bank: -bank }
}

/** What a reversal did to each of the original's direction-bound things, for the docs and tests */
export interface ReverseNotes {
  /** Lips of the main road (reversed indices) turned round where they stand */
  readonly jumpsTurned: number
  /** Lips taken out, the road eased over them instead */
  readonly jumpsRemoved: number
  /** Branches kept (reversed) and closed (flown into from a lip) */
  readonly branchesKept: number
  readonly branchesClosed: number
  /** Fences across a lane flown into, left out (FENCE_TOP) */
  readonly fencesOpened: number
  /** Boost pads and item boxes left off with a closed branch */
  readonly padsDropped: number
  readonly boxesDropped: number
}

const segment = (a: RoadPoint, b: RoadPoint) => Math.hypot(b.x - a.x, b.z - a.z)

/**
 * Turns the jumps of a centre line round in place (the line already reversed): `lips` are the
 * reversed line's indices of the original lips. Each lip's ramp was the point after it (the
 * original's point before): the two neighbours swap their heights over the plain road, the new
 * ramp eased to MAX_GRADE if it would be steeper, or the lip taken out and the road eased over it.
 * Returns the heights, the lips kept, and how many were taken out. `closed`: the main road's loop;
 * a branch's path is open and its two ends (main road points) are never moved
 */
export function turnJumps(
  points: readonly RoadPoint[],
  lips: readonly number[],
  closed: boolean,
  maxGrade = MAX_GRADE,
): { points: RoadPoint[]; lips: number[]; removed: number } {
  const count = points.length
  const out = points.map((point) => ({ ...point }))
  const at = (index: number) => (closed ? ((index % count) + count) % count : index)
  const fixed = (index: number) => !closed && (index <= 0 || index >= count - 1)
  const y = (index: number) => out[at(index)]!.y ?? 0
  const set = (index: number, value: number) => {
    const point = out[at(index)]!
    out[at(index)] = { ...point, y: round(value) }
  }
  const inLine = (index: number) => closed || (index >= 0 && index < count)
  const kept: number[] = []
  const lipSet = new Set(lips)
  // Every segment's grade within the limit, but for each kept lip's drop
  const steep = (from: number, to: number, lipsNow: ReadonlySet<number>) => {
    for (let index = from; index < to; index++) {
      if (!inLine(index) || !inLine(index + 1)) continue
      if (lipsNow.has(at(index))) continue
      const a = out[at(index)]!
      const b = out[at(index + 1)]!
      if (Math.abs((b.y ?? 0) - (a.y ?? 0)) > maxGrade * segment(a, b) + 1e-9) return true
    }
    return false
  }
  let removed = 0
  for (const lip of lips) {
    const ramp = lip + 1
    const beyond = lip + 2
    const before = lip - 1
    const saved = [before, lip, ramp].filter(inLine).map((index) => [index, y(index)] as const)
    const canTurn = inLine(beyond) && inLine(before) && !fixed(before) && !fixed(ramp)
    if (canTurn && inLine(lip - 2)) {
      // Mirrored about the lip: each of its two neighbours takes the other's height over the plain
      // road (a line from two points before the lip to two after it), so that the ramp is now on
      // the side the reversed road comes from, and reversing again puts it back
      const plain = (index: number) => {
        const a = out[at(lip - 2)]!
        let total = 0
        let upTo = 0
        for (let k = lip - 2; k < lip + 2; k++) {
          const d = segment(out[at(k)]!, out[at(k + 1)]!)
          if (k < index) upTo += d
          total += d
        }
        return (a.y ?? 0) + (y(lip + 2) - (a.y ?? 0)) * (total > 0 ? upTo / total : 0.5)
      }
      const overBefore = y(before) - plain(before)
      const overRamp = y(ramp) - plain(ramp)
      set(ramp, plain(ramp) + overBefore)
      // The new ramp is the point before the lip. A short drop (the editor's jumps come down in
      // 3 m) would make it too steep: it is raised no steeper than a road may be
      const short = maxGrade * segment(out[at(before)]!, out[at(lip)]!) * 0.98
      set(before, Math.max(plain(before) + overRamp, y(lip) - short))
      const now = new Set([...kept.map(at), ...[...lipSet].map(at)])
      if (!steep(lip - 3, lip + 3, now)) {
        kept.push(at(lip))
        continue
      }
      for (const [index, value] of saved) set(index, value)
    }
    // Taken out: the road eased evenly over a stretch round the lip, as short as will do
    lipSet.delete(lip)
    removed++
    const now = new Set([...kept.map(at), ...[...lipSet].map(at)])
    let eased = false
    for (let half = 2; half <= 12 && !eased; half++) {
      let from = lip - half
      let to = lip + half
      if (!closed) {
        from = Math.max(0, from)
        to = Math.min(count - 1, to)
      }
      const y0 = y(from)
      const y1 = y(to)
      let total = 0
      for (let index = from; index < to; index++) total += segment(out[at(index)]!, out[at(index + 1)]!)
      let run = 0
      const kept0 = out.map((point) => point.y)
      for (let index = from + 1; index < to; index++) {
        run += segment(out[at(index - 1)]!, out[at(index)]!)
        set(index, y0 + (y1 - y0) * (total > 0 ? run / total : 0))
      }
      if (!steep(from - 1, to + 1, now)) eased = true
      else
        kept0.forEach((value, index) => {
          if (value !== undefined) out[index] = { ...out[index]!, y: value }
        })
    }
  }
  return { points: out, lips: kept.sort((a, b) => a - b), removed }
}

export interface Reversed {
  readonly track: TrackJson
  readonly notes: ReverseNotes
}

/** The road point nearest (x, z) (a plain search: the track is not parsed yet) */
function nearestIndex(road: readonly RoadPoint[], x: number, z: number): number {
  let best = 0
  let least = Infinity
  road.forEach((point, index) => {
    const distance = (point.x - x) ** 2 + (point.z - z) ** 2
    if (distance < least) {
      least = distance
      best = index
    }
  })
  return best
}

/** Whether a wall of the original is a fence across a lane flown into from a lip (FENCE_TOP) */
export function closesFlownLane(json: TrackJson, wall: Wall): boolean {
  if (wall.top === undefined || wall.base !== undefined) return false
  const { road } = json
  const count = road.length
  const ends = [nearestIndex(road, wall.ax, wall.az), nearestIndex(road, wall.bx, wall.bz)]
  const y = Math.max(...ends.map((index) => road[index]!.y ?? 0))
  if (wall.top - y > FENCE_TOP) return false
  const first = Math.min(...ends)
  if (!(json.jumps ?? []).some((lip) => (first - lip + count) % count <= FENCE_AFTER)) return false
  return Math.max(roadDepth(road, true, wall.ax, wall.az), roadDepth(road, true, wall.bx, wall.bz)) > FENCE_INTO
}

/** The track driven the other way round (see the top of this file) */
export function reverseTrack(json: TrackJson): Reversed {
  const base = json.road
  const n = base.length
  const map = (index: number) => (n - index) % n
  // The road: point 0 kept, the rest the other way round
  let road = base.map((_, index) => turned(base[map(index)]!))
  const lips = (json.jumps ?? []).map(map)
  const hilly = road.some((point) => point.y !== undefined)
  let jumps: number[] = []
  let jumpsRemoved = 0
  if (lips.length > 0 && hilly) {
    const turnedRoad = turnJumps(road, lips, true)
    road = turnedRoad.points
    jumps = turnedRoad.lips
    jumpsRemoved = turnedRoad.removed
  }

  // Branches: from where it joined to where it left; a high platform closed
  const branches: BranchJson[] = []
  let branchesClosed = 0
  for (const branch of json.branches ?? []) {
    // Flown into from a lip (a platform, the works' loading deck behind its fence): its far end was
    // never made to be driven into, and the flight onto it is from the original's side
    if (branch.rise !== undefined || (json.jumps ?? []).includes(branch.from)) {
      branchesClosed++
      continue
    }
    const from = map(branch.to)
    const to = map(branch.from)
    if (to - from < 2) {
      branchesClosed++
      continue
    }
    // Its whole path, reversed, as the main road now is at its two ends
    const path = branchPath(base, branch).reverse().map(turned)
    path[0] = { ...path[0]!, ...(road[from]!.y !== undefined ? { y: road[from]!.y } : {}) }
    path[path.length - 1] = {
      ...path[path.length - 1]!,
      ...(road[to]!.y !== undefined ? { y: road[to]!.y } : {}),
    }
    const pathLips = (branch.jumps ?? []).map((lip) => path.length - 2 - lip)
    const done = pathLips.length > 0 ? turnJumps(path, pathLips, false) : { points: path, lips: [] }
    // The ends are the main road's own (branchPath works them out again): only its own points
    const own = done.points.slice(1, -1)
    branches.push({
      from,
      to,
      road: own,
      ...(done.lips.length > 0 ? { jumps: done.lips.map((lip) => lip - 1) } : {}),
    })
  }
  branches.sort((a, b) => a.from - b.from)

  // Gates: the finish line first, the rest the other way round, each turned
  const swap = (gate: Gate): Gate => ({ ax: gate.bx, az: gate.bz, bx: gate.ax, bz: gate.az })
  const turnSpot = (spot: Spot): Spot => ({ x: spot.x, z: spot.z, heading: wrap(spot.heading + Math.PI) })
  const order = [0, ...json.gates.map((_, index) => index).slice(1).reverse()]
  const gates = order.map((index) => swap(json.gates[index]!))
  const respawns = order.map((index) => turnSpot(json.respawns[index]!))

  const { grid, solo } = gridBehindLine(road)

  // What stands only on a closed branch goes with it
  const kept = branches.map((branch) => branchPath(road, branch))
  const onRoad = (x: number, z: number) =>
    roadDepth(road, true, x, z) > -0.5 || kept.some((path) => roadDepth(path, false, x, z) > -0.5)
  const closing = branchesClosed > 0
  const boostPads = json.boostPads
    .filter((pad) => !closing || onRoad(pad.x, pad.z))
    .map((pad) => ({ ...pad, heading: wrap(pad.heading + Math.PI) }))
  const itemBoxes = json.itemBoxes.filter((box) => !closing || onRoad(box.x, box.z))

  // Obstacles: the same place, the same clock, the sides swapped
  const obstacles = (json.obstacles ?? []).map((one): ObstacleJson => {
    const at = round((n - one.at) % n)
    return one.kind === 'boom'
      ? { ...one, at, from: -one.to, to: -one.from }
      : { ...one, at, a: -one.a, b: -one.b }
  })

  // A fence across a lane flown into: a dead end the other way round, left out
  const walls = json.walls.filter((wall) => !closesFlownLane(json, wall))

  const track: TrackJson = {
    format: json.format,
    id: reverseId(json.id),
    name: { en: `${json.name.en} (Reverse)`, 'zh-TW': `${json.name['zh-TW']}（反向）` },
    revision: (json.revision ?? 1) + REVERSE_REVISION - 1,
    ...(json.theme !== undefined ? { theme: json.theme } : {}),
    laps: json.laps,
    road,
    gates,
    respawns,
    grid,
    solo,
    walls,
    boostPads,
    itemBoxes,
    decor: json.decor,
    ...(jumps.length > 0 ? { jumps } : {}),
    ...(branches.length > 0 ? { branches } : {}),
    ...(obstacles.length > 0 ? { obstacles } : {}),
  }
  return {
    track,
    notes: {
      jumpsTurned: jumps.length,
      jumpsRemoved,
      branchesKept: branches.length,
      branchesClosed,
      fencesOpened: json.walls.length - walls.length,
      padsDropped: json.boostPads.length - boostPads.length,
      boxesDropped: json.itemBoxes.length - itemBoxes.length,
    },
  }
}
