// 2026-11-20 (owner: "drift before the ramp, know the map by heart, shortcuts only the skilled get
// through: our maps should show that style"; docs/KART-FEEL.md §12). The third of the tracks to be
// learnt by heart, and the first with real branches (shared/kart/branches.ts): roads of their own
// that leave the main road and join it again. A working name: Viaduct Works (高架廠區), an original
// riverside factory quarter under an elevated line: sheds, a foundry yard, loading decks. Laid
// corner by corner (lay.ts); the branches too (`layBranch`). Three of them, each asking for its own
// hands, and each costly to get wrong:
//
// - the loading deck: a ramp before the long way round the foundry yard. A low fence closes the
//   deck off from the road; a car that leaves the ramp in a drift to the left flies over it and
//   lands on the deck, raised above the yard, which runs straight across. A car that jumps square
//   lands on the road and goes round; one that drifts too little meets the fence;
// - the narrow alley: down the side of the long loop round the slag heap a narrow alley runs
//   straight, its mouth a slot in a tall wall at the far side of the road. Lined up early, a car
//   goes through it flat out; a little off, it hits the wall;
// - the blind cut: over the crest of the bridge ramp, a cut between two sheds leaves to the left at
//   once, behind a wall: a car must already be on the left and turning as it crests, without seeing
//   where it goes. Late, it meets the shed's corner.
//
// The layout is ours; no other game's track was looked at.
import { branchPath, gatesClearOf, roadDepth, routeRoad, type BranchJson } from '../branches.ts'
import { padsAlong, TRACK_FORMAT, type RoadPoint, type TrackJson } from '../track.ts'
import type { Wall } from '../walls.ts'
import { circuit } from './circuit.ts'
import { acrossRoad, fence, guideFor, type TrackGuide } from './guide.ts'
import { fitted, lay, LAY_SAMPLE, layBranch, left, line, right } from './lay.ts'
import { FENCE_HEIGHT, SHED_HEIGHT } from './wharf.ts'

const W = 34
const DECK = 14
const ALLEY = 14
const CUT = 13

const laid = lay(
  [
    // The start straight, and a right onto the yard road
    line(110, 36, { mid: 'pad1' }),
    right(90, 45, W, { mark: 'eastIn' }),
    line(70, W, { mid: 'boxes1' }),
    // The loading deck's ramp, and the long way round the foundry yard
    line(80, W, { mark: 'lipA' }),
    line(50, W),
    right(90, 38, W, { mark: 'yardIn' }),
    line(55, W),
    left(90, 38, W),
    line(40, W, { mid: 'yardMid' }),
    left(90, 38, W),
    line(55, W),
    right(90, 38, W, { mark: 'yardOut' }),
    line(70, W),
    right(90, 45, W),
    // The slag heap: round its loop, the alley down its side
    line(50, W, { mark: 'alleyIn' }),
    left(90, 35, W),
    line(60, W),
    right(180, 45, W, { mid: 'heap' }),
    line(60, W),
    left(90, 35, W, { mark: 'alleyOut' }),
    fitted(W, { mid: 'boxes2' }),
    right(90, 45, W),
    // The bridge ramp: up to its crest, the blind cut over it, the long sweep north of it
    line(60, W, { height: 4, mark: 'crestUp' }),
    line(30, W, { height: 5, mark: 'crest' }),
    line(30, W, { height: 4 }),
    right(45, 70, W, { height: 1.5 }),
    line(90, W, { height: 0, mid: 'sweepMid' }),
    left(90, 60, W),
    line(90, W),
    right(45, 70, W, { mark: 'sweepOut' }),
    fitted(W, { mid: 'pad2' }),
    right(90, 45, 36),
    line(280, 36),
  ],
  { width: 36, height: 0 },
)

const made = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [[...laid.marks.lipA!, 2.5]],
  pads: [
    [...laid.marks.pad1!, 8],
    [...laid.marks.pad2!, -7],
  ],
  boxes: [
    [...laid.marks.boxes1!, [-9, -3, 3, 9]],
    [...laid.marks.yardMid!, [-9, -3, 3, 9]],
    [...laid.marks.boxes2!, [-9, -3, 3, 9]],
  ],
})

