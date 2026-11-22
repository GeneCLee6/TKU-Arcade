// N2 (e10-t04a): the item track. Named Lantern Old Street (settled in KART-WORLD.md,
// 2026-11-22): an original night market on an old riverside street, lanterns strung over the road. The
// PRD asks for a track made for the item race (E10: wide roads, many boxes, a shortcut), so it plays
// differently from the three technical tracks:
//
// - a long riverside promenade to the line and a long market street: wide (40 to 44 m) for rows of
//   boxes, straight for thrown items to fly down;
// - the temple fork: a wide right-hand sweep round the temple square, split by a long island of
//   stalls. The outside lane is the safe one and carries a row of boxes; the inside lane (the alley
//   behind the stalls) is about 100 m shorter, but tight, walled on both sides and boxless;
// - narrower back lanes (28 to 30 m): esses and a hairpin, where something dropped behind is hard
//   to miss, with two boxes on the hairpin's inside kerb for whoever dares the tight line.
//
// Flat, like every track so far: the physics is on a plane (stepKart has no height), so there is
// no jump or ramp. The layout is ours; no other game's track was looked at.
//
// 2026-11-18, owner: "more fun, not so many straights ... technical" (revision 5; docs/KART-FEEL.md
// §10). The straights are broken up and the back lanes made to matter, the fork left as it was: the
// promenade now ends in the ferry alley (29 m: right, left, right) onto the market street; the back
// lanes' esses swing 20 m either way where they swung 8; the shophouse row kinks round the well; the
// old street home runs through one last alley. The boxes are placed again: the rows where the road
// is wide, a pair on the line through the ferry alley and through the back lanes.
import { branchPath, gatesClearOf, roadDepth, routeRoad, type BranchJson } from '../branches.ts'
import {
  gatesAlong,
  padsAlong,
  headingOf,
  roadDirection,
  TRACK_FORMAT,
  type RoadPoint,
  type TrackJson,
} from '../track.ts'
import { lineGrid, LINE_BACK, LINE_SOLO_ACROSS } from '../startLine.ts'
import type { Wall } from '../walls.ts'
import { fence, guideFor, type TrackGuide } from './guide.ts'
import { fitted, layBranch, left } from './lay.ts'
import { splineRoad, type ControlPoint } from './spline.ts'
import { SHED_HEIGHT } from './wharf.ts'

/** Metres between road points */
const SAMPLE = 6

/** The fork's road is this wide: room for both lanes and the island between them */
export const FORK_WIDTH = 84
/** Where the stall island lies across the fork, metres right of the centre line */
export const ISLAND_INNER = 7
export const ISLAND_OUTER = 13
/** Road points this wide or wider carry the island: the inside lane is 28 m there at the least */
const ISLAND_FROM = 82

/** [x, z, width]: the line through the middle of the road, in driving order */
const CONTROL: readonly ControlPoint[] = [
  // The riverside promenade, northwards (-z), the river on the left
  [0, 236, 38],
  [0, 100, 40],
  [0, -50, 40],
  // The ferry alley (2026-11-18): right, left and right again through a 29 m lane, onto the market
  // street
  [8, -112, 32],
  [46, -160, 29],
  [50, -212, 29],
  [70, -260, 30],
  [108, -286, 36],
  // The market street, eastwards: lanterns overhead, stalls on both sides
  [160, -290, 44],
  [230, -290, 44],
  // The temple fork: the road opens out, the stall island splits it, and it sweeps right round the
  // temple square back to the west
  [292, -290, 64],
  [345, -287, FORK_WIDTH],
  [405, -268, FORK_WIDTH],
  [444, -215, FORK_WIDTH],
  [444, -150, FORK_WIDTH],
  [404, -100, FORK_WIDTH],
  [345, -84, FORK_WIDTH],
  [292, -84, 64],
  // Back west down the lantern lane
  [230, -86, 42],
  [170, -86, 40],
  // A left into the back lanes, southwards, and the esses: right, left, right
  [140, -78, 30],
  [120, -52, 29],
  [126, -8, 28],
  [98, 45, 28],
  [140, 100, 28],
  [104, 155, 29],
  // A left onto the shophouse row, eastwards
  [128, 204, 32],
  [176, 222, 36],
  // ... which kinks round the well: left, then right
  [238, 204, 30],
  [298, 234, 32],
  [334, 226, 34],
  // The ferry-pier hairpin: right, round to the west
  [362, 230, 30],
  [380, 262, 29],
  [366, 296, 29],
  [326, 310, 34],
  // The old street home, westwards, and the right onto the promenade
  [262, 312, 42],
  [200, 312, 40],
  // ... through the last alley: right, then left
  [140, 292, 30],
  [84, 322, 30],
  [44, 310, 34],
  [16, 296, 34],
  [3, 268, 36],
]

