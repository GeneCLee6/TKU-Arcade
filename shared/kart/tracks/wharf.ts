// 2026-11-19 (owner: "it is too easy to become an expert ... drift before the ramp, know the map
// by heart, shortcuts only the skilled get through: our maps should show that style"; docs/
// KART-FEEL.md §11). The first of the tracks to be learnt by heart. A working name: Wharf
// Warehouses (碼頭倉庫), an original yard of sheds, container rows and loading ramps on a quay.
// Laid corner by corner (lay.ts); most shortcuts are lanes inside a wide stretch of road, set apart
// by walls (guide.ts), and since 2026-11-20 the shed's is a road of its own, a branch (branches.ts;
// revision 2). The places that tell the driver who knows it from the one who only drives well:
//
// - the loading ramp: a jump straight into a hairpin. Taken square at full speed the car comes
//   down in the far wall, so the plain way is to lift before the crest; the fast way is the drift
//   jump: begin the drift before the ramp, carry it through the air, land already turning;
// - the shed: a left-hander round a long shed. The way everyone sees is the road round it; behind
//   the shed runs a lane of its own, a branch a third as long, and the only way in is a slot in a
//   wall across its mouth, off to its inside: a car must be lined up for it before it can see it;
// - the container rows: four square corners between rows of containers that stick out from
//   either side. Each row has a slot in line with the others: the straight line through all three
//   is hidden behind the first row;
// - the quay ramp: a jump before the last wide hairpin. A fence cuts the inside lane off from the
//   ground; only a car that left the ramp in a drift flies over it.
//
// Flat but for the two ramps. The layout is ours; no other game's track was looked at.
import { branchPath, gatesClearOf, roadDepth, routeRoad, type BranchJson } from '../branches.ts'
import { padsAlong, TRACK_FORMAT, type RoadPoint, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { fence, guideFor, island, type GuideBuilder, type TrackGuide } from './guide.ts'
import { fitted, lay, LAY_SAMPLE, layBranch, left, line, right } from './lay.ts'

/** The container rows: the road is this wide there, and each corner this tight */
const ROWS_WIDTH = 62
const ROWS_RADIUS = 38
const ROWS_LINE = 30
/** A slot through a row is this wide, metres */
export const SLOT = 10
/** The wide hairpins: the road's width and the middle's radius */
const SWEEP_WIDTH = 84
const SWEEP_RADIUS = 60
/** The shed's hairpin (2026-11-20): wider round, its lane a road of its own across inside it */
const SHED_RADIUS = 76
/**
 * Revision 3 (2026-11-20): the shed's hairpin reaches this much further out, metres, on both its
 * straights, so the road round the shed is 60 m longer while the lane behind it is not
 */
const SHED_REACH = 30
/**
 * The shed's lane peels off the road this many degrees round a wide curve, then turns square behind
 * the shed and square again onto the road, round this radius
 */
const LANE_MOUTH = 20
const LANE_RADIUS = 32
/** A fence that can be flown over stands this high, metres */
export const FENCE_HEIGHT = 1.5
/** A wall nothing flies over (a shed, a row of containers) is drawn and stands this high */
export const SHED_HEIGHT = 9

const laid = lay(
  [
    // The start straight, and a right along the quay
    line(100, 36, { mid: 'pad1' }),
    right(90, 40, 32),
    // The loading ramp: a jump straight into a hairpin
    line(170, 32, { mark: 'ramp1', mid: 'boxes1' }),
    line(30, 32),
    right(180, 34, 34),
    // The shed: a wide left-hander, a lane behind the shed
    line(70 + SHED_REACH, 40, { mark: 'shedIn' }),
    left(180, SHED_RADIUS, 40, { mark: 'shedOut', mid: 'shedMid' }),
    line(60 + SHED_REACH, 34),
    right(90, 40, 32),
    line(36, 32, { mark: 'rowsIn' }),
    // The container rows: four square corners, a slot through each row
    right(45, ROWS_RADIUS, ROWS_WIDTH),
    line(ROWS_LINE, ROWS_WIDTH),
    left(90, ROWS_RADIUS, ROWS_WIDTH, { mid: 'row1' }),
    line(ROWS_LINE, ROWS_WIDTH),
    right(90, ROWS_RADIUS, ROWS_WIDTH, { mid: 'row2' }),
    line(ROWS_LINE, ROWS_WIDTH),
    left(90, ROWS_RADIUS, ROWS_WIDTH, { mid: 'row3' }),
    line(ROWS_LINE, ROWS_WIDTH),
    right(45, ROWS_RADIUS, 36, { mark: 'rowsOut' }),
    // The quay ramp, and the last wide hairpin: a fence cuts the inside lane off from the ground
    fitted(36, { mark: 'ramp2' }),
    line(18, SWEEP_WIDTH),
    line(42, SWEEP_WIDTH, { mark: 'quayIn' }),
    right(180, SWEEP_RADIUS, SWEEP_WIDTH, { mark: 'quayOut', mid: 'quayMid' }),
    line(60, 34),
    // Home: the long quay, a left and a right onto the straight
    line(50, 34, { mid: 'pad2' }),
    left(25, 90, 32),
    right(50, 90, 32),
    left(25, 90, 32),
    line(50, 34),
    left(90, 40, 32),
    fitted(34, { mid: 'boxes2' }),
    right(90, 40, 36),
    line(142, 36),
  ],
  { width: 36, height: 0 },
)

const made = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [
    [...laid.marks.ramp1!, 2],
    [...laid.marks.ramp2!, 2],
  ],
  pads: [
    [...laid.marks.pad1!, 8],
    [...laid.marks.pad2!, -7],
  ],
  boxes: [
    [...laid.marks.boxes1!, [-9, -3, 3, 9]],
    // The road round the shed has a row; the lane behind it has none
    [...laid.marks.shedMid!, [-9, -3, 3, 9]],
    [...laid.marks.boxes2!, [-9, -3, 3, 9]],
  ],
})

