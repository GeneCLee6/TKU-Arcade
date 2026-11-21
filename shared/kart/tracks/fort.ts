// 2026-11-18 (owner: "more technical ... more maps, ones that tell the drivers apart"): the hill
// track. A working name: Hobe Fort Hill (滬尾砲台坡), an original road over the hill of the old fort
// above Tamsui, at sunset. Laid corner by corner (lay.ts). Its lesson is the corner that tightens:
// the climb is one right that closes from 64 m to 36 m all the way up the hill and is answered at
// once by a left, so a drift begun shallow has to be deepened while the car is still climbing; the
// crest is a jump, and the road turns left as soon as the wheels are down; a row of boxes along the
// top; esses and three fast sweeps down the far side; a gate in the middle of a chicane; and at the
// foot a left that tightens into a hairpin, a hairpin back and a hairpin onto the straight. The
// shortest of the nine (1.8 km). The layout is ours; no other game's track was looked at.
import { TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'

const laid = lay(
  [
    // The start straight, a left onto the hill, and the foot of the climb
    line(120, 38, { mid: 'pad1' }),
    left(90, 48, 32),
    fitted(32, { height: 5 }),
    // The climb: a right that tightens all the way up, answered at once by a left
    right(80, 64, 32, { height: 9 }),
    right(70, 46, 31, { height: 12 }),
    right(50, 36, 30, { height: 14 }),
    left(110, 34, 30, { height: 15 }),
    // The crest: a jump, and a left as soon as the wheels are down
    line(70, 32, { height: 16, mark: 'jump' }),
    line(65, 34, { height: 15 }),
    left(90, 46, 32, { height: 14 }),
    // Along the top: a row of boxes, the fort straight behind
    line(100, 34, { height: 13, mid: 'boxes1' }),
    left(90, 40, 32, { height: 12 }),
    // Downhill esses
    right(70, 40, 30, { height: 10 }),
    left(140, 38, 30, { height: 7 }),
    right(70, 40, 30, { height: 5 }),
    // Three fast sweeps (no drift, a light hand) and the gate: 28 m, in the middle of a chicane
    fitted(32, { height: 4.5, mid: 'pad2' }),
    left(40, 70, 32, { height: 4.3 }),
    right(80, 70, 32, { height: 4.1 }),
    left(40, 70, 32, { height: 4 }),
    line(30, 28, { height: 3.5 }),
    left(45, 45, 28, { height: 3.2 }),
    right(45, 45, 28, { height: 3 }),
    // The foot of the hill: a left that tightens into a hairpin, and a hairpin back
    left(70, 60, 32, { height: 2 }),
    left(110, 36, 30, { height: 1 }),
    right(180, 34, 30, { height: 0 }),
    line(30, 32, { mid: 'boxes2' }),
    left(180, 36, 34),
    line(60, 38),
  ],
  { width: 38, height: 0 },
)

const made = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [[...laid.marks.jump!, 1.8]],
  pads: [
    [...laid.marks.pad1!, 8],
    [...laid.marks.pad2!, -7],
  ],
  boxes: [
    [...laid.marks.boxes1!, [-9, -3, 3, 9]],
    [...laid.marks.boxes2!, [-9, -3, 3, 9]],
  ],
})

export const FORT: TrackJson = {
  format: TRACK_FORMAT,
  id: 'fort',
  // A working name (2026-11-18): the owner may rename it (docs/KART-WORLD.md §6)
  name: { en: 'Hobe Fort Hill', 'zh-TW': '滬尾砲台坡' },
  // 2026-11-19: the drift jump (terrain.ts) changed what a jump is
  revision: 2,
  theme: 'sunset',
  laps: 3,
  road: made.road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  solo: made.solo,
  walls: [],
  boostPads: made.boostPads,
  itemBoxes: made.itemBoxes,
  decor: [],
  jumps: made.jumps,
}
