// 2026-11-19 (owner: "drift before the ramp, know the map by heart, shortcuts only the skilled get
// through"; docs/KART-FEEL.md §11). The second of the tracks to be learnt by heart, and the hilly
// one. A working name: Hillside Lanes (山城坡巷), an original old quarter on a hillside above the
// river: a climb through three walled yards, a staircase of switchbacks down, a long sweep round the
// well at the foot. Laid corner by corner (lay.ts); each shortcut is a lane inside a wide stretch
// of road, set apart by walls (guide.ts).
//
// - the yards: the climb turns square round the walls of three yards. Each wall has a gate in line
//   with the others: the straight way up is hidden behind the first wall;
// - the staircase: down the hill by two switchbacks, each begun with a drop off a step (a jump
//   straight into a hairpin, the first to the right, the second to the left). The plain way is to
//   lift before each step; the fast way is the drift jump, twice, one way and then the other;
// - the well: a jump before the last wide hairpin. A fence cuts the inside lane off from the
//   ground; only a car that left the step in a drift flies over it.
//
// 12 m of climb. The layout is ours; no other game's track was looked at.
import { padsAlong, TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { fence, guideFor, island, type TrackGuide } from './guide.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'
import { FENCE_HEIGHT, SHED_HEIGHT, SLOT } from './wharf.ts'

const YARD_WIDTH = 62
const YARD_RADIUS = 38
const YARD_LINE = 30
const SWEEP_WIDTH = 84
const SWEEP_RADIUS = 60

const laid = lay(
  [
    // The start straight along the river, and a right up the hill
    line(90, 36, { mid: 'pad1' }),
    right(90, 40, 32, { height: 2 }),
    line(40, 32, { height: 2.5, mark: 'yardsIn' }),
    // The yards: the climb turns square round three walls, a gate through each
    left(45, YARD_RADIUS, YARD_WIDTH, { height: 3 }),
    line(YARD_LINE, YARD_WIDTH, { height: 4 }),
    right(90, YARD_RADIUS, YARD_WIDTH, { height: 5.5, mid: 'yard1' }),
    line(YARD_LINE, YARD_WIDTH, { height: 6.5 }),
    left(90, YARD_RADIUS, YARD_WIDTH, { height: 8, mid: 'yard2' }),
    line(YARD_LINE, YARD_WIDTH, { height: 9 }),
    right(90, YARD_RADIUS, YARD_WIDTH, { height: 10.5, mid: 'yard3' }),
    line(YARD_LINE, YARD_WIDTH, { height: 11 }),
    left(45, YARD_RADIUS, 36, { height: 11.5, mark: 'yardsOut' }),
    // The top of the hill, and the right onto the way down
    right(90, 44, 34, { height: 12 }),
    line(50, 34, { height: 12, mid: 'boxes1' }),
    // The staircase: a step into a right hairpin, a step into a left one
    line(60, 34, { height: 11.5, mark: 'step1' }),
    line(30, 34, { height: 11.3 }),
    right(180, 34, 34, { height: 11 }),
    line(50, 34, { height: 8, mark: 'step2' }),
    line(30, 34, { height: 7.8 }),
    left(180, 34, 36, { height: 7.5 }),
    // Across the foot of the hill to the well
    right(45, 60, 36, { height: 5.5 }),
    fitted(34, { height: 3.5, mid: 'pad2' }),
    left(45, 60, 38, { height: 2 }),
    fitted(36, { height: 0, mark: 'step3' }),
    line(18, SWEEP_WIDTH),
    line(42, SWEEP_WIDTH, { mark: 'wellIn' }),
    right(180, SWEEP_RADIUS, SWEEP_WIDTH, { mark: 'wellOut', mid: 'wellMid' }),
    line(60, 34),
    // Home along the river: three fast sweeps
    left(25, 90, 32),
    right(50, 90, 32, { mid: 'boxes2' }),
    left(25, 90, 32),
    line(100, 36),
  ],
  { width: 36, height: 0 },
)

const made = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [
    [...laid.marks.step1!, 1],
    [...laid.marks.step2!, 1],
    [...laid.marks.step3!, 2],
  ],
  pads: [
    [...laid.marks.pad1!, 8],
    [...laid.marks.pad2!, -7],
  ],
  boxes: [
    [...laid.marks.boxes1!, [-9, -3, 3, 9]],
    // The well's long way round has a row; the lane inside has none
    [...laid.marks.wellMid!, [-36, -29, -22, -15, -8]],
    [...laid.marks.boxes2!, [-9, -3, 3, 9]],
  ],
})

const { road } = made
const at = (mark: string) => made.nearest(...laid.marks[mark]!)