const road = splineRoad(CONTROL, SAMPLE)

/** The start and finish line: the first road point on the promenade at or past z = 120 */
const FINISH = road.findIndex((point) => point.x === 0 && point.z <= 110)

// The road starts at the line, so that gate 0 is the finish
const flatLine = [...road.slice(FINISH), ...road.slice(0, FINISH)]

/**
 * 2026-11-22 (#103, revision 10): the old street home's step. A ramp up to a lip 1.6 m high across
 * the old street, just before it bends right into the last alley: square, the car comes down in the
 * bend and must lift before the crest; begun in a drift to the right, it lands already turning
 * (terrain.ts's drift jump). Its road point: the one nearest (183, 307)
 */
const STEP_HEIGHT = 1.6
const stepLip = flatLine.reduce(
  (best, point, index) =>
    Math.hypot(point.x - 183, point.z - 307) <
    Math.hypot(flatLine[best]!.x - 183, flatLine[best]!.z - 307)
      ? index
      : best,
  0,
)
const fromLine: RoadPoint[] = flatLine.map((point, index) =>
  index === stepLip
    ? { ...point, y: STEP_HEIGHT }
    : index === stepLip - 1
      ? { ...point, y: STEP_HEIGHT / 2 }
      : point,
)
const { gates, respawns } = gatesAlong(fromLine, 7)
const along = roadDirection(fromLine, 0)

/** A point `across` metres right of road point `index` (negative: left) */
function across(road: readonly RoadPoint[], index: number, across: number) {
  const point = road[(index + road.length) % road.length]!
  const { dx, dz } = roadDirection(road, (index + road.length) % road.length)
  // The road's right, facing along it, is (-dz, dx)
  return {
    x: Math.round((point.x - dz * across) * 100) / 100,
    z: Math.round((point.z + dx * across) * 100) / 100,
  }
}

/** The road points that carry the island, in driving order (one run, not across the line) */
export function islandSpan(road: readonly RoadPoint[]): { first: number; last: number } {
  const first = road.findIndex((point) => point.width >= ISLAND_FROM)
  let last = first
  while (last + 1 < road.length && road[last + 1]!.width >= ISLAND_FROM) last++
  return { first, last }
}

/**
 * The stall island as walls: along both its edges, closed by a pointed nose at each end (one road
 * point beyond, in the middle), so that a kart meeting it head-on glances off into a lane
 */
export function islandOutline(road: readonly RoadPoint[]): { x: number; z: number }[] {
  const { first, last } = islandSpan(road)
  const middle = (ISLAND_INNER + ISLAND_OUTER) / 2
  const inner: { x: number; z: number }[] = []
  const outer: { x: number; z: number }[] = []
  for (let index = first; index <= last; index++) {
    inner.push(across(road, index, ISLAND_INNER))
    outer.push(across(road, index, ISLAND_OUTER))
  }
  // Round the loop: in along the inner edge, the far nose, back along the outer edge, the near nose
  return [
    across(road, first - 1, middle),
    ...inner,
    across(road, last + 1, middle),
    ...outer.reverse(),
  ]
}

const outline = islandOutline(fromLine)
const islandWalls: Wall[] = outline.map((a, index) => {
  const b = outline[(index + 1) % outline.length]!
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z }
})

/** The road point nearest (x, z) */
const nearestIndex = (x: number, z: number) => {
  let best = 0
  let distance = Infinity
  fromLine.forEach((point, index) => {
    const d = (point.x - x) ** 2 + (point.z - z) ** 2
    if (d < distance) {
      distance = d
      best = index
    }
  })
  return best
}

/** A row of item boxes across the road at the point nearest (x, z), `across` metres right each */
const row = (x: number, z: number, offsets: readonly number[]) => {
  const index = nearestIndex(x, z)
  return offsets.map((offset) => across(fromLine, index, offset))
}

