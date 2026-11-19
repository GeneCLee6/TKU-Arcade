// 2026-11-19 (owner: "it is too easy to become an expert ... drift before the ramp, know the map
// by heart, shortcuts only the skilled get through: our maps should show that style"; docs/
// KART-FEEL.md §11). The first of the tracks to be learnt by heart. A working name: Wharf
// Warehouses (碼頭倉庫), an original yard of sheds, container rows and loading ramps on a quay.
// Laid corner by corner (lay.ts); the road model is what it was, and each shortcut is a lane
// inside a wide stretch of road, set apart by walls (guide.ts). Three places tell the driver who
// knows it from the one who only drives well:
//
// - the loading ramp: a jump straight into a hairpin. Taken square at full speed the car comes
//   down in the far wall, so the plain way is to lift before the crest; the fast way is the drift
//   jump: begin the drift before the ramp, carry it through the air, land already turning;
// - the shed: a wide left-hander round a long shed. The way everyone sees is round the outside;
//   behind the shed is a lane a third as long, and the only way in is a gap in a slanted wall that
//   a car must already be sliding left to fit through;
// - the container rows: four square corners between rows of containers that stick out from
//   either side. Each row has a slot in line with the others: the straight line through all three
//   is hidden behind the first row;
// - the quay ramp: a jump before the last wide hairpin. A fence cuts the inside lane off from the
//   ground; only a car that left the ramp in a drift flies over it.
//
// Flat but for the two ramps. The layout is ours; no other game's track was looked at.
import { padsAlong, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { fence, guideFor, island, type TrackGuide } from './guide.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'

/** The container rows: the road is this wide there, and each corner this tight */
const ROWS_WIDTH = 62
const ROWS_RADIUS = 38
const ROWS_LINE = 30
/** A slot through a row is this wide, metres */
export const SLOT = 10
/** The wide hairpins: the road's width and the middle's radius */
const SWEEP_WIDTH = 84
const SWEEP_RADIUS = 60
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
    line(70, SWEEP_WIDTH, { mark: 'shedIn' }),
    left(180, SWEEP_RADIUS, SWEEP_WIDTH, { mark: 'shedOut', mid: 'shedMid' }),
    line(60, 34),
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
    line(110, 36),
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
    // The shed's long way round has a row; the lane behind it has none
    [...laid.marks.shedMid!, [8, 15, 22, 29, 36]],
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

/** The shed stands between these, metres left of the middle; behind it is the lane */
const SHED_INNER = -8
const SHED_OUTER = -12
/** The gap into the lane: across the lane's mouth this many road points before the bend, here */
const GAP_BEFORE = 3.33
const GAP_AT = -18.3
/** The quay's island, metres right of the middle; inside it is the lane only a flier reaches */
const QUAY_INNER = 4
const QUAY_OUTER = 8

const walls = [
  // The shed, begun on the straight before the bend, and the wall across the mouth of the lane
  // behind it, with one gap: on the straight line that meets the lane's curve without a kink
  ...island(road, shedIn - 4, shedOut, SHED_OUTER, SHED_INNER, SHED_HEIGHT),
  ...fence(
    road,
    [
      [shedIn - GAP_BEFORE, SHED_OUTER + 1],
      [shedIn - GAP_BEFORE, GAP_AT + SLOT / 2],
    ],
    SHED_HEIGHT,
  ),
  ...fence(
    road,
    [
      [shedIn - GAP_BEFORE, GAP_AT - SLOT / 2],
      [shedIn - GAP_BEFORE, -(road[shedIn - 3]!.width / 2 + 1)],
    ],
    SHED_HEIGHT,
  ),
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
const guide = guideFor(road)
// The loading ramp: the drift jump is begun on the left of the road
guide.tech.hold(ramp1 - 12, ramp1, -6, 3)
guide.cue({ lip: ramp1, way: 1, land: [ramp1 + 9, 0], into: 0.15, nose: (40 * Math.PI) / 180, most: 68 })
// The shed: round the outside for everyone; through the gap and behind the shed for who knows it
guide.safe.hold(shedIn - 13, shedIn - 9, 4, 6).hold(shedIn - 8, shedOut + 3, 14, 12)
guide.tech
  .chord([shedIn - 11.6, 4], [shedIn - GAP_BEFORE, GAP_AT], 2)
  .chord([shedIn - GAP_BEFORE, GAP_AT], [shedIn + 4, -30], 3)
  .hold(shedIn + 4, shedOut, -30, 4)
  .chord([shedOut, -30], [shedOut + 7, -2], 4)
guide.slot(shedIn - GAP_BEFORE, GAP_AT)
// The container rows: round each row for everyone; the straight line through the slots
guide.safe.hold(rowsIn, rowsOut, 0, 5)
rows.forEach((row, index) => guide.safe.hold(row - 10, row + 5, index === 1 ? -14 : 14, 5))
guide.tech
  .chord([rowsIn - 6, 3], [rows[0], -21.7], 2.5)
  .chord([rows[0], -21.7], [rows[1], 21.7], 2.5)
  .chord([rows[1], 21.7], [rows[2], -21.7], 2.5)
  .chord([rows[2], -21.7], [rowsOut + 3, -4], 2.5)
rows.forEach((row, index) => guide.slot(row, index === 1 ? 21.7 : -21.7))
// The quay: the outside lane for everyone; over the fence from a drift jump into the inside lane
guide.safe.hold(ramp2 - 6, ramp2 + 3, -4, 6).hold(ramp2 + 4, quayOut + 3, -19, 12)
guide.tech
  .hold(quayIn - 2, quayOut, 25, 6)
  .chord([quayOut, 25], [quayOut + 7, 2], 4)
guide.cue({ lip: ramp2, way: 1, land: [quayIn - 0.5, 24], into: 0.4, nose: (36 * Math.PI) / 180, most: 74 })

export const WHARF_GUIDE: TrackGuide = guide.build()

// A boost pad behind the shed, one in the shadow of each container row, just through its slot, and
// one in the quay's inside lane: what the technical line pays
const lanePads = padsAlong(
  road,
  [shedIn + 9, ...rows.map((row) => row + 2), quayIn + 8].map(
    (index) => [index, WHARF_GUIDE.tech[index]!] as const,
  ),
)

export const WHARF: TrackJson = {
  format: TRACK_FORMAT,
  id: 'wharf',
  // A working name (2026-11-19): the owner may rename it (docs/KART-WORLD.md §6)
  name: { en: 'Wharf Warehouses', 'zh-TW': '碼頭倉庫' },
  revision: 1,
  theme: 'day',
  laps: 3,
  road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  walls,
  boostPads: [...made.boostPads, ...lanePads],
  itemBoxes: made.itemBoxes,
  decor: [],
  jumps: made.jumps,
}
