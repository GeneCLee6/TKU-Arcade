// 2026-11-18 (owner: "more technical ... more maps, ones that tell the drivers apart"): the
// expert's track, the hardest of the nine. A working name: Datun Ridgeline (大屯稜線), an original
// mountain road over the volcano north of Tamsui. Laid corner by corner (lay.ts). Everything the
// other tracks teach, with less room: three hairpins up the slope (drifting uphill, where the car
// is slow to come round); a jump off the crest into a left as soon as the wheels are down; four
// esses along the ridge with no straight between them; a second jump, downhill, into a left that
// tightens all the way round from 75 m to 32 m and is answered at once by a right; a row of boxes;
// a snake of five drifts down the west flank; the one straight to spend a boost on; three fast
// sweeps; a gate (29 m) straight into a hairpin of 31 m, the tightest corner of any track, a hairpin
// back and a last one onto the straight. 23 m of climb. The layout is ours; no other game's track
// was looked at.
import { TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'

const laid = lay(
  [
    // The start straight and a left onto the mountain
    line(80, 36, { mid: 'pad1' }),
    left(90, 40, 32, { height: 2 }),
    // The climb: three hairpins, each on the slope
    line(50, 32, { height: 4 }),
    right(180, 32, 30, { height: 8 }),
    line(60, 32, { height: 10 }),
    left(180, 32, 30, { height: 14 }),
    line(60, 32, { height: 16 }),
    right(180, 28, 30, { height: 20 }),
    // The crest: a jump, into a left as soon as the wheels are down
    line(60, 32, { height: 23, mark: 'jump1' }),
    line(60, 34, { height: 22 }),
    left(100, 40, 30, { height: 22 }),
    // The ridge: esses with no straight between
    right(60, 46, 30, { height: 22 }),
    left(100, 38, 30, { height: 21 }),
    right(100, 38, 30, { height: 21 }),
    left(50, 40, 30, { height: 20 }),
    // Off the ridge: the second jump, into a left that tightens all the way round, and a right back
    line(50, 32, { height: 19, mark: 'jump2' }),
    line(55, 34, { height: 15 }),
    left(60, 75, 32, { height: 13 }),
    left(80, 40, 31, { height: 11 }),
    left(60, 32, 30, { height: 9 }),
    right(110, 32, 30, { height: 7 }),
    fitted(32, { height: 6, mid: 'boxes1' }),
    left(90, 40, 32, { height: 5 }),
    // The west flank: a snake downhill
    right(60, 44, 30, { height: 4.5 }),
    left(120, 40, 30, { height: 3.5 }),
    right(120, 38, 30, { height: 2.5 }),
    left(120, 40, 30, { height: 1.5 }),
    right(60, 40, 30, { height: 1 }),
    // The one straight, three fast sweeps, and the gate
    fitted(32, { height: 0, mid: 'pad2' }),
    left(40, 70, 32),
    right(80, 70, 32),
    left(40, 70, 32),
    line(50, 29),
    // The foot: two hairpins and the last onto the straight
    left(180, 31, 29),
    line(30, 30, { mid: 'boxes2' }),
    right(180, 28, 29),
    line(40, 32),
    left(180, 46, 34),
    line(80, 36),
  ],
  { width: 36, height: 0 },
)

const made = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [
    [...laid.marks.jump1!, 2],
    [...laid.marks.jump2!, 2.4],
  ],
  pads: [
    [...laid.marks.pad1!, 8],
    [...laid.marks.pad2!, -7],
  ],
  boxes: [
    [...laid.marks.boxes1!, [-9, -3, 3, 9]],
    [...laid.marks.boxes2!, [-8, -3, 3, 8]],
  ],
})

export const DATUN: TrackJson = {
  format: TRACK_FORMAT,
  id: 'datun',
  // A working name (2026-11-18): the owner may rename it (docs/KART-WORLD.md §6)
  name: { en: 'Datun Ridgeline', 'zh-TW': '大屯稜線' },
  revision: 1,
  theme: 'campus',
  laps: 3,
  road: made.road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  walls: [],
  boostPads: made.boostPads,
  itemBoxes: made.itemBoxes,
  decor: [],
  jumps: made.jumps,
}
