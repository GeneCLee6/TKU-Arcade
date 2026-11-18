// 2026-11-14, owner: "try making a Tamkang University map". A working name (KART-WORLD.md, e10-t01,
// will settle the world's names): an original circuit through a stylised 淡江大學 淡水校園 on its
// hillside above the river. The layout is ours, not a map of the real roads: a long run up the
// lantern-lined avenue to the line, a fast left at the top round the tall memorial tower, a kink past
// the library and the scroll plaza, esses along the campus's western edge (the old stairway down to
// the town below on the right, the river and the mountain across it beyond), a right hairpin by the
// ship-shaped museum, a run back up through the lawn, a left hairpin at the top, a run down past the
// business tower and a last left hairpin onto the avenue. Flat (the physics is on a plane; the hill
// only falls away beyond the edge of the campus). 2026-11-14 again, owner: "room for at least eight
// karts side by side, and more sharp corners" (revision 2): drawn 1.5 times as big (TAMKANG_SCALE:
// the campus is placed in the same drawn units, tamkangArt.ts), the road 28 to 34 m (it was 18 to
// 22), the fast left at the top tightened round the tower and the western esses made three sharp
// flicks. Then "the maps are still too simple" (revision 5): a right-left flick on the run up
// beside the lawn, and the run down past the business tower made four esses.
//
// 2026-11-18, owner: "more fun, not so many straights ... technical, like the classic maps"
// (revision 9; docs/KART-FEEL.md §10). The hill track: the campus stands on a hill, and now the road
// climbs it. Up the lantern avenue (the one long straight), then RIGHT at the top, east of the
// avenue where no road ran before: a climb to the hilltop, a hairpin round it, and a jump off its
// crest with the road falling away underneath, down past the memorial tower. Round the scroll plaza,
// three fast esses along the western edge, the museum hairpin, the narrow gate between the lawn and
// the business tower, a chicane, the top hairpin, four tight esses down behind the classrooms and
// the last hairpin onto the avenue. Written in metres now (the campus still places itself in drawn
// units).
import { TRACK_FORMAT, type TrackJson } from '../track.ts'
import { circuit, type CircuitPoint } from './circuit.ts'

/** The campus (tamkangArt.ts) is placed in drawn units, this many metres each */
export const TAMKANG_SCALE = 1.5

/** [x, z, width, height]: the line through the middle of the road, in driving order, metres */
const CONTROL: readonly CircuitPoint[] = [
  // The lantern avenue, northwards (-z), up to the line and beyond
  [0, 230, 38, 0],
  [0, 60, 38, 0],
  [0, -80, 38, 0],
  // A right at the top, eastwards, and the climb
  [0, -125, 34, 0],
  [10, -150, 32, 0],
  [35, -160, 32, 0],
  [80, -162, 32, 2],
  [130, -166, 32, 6],
  [170, -172, 32, 8.5],
  // The hilltop hairpin: left, round to the west
  [212, -190, 30, 9],
  [226, -225, 30, 9],
  [212, -260, 30, 9],
  [176, -276, 30, 9],
  // The jump off the crest, and down past the memorial tower
  [130, -278, 32, 9],
  [60, -278, 32, 5],
  [10, -272, 32, 2.5],
  // Downhill esses past the memorial tower: left, right
  [-40, -258, 30, 1],
  [-100, -298, 30, 0],
  [-160, -264, 30, 0],
  // Round the scroll plaza: right, then left
  [-212, -290, 30, 0],
  [-258, -312, 29, 0],
  [-312, -300, 29, 0],
  // Left, onto the western edge, and its three fast esses southwards
  [-360, -270, 30, 0],
  [-392, -225, 30, 0],
  [-398, -170, 30, 0],
  [-354, -80, 29, 0],
  [-396, 10, 29, 0],
  [-356, 100, 29, 0],
  // The museum hairpin: left, round to the north
  [-345, 160, 29, 0],
  [-318, 225, 28, 0],
  [-272, 258, 28, 0],
  [-232, 232, 28, 0],
  [-236, 196, 28, 0],
  // A flick below the lawn, and the narrow gate between the lawn and the business tower
  [-254, 150, 28, 0],
  [-231, 96, 28, 0],
  [-228, 40, 28, 0],
  [-226, -10, 28, 0],
  // A chicane: right, then left
  [-198, -70, 28, 0],
  // The top hairpin: right, round to the south
  [-225, -135, 29, 0],
  [-211, -174, 29, 0],
  [-175, -190, 29, 0],
  [-139, -174, 29, 0],
  [-125, -135, 29, 0],
  // Down behind the classrooms: four tight esses
  [-122, -95, 29, 0],
  [-84, -30, 28, 0],
  [-124, 45, 28, 0],
  [-84, 120, 28, 0],
  [-118, 190, 29, 0],
  // The last hairpin, left, onto the avenue
  [-112, 245, 31, 0],
  [-88, 292, 33, 0],
  [-45, 310, 36, 0],
  [-8, 288, 38, 0],
]

const made = circuit({
  control: CONTROL,
  line: [0, 60],
  jumps: [[125, -278, 2]],
  // Off the middle: taking one is a choice of line
  pads: [
    [0, -20, 8],
    [80, -162, -6],
    [-228, 40, 0],
  ],
})

export const TAMKANG: TrackJson = {
  format: TRACK_FORMAT,
  id: 'tamkang',
  name: { en: 'Tamkang Campus', 'zh-TW': '淡江校園' },
  // 2026-11-14: drawn bigger and wider with sharper corners (owner: eight karts side by side); the
  // first layout's records are set aside
  // 2026-11-14 again (owner: much faster karts): straights 4 m wider, boost pads; old records
  // are set aside, the physics having changed too
  // 2026-11-14 once more (owner: the drift as a real slide, faster still): the road is the same,
  // the physics is not, so old records are set aside
  // 2026-11-14, last (owner: "the maps are still too simple"; the slide-out and the counter-steer):
  // a flick on the run up beside the lawn and esses down past the business tower; old records are set aside
  // 6: the classic feel (2026-11-17): the physics changed, so the old times are set aside
  // 9: redrawn over the hill east of the avenue, with a jump (2026-11-18)
  // 10: the same layout under new physics (2026-11-18: any real drift earns the instant boost)
  revision: 11,
  laps: 3,
  road: made.road,
  gates: made.gates,
  respawns: made.respawns,
  grid: made.grid,
  walls: [],
  boostPads: made.boostPads,
  itemBoxes: [],
  decor: [],
  jumps: made.jumps,
}