const span = islandSpan(fromLine)
/** The market street's boost pad (2026-11-20): at this road point, on the middle of the road */
const PAD_MARKET = 78
/** The alley's boost pads lie this far right of the centre line: the middle of the inside lane */
const ALLEY_PAD = 27
const apex = Math.round((span.first + span.last) / 2)

// ── The lantern alley (2026-11-22, #103): a second shortcut, a road of its own (branches.ts) ──
// Off the lantern lane's left kerb before its left turn into the back lanes, across the corner's
// inside and back onto the back lanes: about 130 m where the road round is about 165 m. Halfway
// along it a shophouse wall closes it but for a doorway off to its right: a car must be lined up
// for it from the lane, before it can see it (the slot of docs/KART-FEEL.md §11)
const ALLEY_WIDTH = 14
/** The alley leaves the lane at this road point and joins the back lanes at that one */
const alleyFrom = nearestIndex(217, -86)
const alleyTo = nearestIndex(124, -3)
const alleyLaid = layBranch(
  fromLine,
  alleyFrom,
  alleyTo,
  [left(40, 12, ALLEY_WIDTH), fitted(ALLEY_WIDTH, { mid: 'on' }), left(25, 60, ALLEY_WIDTH), fitted(ALLEY_WIDTH)],
  ALLEY_WIDTH,
)
const branches: BranchJson[] = [{ from: alleyFrom, to: alleyTo, road: alleyLaid.road }]
const alleyPath = branchPath(fromLine, branches[0]!)
/**
 * The doorway: two road points past where the alley is clear of the lane, its middle this far right,
 * this wide
 */
export const ALLEY_DOOR = alleyPath.findIndex((point) => roadDepth(fromLine, true, point.x, point.z) < -point.width / 2) + 2
export const ALLEY_DOOR_AT = 3
export const ALLEY_DOOR_WIDTH = 9.5
const alleyWalls: Wall[] = [
  ...fence(
    alleyPath,
    [
      [ALLEY_DOOR, -(ALLEY_WIDTH / 2 + 1)],
      [ALLEY_DOOR, ALLEY_DOOR_AT - ALLEY_DOOR_WIDTH / 2],
    ],
    SHED_HEIGHT,
  ),
  ...fence(
    alleyPath,
    [
      [ALLEY_DOOR, ALLEY_DOOR_AT + ALLEY_DOOR_WIDTH / 2],
      [ALLEY_DOOR, ALLEY_WIDTH / 2 + 1],
    ],
    SHED_HEIGHT,
  ),
]
const cleared = gatesClearOf(fromLine, gates, respawns, branches)

// The route down the alley (routes.ts drives it): lined up from the lane with the doorway, through
const route = routeRoad({ road: fromLine, jumps: [stepLip], forks: [{ from: alleyFrom, to: alleyTo, path: alleyPath, jumps: [] }] }, [0])
const onLane = (index: number) => route.main[alleyFrom]! + index

/**
 * 2026-11-23 (#150): the old street home's step. The master lifted before the crest like everyone
 * else. The lip sits where the right kink is all but done and the last alley's left is coming, so
 * the drift that pays is to the left: begun late on the crest, the tail kept nearly in line in the
 * air (a wider swing runs the landing into the right kerb), down about twelve road points on at the
 * middle, already turning in (measured with scripts/kart/drivers.ts' master: as fast as lifting,
 * three drift jumps a race). A guide of this cue alone: the rest of the road is driven as the hands
 * find it (round the stall island, minding the kerbs), as before there was a guide
 */
const stepGuide = guideFor(fromLine)
stepGuide.cue({
  lip: stepLip,
  way: -1,
  land: [stepLip + 12, 0],
  into: 0.2,
  nose: (10 * Math.PI) / 180,
  most: 62,
})
/** The old street's main road guide: the step's drift jump alone (shared/kart/tracks/guides.ts) */
export const OLDSTREET_GUIDE: TrackGuide = { ...stepGuide.build(), cuesOnly: true }

