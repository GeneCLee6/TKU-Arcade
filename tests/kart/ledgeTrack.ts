// A small track with one high platform, for ledges.test.ts: a long start straight that ends in a
// jump lip, the main road then swinging right round a block and back onto the same line, and a
// platform straight on from the lip over the block (shared/kart/ledges.ts). `ledgeJson` is its
// TrackJson; `LEDGE_PLAN` says where things are.
import type { BranchJson } from '../../shared/kart/branches.ts'
import { platformRoad } from '../../shared/kart/ledges.ts'
import { TRACK_FORMAT, type RoadPoint, type TrackJson } from '../../shared/kart/track.ts'
import { circuit } from '../../shared/kart/tracks/circuit.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from '../../shared/kart/tracks/lay.ts'
import { gatesClearOf } from '../../shared/kart/branches.ts'

const W = 30
const laid = lay(
  [
    line(200, W),
    line(30, W, { mark: 'lip' }),
    // Round the block: right, along, left, along, left, along, right: back on the same line
    right(90, 40, W),
    line(40, W),
    left(90, 40, W),
    line(60, W),
    left(90, 40, W),
    line(40, W),
    right(90, 40, W),
    line(100, W),
    right(90, 50, W),
    fitted(W),
    right(90, 50, W),
    fitted(W),
    right(90, 50, W),
    line(100, W),
    right(90, 50, W),
  ],
  { width: W, height: 0 },
)

export const LEDGE_MAIN = circuit({
  control: laid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [[...laid.marks.lip!, 2.5]],
})

const road = LEDGE_MAIN.road
const lip = LEDGE_MAIN.jumps[0]!

/** Where the platform begins, metres on from the lip, and how high it is */
export const LEDGE_PLAN = { lip, faceAt: 50, top: 2.7, width: 12 }

/** Straight on from the lip: the mouth at the road's height, the face, the platform, the way down */
export function ledgeBranch(
  plan: { faceAt: number; top: number; width: number } = LEDGE_PLAN,
): BranchJson {
  const start = road[lip]!
  const points: RoadPoint[] = []
  let face = -1
  // On the platform to z = -360, then a ramp down to the road's height by z = -400
  for (let d = 6; start.z - d > -470; d += 6) {
    const z = start.z - d
    let y: number
    if (d < plan.faceAt) y = 0
    else if (z > -360) y = plan.top
    else y = Math.max(0, plan.top * (1 - (-360 - z) / 40))
    if (d >= plan.faceAt && face < 0) face = points.length
    points.push({ x: start.x, z, width: plan.width, y: Math.round(y * 100) / 100 })
  }
  const raised = platformRoad(road, points, face)
  // It joins the main road at the first road point past its last
  const last = raised.road[raised.road.length - 1]!
  let to = lip + 1
  while (to < road.length - 1 && !(Math.abs(road[to]!.x - last.x) < 3 && road[to]!.z < last.z - 3)) to++
  return { from: lip, to, road: raised.road, rise: raised.rise }
}

export const ledgeJson = (branch: BranchJson = ledgeBranch()): TrackJson => {
  const cleared = gatesClearOf(road, LEDGE_MAIN.gates, LEDGE_MAIN.respawns, [branch])
  return {
    format: TRACK_FORMAT,
    id: 'ledge-test',
    name: { en: 'Ledge', 'zh-TW': '高台' },
    laps: 3,
    road,
    gates: cleared.gates,
    respawns: cleared.respawns,
    grid: LEDGE_MAIN.grid,
    walls: [],
    boostPads: [],
    itemBoxes: [],
    decor: [],
    jumps: LEDGE_MAIN.jumps,
    branches: [branch],
  }
}
