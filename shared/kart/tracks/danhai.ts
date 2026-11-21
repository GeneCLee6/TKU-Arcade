// 2026-11-18 (owner: "more technical ... more maps, ones that tell the drivers apart"): the
// street circuit. A working name: Danhai Night Circuit (淡海夜城), an original circuit round the
// blocks of the new town north of Tamsui, at night. Laid corner by corner (lay.ts). Its lesson is
// precision: a gate (28 m) straight into a pair of hairpins; a chicane through a second gate; the
// roundabout, where the road opens out to 84 m round an island and the short way is the lane
// inside it (a hairpin of about 29 m between the island and the inside kerb, 22 m wide: some 135 m
// shorter than the long way round, which is wide, carries the row of boxes and needs no drift; a
// drift that misses the lane's mouth meets the island's nose); four square corners on end round
// the blocks, each a drift; and an S through a last gate onto the straight. Flat. The layout is
// ours; no other game's track was looked at.
import { TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'

/** The roundabout: its road is this wide, and road points this wide or wider carry the island */
export const ROUNDABOUT_WIDTH = 84
const ROUNDABOUT_FROM = 82
/** The radius of the middle of the roundabout's road, metres */
export const ROUNDABOUT_RADIUS = 60
/** Where the island lies across it, metres right of the middle: inside it is the shortcut */
export const ISLAND_INNER = 16
export const ISLAND_OUTER = 20

const laid = lay(
  [
    // The start straight and a right into the town
    line(110, 38, { mid: 'pad1' }),
    right(90, 36, 32),
    // The gate, and a pair of hairpins
    line(50, 28),
    left(180, 32, 29),
    line(45, 30),
    right(180, 32, 29),
    // A row of boxes, and a chicane through the second gate
    line(50, 36, { mid: 'boxes1' }),
    right(50, 44, 30),
    left(100, 40, 28),
    right(50, 44, 30),
    fitted(40),
    // The roundabout: the road opens out round an island; inside it is the short way
    line(80, ROUNDABOUT_WIDTH),
    right(180, ROUNDABOUT_RADIUS, ROUNDABOUT_WIDTH, { mid: 'island' }),
    line(80, 34),
    left(90, 38, 32),
    line(40, 32, { mid: 'pad2' }),
    // The blocks: four square corners on end
    right(90, 36, 30),
    line(24, 30),
    left(90, 36, 30),
    line(24, 30),
    left(90, 36, 30),
    line(24, 30),
    right(90, 36, 30),
    // Home: a right, a row of boxes, an S through the last gate, and the right onto the straight
    fitted(34, { mid: 'pad3' }),
    right(90, 40, 34),
    line(60, 36, { mid: 'boxes2' }),
    left(60, 45, 30),
    right(120, 38, 29),
    left(60, 45, 32),
    line(30, 34),
    right(90, 34, 36),
    line(110, 38),
  ],
  { width: 38 },
)

const made = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  pads: [
    [...laid.marks.pad1!, 8],
    [...laid.marks.pad2!, -7],
    [...laid.marks.pad3!, 7],
  ],
  // The island: 16 to 20 m right of the middle of the 84 m road, so the lane inside it is 22 m
  island: { from: ROUNDABOUT_FROM, inner: ISLAND_INNER, outer: ISLAND_OUTER },
  boxes: [
    // The roundabout's long way round has a row; the short way has none
    [...laid.marks.island!, [-36, -29, -22, -15, -8]],
    [...laid.marks.boxes1!, [-12, -6, 0, 6, 12]],
    [...laid.marks.boxes2!, [-10, -5, 0, 5, 10]],
  ],
})

export const DANHAI: TrackJson = {
  format: TRACK_FORMAT,
  id: 'danhai',
  // A working name (2026-11-18): the owner may rename it (docs/KART-WORLD.md §6)
  name: { en: 'Danhai Night Circuit', 'zh-TW': '淡海夜城' },
  revision: 1,
  theme: 'night',
  laps: 3,
  road: made.road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  solo: made.solo,
  walls: made.walls,
  boostPads: made.boostPads,
  itemBoxes: made.itemBoxes,
  decor: [],
}