const routeLines = guideFor(route.road)
/** Where the alley is clear of the lane, by its own road points */
const alleyClear = alleyPath.findIndex((point) => roadDepth(fromLine, true, point.x, point.z) < -point.width / 2)
// Down the middle of the lane to the alley's mouth (the kerbs either side), then down the alley's
// middle and across to the doorway
routeLines.tech
  .hold(route.main[alleyFrom]! - 14, onLane(alleyClear), 0, 1.5)
  .chord([onLane(alleyClear), 0], [onLane(ALLEY_DOOR), ALLEY_DOOR_AT], 1.5)
  .hold(onLane(ALLEY_DOOR), onLane(ALLEY_DOOR) + 1, ALLEY_DOOR_AT, 1)
routeLines.slot(onLane(ALLEY_DOOR), ALLEY_DOOR_AT)
/** The old street's route guide: the alley's doorway on the technical line (shared/kart/tracks/guides.ts) */
export const OLDSTREET_ROUTE_GUIDE: TrackGuide = routeLines.build()

export const OLDSTREET: TrackJson = {
  format: TRACK_FORMAT,
  id: 'oldstreet',
  name: { en: 'Lantern Old Street', 'zh-TW': '燈籠老街' },
  // 2: the classic feel (2026-11-17): the physics changed, so the old times are set aside
  // 5: the straights broken up by alleys, the back lanes' esses made real (2026-11-18)
  // 6: the same layout under new physics (2026-11-18: any real drift earns the instant boost)
  // 8: two boost pads in the fork's alley (2026-11-19); 9: one down the market street (2026-11-20)
  // 11: the lantern alley, a second shortcut, and the old street home's step (2026-11-22, #146)
  revision: 11,
  laps: 3,
  road: fromLine,
  gates: cleared.gates,
  respawns: cleared.respawns,
  // One row across the promenade behind the line (2026-11-21, startLine.ts)
  grid: lineGrid(
    {
      x: fromLine[0]!.x - along.dx * LINE_BACK,
      z: fromLine[0]!.z - along.dz * LINE_BACK,
      heading: headingOf(along),
    },
    fromLine[0]!.width,
  ),
  // The time trial's start, where the pole stood before the row (to the centimetre)
  solo: {
    x: Math.round((fromLine[0]!.x - along.dx * LINE_BACK + -along.dz * LINE_SOLO_ACROSS) * 100) / 100,
    z: Math.round((fromLine[0]!.z - along.dz * LINE_BACK + along.dx * LINE_SOLO_ACROSS) * 100) / 100,
    heading: headingOf(along),
  },
  walls: [...islandWalls, ...alleyWalls],
  // Off the middle of the straights: taking one is a choice of line
  boostPads: padsAlong(fromLine, [
    [12, 10],
    [nearestIndex(176, 222), -8],
    [nearestIndex(240, 312), 10],
    // 2026-11-19: two in the alley behind the stalls, which only the short way reaches: the
    // shortcut pays in speed as well as in metres (docs/KART-FEEL.md §11.4)
    [span.first + 4, ALLEY_PAD],
    [span.last - 4, ALLEY_PAD],
    // 2026-11-20: one down the middle of the market street, where nothing else is worth a drift
    // (the expert's boost cover reaches 70%; docs/KART-FEEL.md §14)
    [PAD_MARKET, 0],
  ]).concat(
    // 2026-11-22: one down the lantern alley, past its doorway: what the shortcut pays
    padsAlong(alleyPath, [[ALLEY_DOOR + 3, 0]], { length: 12, width: 6 }),
  ),
  // The item race reads these (shared/kart/items.ts): rows across the wide parts, a row in the
  // fork's safe lane, two on the hairpin's inside kerb
  itemBoxes: [
    // The promenade, past the line
    ...row(0, 0, [-15, -9, -3, 3, 9, 15]),
    // The market street
    ...row(200, -290, [-17, -10, -3, 4, 11, 18]),
    // The fork's outside lane, at the sweep's apex (the inside lane, the shortcut, has none)
    ...[-34, -26, -18, -10, -2].map((offset) => across(fromLine, apex, offset)),
    // The lantern lane, back west
    ...row(200, -86, [-14, -7, 0, 7, 14]),
    // The hairpin's inside kerb: the tight line
    ...row(378, 262, [6, 10.5]),
    // The old street home
    ...row(240, 312, [-15, -9, -3, 3, 9, 15]),
    // The ferry alley's middle and the back lanes: a pair each, on the racing line
    ...row(50, -190, [-4, 4]),
    ...row(118, 62, [-4, 4]),
  ],
  decor: [],
  jumps: [stepLip],
  branches,
}