const yardsIn = at('yardsIn')
const yardsOut = at('yardsOut')
const yards = [at('yard1'), at('yard2'), at('yard3')] as const
const step1 = at('step1')
const step2 = at('step2')
const step3 = at('step3')
const wellIn = at('wellIn')
const wellOut = at('wellOut')

/** The well's island, metres right of the middle; inside it is the lane only a flier reaches */
const WELL_INNER = 4
const WELL_OUTER = 8
/** The straight line through the gates is this far from the road's middle at each wall */
const GATE_LINE = 21.7

const walls = [
  // The yard walls: each from the kerb past the straight line through them, with a gate on it.
  // The first corner turns right, the second left: the road's middle is the other side of the
  // straight line, and the wall comes in from the inside of the corner
  ...yards.flatMap((yard, index) => {
    const side = index === 1 ? -1 : 1
    const lineAt = side * GATE_LINE
    return [
      ...fence(
        road,
        [
          [yard, side * (YARD_WIDTH / 2 + 1)],
          [yard, lineAt + (side * SLOT) / 2],
        ],
        SHED_HEIGHT,
      ),
      ...fence(
        road,
        [
          [yard, lineAt - (side * SLOT) / 2],
          [yard, side * 10],
        ],
        SHED_HEIGHT,
      ),
    ]
  }),
  // The well: an island round the hairpin, and the fence from the kerb after the step to its nose
  ...island(road, wellIn, wellOut, WELL_INNER, WELL_OUTER, SHED_HEIGHT),
  ...fence(
    road,
    [
      [step3 + 2, road[step3 + 2]!.width / 2 + 1],
      [wellIn - 1, (WELL_INNER + WELL_OUTER) / 2],
    ],
    FENCE_HEIGHT,
  ),
]

const guide = guideFor(road)
// The yards: round each wall for everyone; the straight line through the gates
guide.safe.hold(yardsIn, yardsOut, 0, 5)
yards.forEach((yard, index) => guide.safe.hold(yard - 10, yard + 5, index === 1 ? 14 : -14, 5))
guide.tech
  .chord([yardsIn - 6, -3], [yards[0], GATE_LINE], 2.5)
  .chord([yards[0], GATE_LINE], [yards[1], -GATE_LINE], 2.5)
  .chord([yards[1], -GATE_LINE], [yards[2], GATE_LINE], 2.5)
  .chord([yards[2], GATE_LINE], [yardsOut, -2], 2.5)
yards.forEach((yard, index) => guide.slot(yard, index === 1 ? -GATE_LINE : GATE_LINE))
// The staircase: each drift jump is begun on the outside of the hairpin it lands in
guide.tech.hold(step1 - 10, step1, -6, 3).hold(step2 - 5, step2, 6, 3)
guide.cue({
  lip: step1,
  way: 1,
  land: [step1 + 9, 0],
  into: 0.15,
  nose: (40 * Math.PI) / 180,
  most: 60,
})
guide.cue({
  lip: step2,
  way: -1,
  land: [step2 + 9, 0],
  into: 0.15,
  nose: (40 * Math.PI) / 180,
  most: 60,
})
// The well: the outside lane for everyone; over the fence from a drift jump into the inside lane
guide.safe.hold(step3 - 6, step3 + 3, -4, 6).hold(step3 + 4, wellOut + 3, -19, 12)
guide.tech
  .hold(step3 - 12, step3, -6, 4)
  .hold(wellIn - 2, wellOut, 25, 6)
  .chord([wellOut, 25], [wellOut + 7, 2], 4)
guide.cue({
  lip: step3,
  way: 1,
  land: [wellIn - 0.5, 24],
  into: 0.4,
  nose: (36 * Math.PI) / 180,
  most: 74,
})

export const LANES_GUIDE: TrackGuide = guide.build()

// A boost pad in the shadow of each yard wall, just through its gate, and one in the well's inside
// lane: what the technical line pays
const lanePads = padsAlong(
  road,
  [...yards.map((yard) => yard + 2), wellIn + 4, wellIn + 14].map(
    (index) => [index, LANES_GUIDE.tech[index]!] as const,
  ),
)

export const LANES: TrackJson = {
  format: TRACK_FORMAT,
  id: 'lanes',
  // Its name, settled by the owner on 2026-11-22 (docs/KART-WORLD.md §6)
  name: { en: 'Hillside Lanes', 'zh-TW': '山城坡巷' },
  revision: 2,
  theme: 'sunset',
  laps: 3,
  road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  solo: made.solo,
  walls,
  boostPads: [...made.boostPads, ...lanePads],
  itemBoxes: made.itemBoxes,
  decor: [],
  jumps: made.jumps,
}

/**
 * Where the technical places are, by road point: what the reversed track's guide is touched up by
 * (reverseGuides.ts)
 */
export const LANES_MARKS = { yards, yardsIn, yardsOut, step1, step2, step3, wellIn, wellOut } as const