const { road } = made
const at = (mark: string) => made.nearest(...laid.marks[mark]!)

// ── The walls ──
const ramp1 = at('ramp1')
const shedIn = at('shedIn')
const shedOut = at('shedOut')
const rows = [at('row1'), at('row2'), at('row3')] as const
const rowsIn = at('rowsIn')
const rowsOut = at('rowsOut')
const ramp2 = at('ramp2')
const quayIn = at('quayIn')
const quayOut = at('quayOut')

// The shed's lane: a branch inside the hairpin, from the straight before it to the one after
const laneFrom = shedIn - 10 - Math.round(SHED_REACH / LAY_SAMPLE)
const laneTo = shedOut + 7 + Math.round(SHED_REACH / LAY_SAMPLE)
const LANE = 28
const laneLaid = layBranch(
  road,
  laneFrom,
  laneTo,
  [
    // Peeled off the kerb, then square behind the shed, straight down its back wall, and square
    // onto the road again: the corners are tight, the way short
    left(LANE_MOUTH, 60, LANE),
    fitted(LANE, { mid: 'laneMouth' }),
    left(90 - LANE_MOUTH, LANE_RADIUS, LANE),
    fitted(LANE, { mid: 'laneMid' }),
    left(90, LANE_RADIUS, LANE),
  ],
  LANE,
)
const branches: BranchJson[] = [{ from: laneFrom, to: laneTo, road: laneLaid.road }]
const lanePath: RoadPoint[] = branchPath(road, branches[0]!)
/** The slot into the lane: a road point into where it runs clear of the road, off its middle */
const laneSlot =
  lanePath.findIndex((point) => roadDepth(road, true, point.x, point.z) < -point.width / 2) + 1
const LANE_SLOT_AT = 2
/** The quay's island, metres right of the middle; inside it is the lane only a flier reaches */
const QUAY_INNER = 4
const QUAY_OUTER = 8

const walls = [
  // The container rows: each from the kerb past the straight line through them, with a slot on it
  ...rows.flatMap((row, index) => {
    // The first and third corner turn left, the second right: the road's middle is that side of
    // the straight line, and the row comes in from the other
    const side = index === 1 ? 1 : -1
    const lineAt = side * 21.7
    return [
      ...fence(
        road,
        [
          [row, side * (ROWS_WIDTH / 2 + 1)],
          [row, lineAt + (side * SLOT) / 2],
        ],
        SHED_HEIGHT,
      ),
      ...fence(
        road,
        [
          [row, lineAt - (side * SLOT) / 2],
          [row, side * 10],
        ],
        SHED_HEIGHT,
      ),
    ]
  }),
  // The quay: an island round the hairpin, and the fence from the kerb after the ramp to its nose
  ...island(road, quayIn, quayOut, QUAY_INNER, QUAY_OUTER, SHED_HEIGHT),
  ...fence(
    road,
    [
      [ramp2 + 2, road[ramp2 + 2]!.width / 2 + 1],
      [quayIn - 1, (QUAY_INNER + QUAY_OUTER) / 2],
    ],
    FENCE_HEIGHT,
  ),
]

