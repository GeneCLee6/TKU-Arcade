// 2026-11-18 (owner: "more technical ... more maps, ones that tell the drivers apart"): the rhythm
// track. A working name: Mangrove Channel (紅樹林水道), an original circuit on the levees of the
// mangrove flats up the river from Tamsui. Laid corner by corner (lay.ts). Its lesson is changing
// sides: the first half is one long snake of five drifts, each a little tighter than the last, with
// no straight between them, so that the end of one drift is the start of the next; then a right
// that tightens and is answered at once by a left; a pair of switchbacks; and a gate in the middle
// of an S on the way home. Flat. The layout is ours; no other game's track was looked at.
import { TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit } from './circuit.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'

const laid = lay(
  [
    // The levee straight, past the line, and a right onto the flats
    line(80, 38, { mid: 'pad1' }),
    right(90, 50, 32),
    // The snake: five drifts on end, eastwards, each tighter than the last
    left(60, 46, 30),
    right(120, 46, 30),
    left(120, 44, 30),
    right(120, 42, 30),
    left(120, 40, 30),
    right(120, 38, 30),
    left(120, 36, 30),
    right(60, 36, 30),
    line(36, 32, { mid: 'boxes1' }),
    // The tightening right, answered at once by a left
    right(110, 58, 32),
    right(70, 30, 30),
    left(90, 36, 30),
    line(100, 34, { mid: 'pad2' }),
    // The switchbacks
    right(180, 36, 30),
    line(90, 32, { mid: 'boxes2' }),
    left(180, 36, 30),
    line(40, 32),
    // Three fast sweeps down the channel: no drift, a light hand
    left(40, 70, 32),
    right(80, 70, 32),
    left(40, 70, 32),
    // The last corner of the flats, and home along the channel through the gate
    right(90, 45, 32),
    fitted(34, { mid: 'boxes3' }),
    left(50, 50, 30),
    right(100, 42, 28),
    left(50, 50, 30),
    // The notch: up into the flats and straight back
    line(30, 32, { mid: 'pad3' }),
    right(90, 36, 30),
    line(30, 30),
    left(180, 32, 30),
    line(30, 30),
    right(90, 36, 32),
    right(90, 45, 36),
    fitted(38),
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
  boxes: [
    [...laid.marks.boxes1!, [-9, -3, 3, 9]],
    [...laid.marks.boxes2!, [-9, -3, 3, 9]],
    [...laid.marks.boxes3!, [-10, -5, 0, 5, 10]],
  ],
})

export const MANGROVE: TrackJson = {
  format: TRACK_FORMAT,
  id: 'mangrove',
  // A working name (2026-11-18): the owner may rename it (docs/KART-WORLD.md §6)
  name: { en: 'Mangrove Channel', 'zh-TW': '紅樹林水道' },
  revision: 1,
  theme: 'day',
  laps: 3,
  road: made.road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  walls: [],
  boostPads: made.boostPads,
  itemBoxes: made.itemBoxes,
  decor: [],
}
