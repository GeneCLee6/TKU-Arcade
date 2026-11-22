// 2026-11-22 (owner: "all as suggested, carry on"; #103 asked for a sixth technical track, #94 and
// #113 for a road over a road and banked bends): the technical showcase, docs/KART-WORLD.md §6. A
// working name: Zhuwei Flyover (竹圍高架), an original riverside interchange by the Tamsui line's
// viaduct at Zhuwei: the road climbs onto a viaduct, swings round the river bank and dives under
// the viaduct it came over, a figure of eight (shared/kart/levels.ts). Laid corner by corner
// (lay.ts). What it asks of the hands:
//
// - the crossing: over the viaduct and, a lap's half later, through the underpass beneath it. Both
//   are straight and wide; what is hard is the line out of each, into the bend after it;
// - the banked U (east): a long right-hander leaning 12° into the bend (levels.ts's banking: steered
//   into it, the bank lends the tyres a little more turn at the same speed), so a kart that holds its
//   line flat out round it carries more speed than on a level road;
// - the canal jump (west): a ramp on the straight out of the big left-hander, over a drain;
// - the cut (east): a real branch (branches.ts) straight on past the pumping station, where the road
//   swings out round it in three bends: narrow, through a slot in a floodwall. Lined up early, it is
//   flat out and shorter; a little off, it is the wall.
//
// The layout is ours; no other game's track was looked at.
import { branchPath, gatesClearOf, routeRoad, type BranchJson } from '../branches.ts'
import {
  gatesClearOfCrossings,
  padsAlong,
  TRACK_FORMAT,
  type RoadPoint,
  type TrackJson,
} from '../track.ts'
import type { Wall } from '../walls.ts'
import { circuit } from './circuit.ts'
import { fence, guideFor, type TrackGuide } from './guide.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right, type Lay } from './lay.ts'
import { SHED_HEIGHT } from './wharf.ts'

/** The loops' width, and the arms' over and under the crossing */
const W = 30
const ARM = 28
/** How high the viaduct is over the plain, and how deep the underpass below it */
const OVER = 4.5
/** Each arm: a run-up, a ramp, the flat over (or under) the crossing, a ramp, a run-out */
const RUN = 40
const RAMP = 50
const FLAT = 90
/** From the crossing to the bend at either end of an arm */
const HALF_ARM = RUN + RAMP + FLAT / 2
/** The bank of the east U, degrees */
const BANK = 12
/** The cut's width, and the block round the pumping station it cuts past: its sides and its bends, metres */
const CUT = 14
const BULGE = 40
const BULGE_RADIUS = 32

const RAD = Math.PI / 180
/** How far south a run of steps goes from heading `heading` (degrees): for the west loop's size */
function southOf(steps: readonly Lay[], heading: number): number {
  let h = heading * RAD
  let south = 0
  for (const step of steps) {
    if (step.kind === 'line') {
      south += -Math.cos(h) * step.length
      continue
    }
    const to = h + step.degrees * RAD
    // Right: R (sin h0 - sin h1); left: R (sin h1 - sin h0)
    south += Math.sign(step.degrees) * step.radius * (Math.sin(h) - Math.sin(to))
    h = to
  }
  return south
}

// The west loop, first half: from the underpass's end, heading north-west, to the middle of the big
// left-hander. Its second half is the first's mirror (the same steps backwards), so the loop is
// symmetric about the line through the crossing exactly when this half ends level with it
const westHalf = (radius: number): Lay[] => [
  left(45, 50, W),
  line(40, W),
  right(20, 60, W),
  left(20, 60, W),
  line(50, W, { mid: 'boxes2' }),
  left(90, radius, W),
]
const WEST = (() => {
  const target = HALF_ARM * Math.SQRT1_2
  const rest = southOf(westHalf(0), 315)
  // The last step (left 90 from west to south) goes `radius` south
  return target - rest
})()

const arm = (height: number, mid: string, out: string): Lay[] => [
  line(RUN, ARM),
  line(RAMP, ARM, { height }),
  line(FLAT, ARM, { height, mid }),
  line(RAMP, ARM, { height: 0 }),
  line(RUN, ARM, { mid: out }),
]

const laid = lay(
  [
    // The start straight along the river, east, an S into the banked U round the east bank
    fitted(W, { mid: 'boxes1' }),
    left(20, 70, W),
    right(20, 70, W),
    right(90, 60, W, { bank: BANK, mid: 'bankIn' }),
    fitted(W, { bank: BANK, mid: 'bankMid' }),
    right(90, 60, W, { bank: 0, mark: 'bankOut' }),
    line(40, W, { mid: 'pad2', mark: 'bulgeIn' }),
    // The pumping station: the road swings out round it; the cut runs straight past
    left(90, BULGE_RADIUS, W),
    line(BULGE, W),
    right(180, BULGE_RADIUS, W, { mid: 'bulgeMid' }),
    line(BULGE, W),
    left(90, BULGE_RADIUS, W, { mark: 'bulgeOut' }),
    line(30, W),
    right(45, 55, ARM),
    // The underpass, north-west, under the viaduct
    ...arm(-OVER, 'under', 'underOut'),
    // The west loop: an S, the big left-hander with its inside cut, an S, the canal jump
    ...westHalf(WEST),
    left(90, WEST, W, { mark: 'westOut' }),
    line(50, W, { mid: 'lip' }),
    left(20, 60, W),
    right(20, 60, W),
    line(40, W),
    left(45, 50, ARM),
    // The viaduct, north-east, over the underpass
    ...arm(OVER, 'over', 'pad1'),
    right(45, 55, W),
    // Straight onto the line, so that the grid stands square behind it
    line(40, W),
  ],
  { width: W, height: 0, eight: true, heading: 90 },
)

