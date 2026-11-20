// A small track with one branch, for the format's tests (branches.test.ts): a rounded rectangle
// laid like any other (lay.ts), and a branch off its first long straight that swings out to the
// left and comes back further on (layBranch). `json` is its TrackJson, `branch` the branch alone.
import type { BranchJson } from '../../shared/kart/branches.ts'
import { TRACK_FORMAT, type TrackJson } from '../../shared/kart/track.ts'
import { circuit } from '../../shared/kart/tracks/circuit.ts'
import {
  fitted,
  lay,
  LAY_SAMPLE,
  layBranch,
  left,
  line,
  right,
} from '../../shared/kart/tracks/lay.ts'

const laid = lay(
  [
    line(300, 30),
    right(90, 50, 30),
    fitted(30),
    right(90, 50, 30),
    fitted(30),
    right(90, 50, 30),
    line(100, 30),
    right(90, 50, 30),
  ],
  { width: 30 },
)

export const FORK_MAIN = circuit({ control: laid.control, sample: LAY_SAMPLE, line: [0, 0] })

/** From and to: off the first straight, back onto it */
export const FORK_FROM = 16
export const FORK_TO = 40

export function forkBranch(
  steps = [
    left(90, 20, 10),
    fitted(10),
    right(90, 20, 10),
    fitted(10),
    right(90, 20, 10),
    line(30, 10),
    left(90, 20, 10),
  ],
  from = FORK_FROM,
  to = FORK_TO,
): BranchJson {
  return { from, to, road: layBranch(FORK_MAIN.road, from, to, steps, 10).road }
}

export const forkJson = (branches: readonly unknown[] = [forkBranch()]): TrackJson => ({
  format: TRACK_FORMAT,
  id: 'fork-test',
  name: { en: 'Fork', 'zh-TW': '岔路' },
  laps: 3,
  road: FORK_MAIN.road,
  gates: FORK_MAIN.gates,
  respawns: FORK_MAIN.respawns,
  grid: FORK_MAIN.grid,
  walls: [],
  boostPads: [],
  itemBoxes: [],
  decor: [],
  branches: branches as BranchJson[],
})