// ── The lines ──
/**
 * Both guides are drawn by the same hand: the main road's (`at` the identity) and the route's down
 * the shed's lane (`at` maps a main road point to the route's; routes.ts drives it there)
 */
function drawLines(guide: GuideBuilder, at: (index: number) => number): void {
  // Out of the loading ramp's hairpin on its inside, and round the shed for everyone
  guide.both.hold(at(shedIn) - 13, at(shedIn) - 9, 4, 6)
  guide.safe.hold(at(shedIn) - 8, at(shedOut) + 3, 0, 8)
  // The loading ramp: the drift jump is begun on the left of the road
  guide.tech.hold(at(ramp1) - 12, at(ramp1), -6, 3)
  guide.cue({
    lip: at(ramp1),
    way: 1,
    land: [at(ramp1) + 9, 0],
    into: 0.15,
    nose: (40 * Math.PI) / 180,
    most: 68,
  })
  // The container rows: round each row for everyone; the straight line through the slots
  guide.safe.hold(at(rowsIn), at(rowsOut), 0, 5)
  rows.forEach((row, index) =>
    guide.safe.hold(at(row) - 10, at(row) + 5, index === 1 ? -14 : 14, 5),
  )
  guide.tech
    .chord([at(rowsIn) - 6, 3], [at(rows[0]), -21.7], 2.5)
    .chord([at(rows[0]), -21.7], [at(rows[1]), 21.7], 2.5)
    .chord([at(rows[1]), 21.7], [at(rows[2]), -21.7], 2.5)
    .chord([at(rows[2]), -21.7], [at(rowsOut) + 3, -4], 2.5)
  rows.forEach((row, index) => guide.slot(at(row), index === 1 ? 21.7 : -21.7))
  // The quay: the outside lane for everyone; over the fence from a drift jump into the inside lane
  guide.safe.hold(at(ramp2) - 6, at(ramp2) + 3, -4, 6).hold(at(ramp2) + 4, at(quayOut) + 3, -19, 12)
  guide.tech
    .hold(at(quayIn) - 2, at(quayOut), 25, 6)
    .chord([at(quayOut), 25], [at(quayOut) + 7, 2], 4)
  guide.cue({
    lip: at(ramp2),
    way: 1,
    land: [at(quayIn) - 0.5, 24],
    into: 0.4,
    nose: (36 * Math.PI) / 180,
    most: 74,
  })
}

const mainLines = guideFor(road)
drawLines(mainLines, (index) => index)
export const WHARF_GUIDE: TrackGuide = mainLines.build()

// The route down the shed's lane: lined up on the road's left for the slot, through it, round
const route = routeRoad(
  { road, jumps: made.jumps, forks: [{ from: laneFrom, to: laneTo, path: lanePath, jumps: [] }] },
  [0],
)
const onLane = (index: number) => route.main[laneFrom]! + index
const routeLines = guideFor(route.road)
drawLines(routeLines, (index) => route.main[index]!)
routeLines.tech.chord([route.main[laneFrom]! - 10, 4], [onLane(laneSlot), LANE_SLOT_AT], 1.5)

export const WHARF_ROUTE_GUIDE: TrackGuide = routeLines.build()

// A boost pad in the shadow of each container row, just through its slot, and one in the quay's
// inside lane: what the technical line pays; and one down the shed's lane
const lanePads = [
  ...padsAlong(
    road,
    [...rows.map((row) => row + 2), quayIn + 8].map(
      (index) => [index, WHARF_GUIDE.tech[index]!] as const,
    ),
  ),
  ...padsAlong(lanePath, [[laneSlot + 3, 0]], { length: 12, width: 6 }),
]
const cleared = gatesClearOf(road, made.gates, made.respawns, branches)

export const WHARF: TrackJson = {
  format: TRACK_FORMAT,
  id: 'wharf',
  // Its name, settled by the owner on 2026-11-22 (docs/KART-WORLD.md §6)
  name: { en: 'Wharf Warehouses', 'zh-TW': '碼頭倉庫' },
  // 2: the shed's lane is a branch (2026-11-20)
  revision: 3,
  theme: 'day',
  laps: 3,
  road,
  gates: cleared.gates,
  respawns: cleared.respawns,
  grid: made.grid,
  solo: made.solo,
  walls,
  boostPads: [...made.boostPads, ...lanePads],
  itemBoxes: made.itemBoxes,
  decor: [],
  jumps: made.jumps,
  branches,
}