const { road } = made
const at = (mark: string) => made.nearest(...laid.marks[mark]!)
const lipA = at('lipA')
const yardOut = at('yardOut')
const alleyIn = at('alleyIn')
const alleyOut = at('alleyOut')
const crest = at('crest')
const sweepOut = at('sweepOut')

// ── The branches ──
// The loading deck: off the road just past the ramp, left and up, straight over the yard, down
const deckFrom = lipA
const deckTo = yardOut + 4
const deck = layBranch(
  road,
  deckFrom,
  deckTo,
  [
    left(28, 14, DECK, { height: 2 }),
    line(50, DECK, { height: 3.5, mid: 'deckOn' }),
    right(32, 110, DECK, { height: 3.5 }),
    fitted(DECK, { height: 3.5, mid: 'deckMid' }),
    right(25, 60, DECK, { height: 2 }),
    fitted(DECK, { height: 0.5 }),
    left(25, 60, DECK, { height: 0 }),
  ],
  DECK,
)
// The narrow alley: straight down the side of the loop, its mouth at the road's far side
const alleyFrom = alleyIn - 2
const alleyTo = alleyOut + 2
const alley = layBranch(
  road,
  alleyFrom,
  alleyTo,
  [
    right(12, 80, ALLEY),
    fitted(ALLEY),
    left(12, 80, ALLEY, { mid: 'alleyMid' }),
    fitted(ALLEY),
    left(10, 80, ALLEY),
    line(10, ALLEY),
    right(10, 80, ALLEY),
  ],
  ALLEY,
)
// The blind cut: off the crest at once to the left, behind the sheds, back onto the road
const cutFrom = crest + 1
const cutTo = sweepOut + 2
const cut = layBranch(
  road,
  cutFrom,
  cutTo,
  [
    left(28, 70, CUT, { height: 4, mark: 'cutIn' }),
    line(20, CUT, { height: 2.5 }),
    right(28, 70, CUT, { height: 1 }),
    fitted(CUT, { height: 0, mid: 'cutMid' }),
    right(30, 60, CUT),
    fitted(CUT),
    left(30, 60, CUT),
  ],
  CUT,
)

const branches: BranchJson[] = [
  { from: deckFrom, to: deckTo, road: deck.road },
  { from: alleyFrom, to: alleyTo, road: alley.road },
  { from: cutFrom, to: cutTo, road: cut.road },
]
const [deckPath, alleyPath, cutPath] = branches.map((branch) => branchPath(road, branch)) as [
  RoadPoint[],
  RoadPoint[],
  RoadPoint[],
]

/**
 * A branch's mouth: the main road points from the first whose kerb on `side` (-1 left) the branch
 * has cut away to the first after it that is whole again
 */
function mouth(path: readonly RoadPoint[], from: number, side: -1 | 1): [number, number] {
  let first = -1
  for (let index = from + 1; index < road.length; index++) {
    const kerb = acrossRoad(road, index, (side * road[index]!.width) / 2)
    const inside = roadDepth(path, false, kerb.x, kerb.z) > -0.5
    if (inside && first < 0) first = index
    else if (!inside && first >= 0) return [first, index]
  }
  return [from + 1, from + 1]
}
/** The point of a branch's own centre line nearest a named place of its laying */
const nearestOn = (path: readonly RoadPoint[], place: readonly [number, number]) =>
  path.reduce(
    (best, point, index) =>
      Math.hypot(point.x - place[0], point.z - place[1]) <
      Math.hypot(path[best]!.x - place[0], path[best]!.z - place[1])
        ? index
        : best,
    0,
  )

// ── The walls ──
/** A wall stands this far in from a kerb it takes the place of, metres */
const INSET = 0.4
/** Along the road's left kerb from road point `first` to `last`, INSET in from it */
const alongLeftKerb = (first: number, last: number): [number, number][] =>
  Array.from({ length: last - first + 1 }, (_, k) => [
    first + k,
    -(road[first + k]!.width / 2 - INSET),
  ])
const deckMouth = mouth(deckPath, deckFrom, -1)
const cutMouth = mouth(cutPath, cutFrom, -1)
/** The cut's mouth is open only for this many road points; a shed's wall closes the rest */
const CUT_OPEN = 3
/** The alley's slot: where it is along the alley, and how far right of its middle */
const alleySlot =
  alleyPath.findIndex((point) => roadDepth(road, true, point.x, point.z) < -point.width / 2) + 4
const ALLEY_SLOT_AT = 3
const ALLEY_SLOT = 9.5

