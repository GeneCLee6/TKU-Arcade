// 2026-11-23 (owner: "more high-platform shortcuts that take technique and enough speed to get up
// onto; technique and the kart can both cut the time"; shared/kart/ledges.ts): the high-platform
// track, docs/KART-WORLD.md §6. A working name: Breakwater Roofs (防波堤屋頂), an original fishing
// harbour mouth on the Tamsui side: a breakwater, a fish market's long roof and a row of net sheds,
// each a high platform beside the road. Laid corner by corner (lay.ts); every platform the same
// pattern (platform.ts): a ramp, a straight to come down on, the road swinging off round the
// building and back, the roof straight on beside it, off the ramp at a slant. Three of them, each
// asking for something else:
//
// - the breakwater's crown (north): long and wide, its face 34 m off the lip. A clean run out of
//   the hairpin before it is enough (about 60 m/s off the lip); what it asks is the line, from the
//   ramp's left across to its right;
// - the fish market's roof (east): its face further and higher than the lip, so that it takes
//   about 66 m/s off the lip: a charge fired up the ramp, or a fast kart with a perfect exit; a gap
//   in the roof halfway along (a pit with a ramp out of it) for whoever lands slow;
// - the net sheds (south): a near face, but 40° off the road's line: the kart must leave the lip
//   already slanting hard (a drift taken over the crest is the way), and the roof is narrow, with a
//   kink to drive straight after it.
//
// Flat but for the ramps and the roofs. The layout is ours; no other game's track was looked at.
import { branchPath, gatesClearOf, routeRoad, type BranchJson } from '../branches.ts'
import { padsAlong, TRACK_FORMAT, type RoadPoint, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { guideFor, type TrackGuide } from './guide.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'
import { blockDetour, straightPlatform, type StraightPlatform } from './platform.ts'

/** The road's width, and up each ramp and beside each face */
const W = 30
const RAMP = 28

/** Each roof: the detour round its building, and the platform itself */
interface Roof {
  /** The run-up to the lip, and the straight after it to come down on */
  readonly run: number
  readonly land: number
  /** The ramp's height */
  readonly lip: number
  readonly radius: number
  readonly out: number
  readonly along: number
  readonly platform: Omit<StraightPlatform, 'merge' | 'down'>
  /** The bend past the face (StraightPlatform's) */
  readonly bend: number
}

/** How far right of its line the road comes back after a roof (its platform's line) */
const lineOf = (roof: Roof) =>
  roof.platform.side +
  (roof.platform.side / roof.platform.face) * (roof.bend / 2) +
  (roof.platform.kinks ?? []).reduce((sum, kink) => sum + kink.shift, 0)

const CROWN: Roof = {
  run: 40,
  land: 70,
  lip: 2.8,
  radius: 40,
  out: 24,
  along: 26,
  bend: 30,
  platform: { width: 13, face: 34, side: 21.5, top: 2.6, downAt: 70, gaps: [] },
}
const MARKET: Roof = {
  run: 40,
  land: 70,
  lip: 3,
  radius: 38,
  out: 22,
  along: 30,
  bend: 30,
  platform: {
    width: 12,
    face: 34,
    side: 21,
    top: 3.6,
    downAt: 70,
    gaps: [{ at: 60, length: 12, depth: 1.6 }],
  },
}
const SHEDS: Roof = {
  run: 36,
  land: 66,
  lip: 2.5,
  radius: 36,
  out: 22,
  along: 24,
  bend: 24,
  platform: {
    width: 11,
    face: 24,
    side: 21,
    top: 2.6,
    downAt: 66,
    kinks: [{ at: 30, length: 26, shift: -8 }],
  },
}

/** A roof's stretch of road: the ramp, the landing straight, the detour */
const roofRoad = (roof: Roof, mark: string) => [
  line(roof.run, RAMP, { mark: `${mark}Lip` }),
  line(roof.land, RAMP),
  ...blockDetour(-1, roof.radius, roof.out, roof.along, W, mark, { shift: lineOf(roof) }),
]

const laid = lay(
  [
    // The start straight, north, and the breakwater's ramp
    line(90, W, { mid: 'pad1' }),
    ...roofRoad(CROWN, 'crown'),
    line(30, W),
    // A hairpin's worth of right-hander onto the harbour road, east
    right(90, 48, W),
    fitted(W, { mid: 'boxes1' }),
    // The fish market's ramp
    ...roofRoad(MARKET, 'market'),
    line(30, W),
    right(90, 44, W),
    // South along the slipway: an S, the net sheds' ramp
    line(50, W),
    right(40, 55, W),
    left(40, 55, W, { mid: 'boxes2' }),
    line(30, W),
    ...roofRoad(SHEDS, 'sheds'),
    line(70, W),
    right(90, 44, W),
    // Home, west along the quay, and north onto the line
    line(360, W, { mid: 'pad2' }),
    right(90, 48, W),
    fitted(W),
  ],
  { width: W, height: 0 },
)

const made = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [
    [...laid.marks.crownLip!, CROWN.lip],
    [...laid.marks.marketLip!, MARKET.lip],
    [...laid.marks.shedsLip!, SHEDS.lip],
  ],
  pads: [
    [...laid.marks.pad1!, 7],
    [...laid.marks.pad2!, -7],
  ],
  boxes: [
    [...laid.marks.boxes1!, [-9, -3, 3, 9]],
    [...laid.marks.boxes2!, [-9, -3, 3, 9]],
  ],
})