const made = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [[...laid.marks.lip!, 2.5]],
  boxes: [
    [...laid.marks.boxes1!, [-9, -3, 3, 9]],
    [...laid.marks.boxes2!, [-9, -3, 3, 9]],
  ],
})

const { road } = made
const at = (mark: string) => made.nearest(...laid.marks[mark]!)
/** The road point nearest a named place on the viaduct (+) or in the underpass (−) */
const atLevel = (mark: string, y: number) => {
  const [x, z] = laid.marks[mark]!
  let best = 0
  road.forEach((point, index) => {
    const score = (one: RoadPoint) => Math.hypot(one.x - x, one.z - z) + Math.abs((one.y ?? 0) - y) * 10
    if (score(point) < score(road[best]!)) best = index
  })
  return best
}
const count = road.length

// ── The cut ──
// Straight on past the pumping station, from where the road swings out to where it is back
const cutFrom = at('bulgeIn') - 1
const cutTo = at('bulgeOut') + 1
const cutRoad: RoadPoint[] = (() => {
  const a = road[cutFrom]!
  const b = road[cutTo]!
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const pieces = Math.round(length / LAY_SAMPLE)
  return Array.from({ length: pieces - 1 }, (_, k) => {
    const t = (k + 1) / pieces
    return {
      x: Math.round((a.x + (b.x - a.x) * t) * 100) / 100,
      z: Math.round((a.z + (b.z - a.z) * t) * 100) / 100,
      width: CUT,
      y: 0,
    }
  })
})()
const branches: BranchJson[] = [{ from: cutFrom, to: cutTo, road: cutRoad }]
const cutPath = branchPath(road, branches[0]!)

// A floodwall across the cut, its slot just right of the middle
const slotAt = Math.round(cutPath.length / 2)
const SLOT = 9
const SLOT_ACROSS = 1.5
const walls: Wall[] = [
  ...fence(
    cutPath,
    [
      [slotAt, -(CUT / 2 + 1)],
      [slotAt, SLOT_ACROSS - SLOT / 2],
    ],
    SHED_HEIGHT,
  ),
  ...fence(
    cutPath,
    [
      [slotAt, SLOT_ACROSS + SLOT / 2],
      [slotAt, CUT / 2 + 1],
    ],
    SHED_HEIGHT,
  ),
]

// Gates: off the cut, then off the crossing (which never fills a gap: it may stay a long one)
const forked = gatesClearOf(road, made.gates, made.respawns, branches)
const cleared = gatesClearOfCrossings(road, forked.gates, forked.respawns)

/** The road point of a branch's own centre line nearest a place */
const nearestOn = (path: readonly RoadPoint[], x: number, z: number) =>
  path.reduce(
    (best, point, index) =>
      Math.hypot(point.x - x, point.z - z) < Math.hypot(path[best]!.x - x, path[best]!.z - z)
        ? index
        : best,
    0,
  )

export const ZHUWEI_MARKS = {
  /** Where the two roads cross: the viaduct over the underpass */
  crossing: laid.marks.over!,
  under: atLevel('under', -OVER),
  over: atLevel('over', OVER),
  bankMid: at('bankMid'),
  lip: at('lip'),
  bulgeMid: at('bulgeMid'),
  cutFrom,
  cutTo,
  slot: nearestOn(cutPath, ...([cutPath[slotAt]!.x, cutPath[slotAt]!.z] as const)),
  count,
} as const

export const ZHUWEI: TrackJson = {
  format: TRACK_FORMAT,
  id: 'zhuwei',
  // A working name (2026-11-22): the owner settles it (docs/KART-WORLD.md §6)
  name: { en: 'Zhuwei Flyover', 'zh-TW': '竹圍高架' },
  revision: 1,
  theme: 'sunset',
  laps: 3,
  road,
  gates: cleared.gates,
  respawns: cleared.respawns,
  grid: made.grid,
  solo: made.solo,
  walls,
  boostPads: [
    ...padsAlong(road, [
      [at('pad1'), 7],
      [at('pad2'), -7],
    ]),
  ],
  itemBoxes: made.itemBoxes,
  decor: [],
  jumps: made.jumps,
  branches,
}

// ── The lines ──
// The main road: one line for everyone
export const ZHUWEI_GUIDE: TrackGuide = guideFor(road).build()

// The route down the inside cut, by its own road points (routes.ts drives it): from the left of the
// road, lined up with the slot well before the mouth, through it, then down the middle
const route = routeRoad(
  { road, jumps: made.jumps, forks: [{ from: cutFrom, to: cutTo, path: cutPath, jumps: [] }] },
  [0],
)
const onMain = (index: number) => route.main[index]!
const onFork = (index: number) => route.main[cutFrom]! + index
const routeLines = guideFor(route.road)
routeLines.tech
  .hold(onMain(cutFrom) - 14, onMain(cutFrom) - 4, -8, 2.5)
  .chord([onMain(cutFrom) - 4, -8], [onFork(slotAt), SLOT_ACROSS], 1.5)
  .hold(onFork(slotAt), onFork(slotAt) + 1, SLOT_ACROSS, 1)
routeLines.slot(onFork(slotAt), SLOT_ACROSS)
export const ZHUWEI_ROUTE_GUIDE: TrackGuide = routeLines.build()