const walls: Wall[] = [
  // The loading deck: a low fence along the road's left kerb across the deck's mouth
  ...fence(road, alongLeftKerb(deckMouth[0] - 1, deckMouth[1] + 1), FENCE_HEIGHT),
  // The alley: a shed wall across it, a slot in it nearer its left side
  ...fence(
    alleyPath,
    [
      [alleySlot, -(ALLEY / 2 + 1)],
      [alleySlot, ALLEY_SLOT_AT - ALLEY_SLOT / 2],
    ],
    SHED_HEIGHT,
  ),
  ...fence(
    alleyPath,
    [
      [alleySlot, ALLEY_SLOT_AT + ALLEY_SLOT / 2],
      [alleySlot, ALLEY / 2 + 1],
    ],
    SHED_HEIGHT,
  ),
  // The blind cut: a shed's wall along the road's left kerb, but for a gap right over the crest
  ...fence(road, alongLeftKerb(cutMouth[0] + CUT_OPEN, cutMouth[1] + 1), SHED_HEIGHT),
]

// ── The lines ──
// The main road: one line for everyone, round the yard, the heap and the sweep
export const WORKS_GUIDE: TrackGuide = guideFor(road).build()

// The route down every branch, by its own road points (routes.ts drives it)
const pseudoForks = branches.map((branch, index) => ({
  from: branch.from,
  to: branch.to,
  path: [deckPath, alleyPath, cutPath][index]!,
  jumps: [] as number[],
}))
const route = routeRoad({ road, jumps: made.jumps, forks: pseudoForks }, [0, 1, 2])
/** The route's point for a main road point, and for a point of branch k's centre line */
const onMain = (index: number) => route.main[index]!
const onFork = (k: number, index: number) => route.main[branches[k]!.from]! + index
const guide = guideFor(route.road)
// The deck: from the left of the road, the drift jump to the left over the fence onto the deck
guide.tech.hold(onMain(lipA) - 14, onMain(lipA), 1, 2.5)
guide.cue({
  lip: onMain(lipA),
  way: -1,
  land: [onFork(0, nearestOn(deckPath, deck.marks.deckOn!)), 0],
  into: 0.35,
  nose: (12 * Math.PI) / 180,
  most: 70,
})
// The alley: lined up from far off with its slot, through it, then down the middle
guide.tech
  .chord([onMain(alleyFrom) - 8, 4], [onFork(1, alleySlot), ALLEY_SLOT_AT], 1.5)
  .hold(onFork(1, alleySlot), onFork(1, alleySlot) + 1, ALLEY_SLOT_AT, 1)
guide.slot(onFork(1, alleySlot), ALLEY_SLOT_AT)
// The cut: on the left up the ramp, turning in over the crest
guide.tech
  .hold(onMain(crest) - 12, onMain(crest) - 4, -10, 2.5)
  .chord([onMain(crest) - 4, -10], [onFork(2, 5), 0], 2)
export const WORKS_ROUTE_GUIDE: TrackGuide = guide.build()

// Boost pads: one on the deck, one down the alley past its slot, one through the cut: what the
// branches pay; and the road's own two
const branchPads = [
  ...padsAlong(deckPath, [[nearestOn(deckPath, deck.marks.deckMid!), 0]], { length: 12, width: 6 }),
  ...padsAlong(alleyPath, [[nearestOn(alleyPath, alley.marks.alleyMid!), 0]], {
    length: 12,
    width: 6,
  }),
  ...padsAlong(cutPath, [[nearestOn(cutPath, cut.marks.cutMid!), 0]], { length: 12, width: 6 }),
]

const cleared = gatesClearOf(road, made.gates, made.respawns, branches)

export const WORKS: TrackJson = {
  format: TRACK_FORMAT,
  id: 'works',
  // A working name (2026-11-20): the owner may rename it (docs/KART-WORLD.md §6)
  name: { en: 'Viaduct Works', 'zh-TW': '高架廠區' },
  revision: 1,
  theme: 'sunset',
  laps: 3,
  road,
  gates: cleared.gates,
  respawns: cleared.respawns,
  grid: made.grid,
  walls,
  boostPads: [...made.boostPads, ...branchPads],
  itemBoxes: made.itemBoxes,
  decor: [],
  jumps: made.jumps,
  branches,
}