const { road } = made
const at = (mark: string) => made.nearest(...laid.marks[mark]!)

/** A roof's branch: from its lip to where the road is back on the roof's line, a drop at its end */
const roofBranch = (roof: Roof, mark: string): BranchJson =>
  straightPlatform(road, at(`${mark}Lip`), at(`${mark}Back`) + 4, {
    ...roof.platform,
    // Over the main road the mouth is as wide as the ramp, so that a kart off the lip a little
    // off its middle still flies into it
    mouth: RAMP - 4,
    end: 10,
    bend: roof.bend,
    merge: 0,
    down: 0,
  })

const branches: BranchJson[] = [
  roofBranch(CROWN, 'crown'),
  roofBranch(MARKET, 'market'),
  roofBranch(SHEDS, 'sheds'),
]
const paths = branches.map((branch) => branchPath(road, branch))

/** The road point of a branch's own centre line nearest a named place */
export const BREAKWATER_MARKS = {
  crownLip: at('crownLip'),
  marketLip: at('marketLip'),
  shedsLip: at('shedsLip'),
  count: road.length,
} as const

// ── The lines ──
// The main road: one line for everyone, round every building
export const BREAKWATER_GUIDE: TrackGuide = guideFor(road).build()

// The route over every roof (routes.ts drives it; it aims each lip's slant itself)
const route = routeRoad(
  {
    road,
    jumps: made.jumps,
    forks: branches.map((branch, index) => ({
      from: branch.from,
      to: branch.to,
      path: paths[index]!,
      jumps: (branch.jumps ?? []).map((lip) => lip + 1),
    })),
  },
  [0, 1, 2],
)
const routeLines = guideFor(route.road)
// Up each ramp on its left, so as to cross it slanting to the right
for (const branch of branches) {
  const lip = route.main[branch.from]!
  routeLines.tech.hold(lip - 12, lip - 4, -8, 2).chord([lip - 4, -8], [lip + 3, 0], 1.5)
}
export const BREAKWATER_ROUTE_GUIDE: TrackGuide = routeLines.build()

// Boost pads: the road's own two, and one on the crown and one on the sheds' roof past its kink
const roofPads = [
  ...padsAlong(paths[0]!, [[Math.round(paths[0]!.length / 2), 0]], { length: 12, width: 6 }),
  ...padsAlong(paths[2]!, [[Math.round(paths[2]!.length * 0.55), 0]], { length: 12, width: 6 }),
]

const cleared = gatesClearOf(road, made.gates, made.respawns, branches)

export const BREAKWATER: TrackJson = {
  format: TRACK_FORMAT,
  id: 'breakwater',
  // A working name (2026-11-23): the owner settles it (docs/KART-WORLD.md §6)
  name: { en: 'Breakwater Roofs', 'zh-TW': '防波堤屋頂' },
  theme: 'sunset',
  laps: 3,
  road,
  gates: cleared.gates,
  respawns: cleared.respawns,
  grid: made.grid,
  solo: made.solo,
  walls: [],
  boostPads: [...made.boostPads, ...roofPads],
  itemBoxes: made.itemBoxes,
  decor: [],
  jumps: made.jumps,
  branches,
}

/** For the art (src/kart/art/ledgeArt.ts) and the tests: each roof's own centre line */
export const BREAKWATER_ROOFS: readonly (readonly RoadPoint[])[] = paths
