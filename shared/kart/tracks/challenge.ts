// 2026-11-21 (owner: "design more challenging levels"; docs/ARCHITECTURE.md §4.60, docs/KART-WORLD.md
// §6): the challenge mode's own two tracks (src/kart/challenge/), laid corner by corner (lay.ts).
// Short and mean on purpose, and only in the challenge mode: they are not in RACE_TRACK_IDS, so no
// room and no race against the computer can be set to them. Working names; the layouts are ours,
// no other game's track or mission was looked at.
//
// - Needle Lane (針眼巷, about 0.9 km, 18 m wide): a narrow lane of a chicane and three tight
//   hairpins, and two walls across the road, each with a slot off to one side: line up early or
//   meet the wall. Nothing on it forgives a wide line;
// - Hop Yard (跳台場, about 0.95 km, hilly): three drops off loading steps, each straight into a
//   corner, and a long fast sweep home on a crest. Taken square, a drop puts the car into the
//   outside wall; the drift jump lands it already turning.
import type { ObstacleJson } from '../obstacles.ts'
import { TRACK_FORMAT, type Track, type TrackJson } from '../track.ts'
import { parseTrack } from '../track.ts'
import { circuit } from './circuit.ts'
import { fence, guideFor, type TrackGuide } from './guide.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from './lay.ts'

/** A slot through a wall across Needle Lane is this wide, metres */
export const NEEDLE_SLOT = 9
const NEEDLE_WIDTH = 18
/** Each slot's middle, metres right of the road's middle: both a little left, the outside of the corner before it */
const NEEDLE_SLOTS = [-3.5, -3] as const
const WALL_HEIGHT = 9

const needleLaid = lay(
  [
    line(40, 22),
    line(40, NEEDLE_WIDTH, { mark: 'wall1' }),
    line(20, NEEDLE_WIDTH),
    right(90, 24, NEEDLE_WIDTH),
    line(80, NEEDLE_WIDTH),
    // A chicane: left, right
    left(50, 30, NEEDLE_WIDTH),
    right(50, 30, NEEDLE_WIDTH),
    // Three hairpins, right, left, right, a wall across the road between the first two
    right(180, 30, 20),
    line(80, NEEDLE_WIDTH, { mark: 'wall2' }),
    left(180, 30, 20),
    line(80, NEEDLE_WIDTH),
    right(180, 32, 20),
    fitted(NEEDLE_WIDTH),
    left(30, 40, NEEDLE_WIDTH),
    right(30, 40, NEEDLE_WIDTH),
    right(90, 24, NEEDLE_WIDTH),
    fitted(NEEDLE_WIDTH),
  ],
  { width: 22 },
)

const needleMade = circuit({
  control: needleLaid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
})

const needleRoad = needleMade.road
const needleWalls = [needleLaid.marks.wall1!, needleLaid.marks.wall2!].flatMap((mark, at) => {
  const index = needleMade.nearest(...mark)
  const middle = NEEDLE_SLOTS[at]!
  const half = needleRoad[index]!.width / 2 + 1
  return [
    ...fence(
      needleRoad,
      [
        [index, -half],
        [index, middle - NEEDLE_SLOT / 2],
      ],
      WALL_HEIGHT,
    ),
    ...fence(
      needleRoad,
      [
        [index, middle + NEEDLE_SLOT / 2],
        [index, half],
      ],
      WALL_HEIGHT,
    ),
  ]
})

const needleSlots = [needleLaid.marks.wall1!, needleLaid.marks.wall2!].map((mark, at) => ({
  index: needleMade.nearest(...mark),
  across: NEEDLE_SLOTS[at]!,
}))

const needleGuide = guideFor(needleRoad, 4)
for (const slot of needleSlots) {
  // Both lines line up for each slot well before it
  needleGuide.both.hold(slot.index - 10, slot.index + 2, slot.across, 1.5)
  needleGuide.slot(slot.index, slot.across)
}

/** Needle Lane's guide: both lines through the slots (shared/kart/tracks/guides.ts) */
export const NEEDLE_GUIDE: TrackGuide = needleGuide.build()

export const CHALLENGE_NEEDLE: TrackJson = {
  format: TRACK_FORMAT,
  id: 'ch-needle',
  // Its name, settled by the owner on 2026-11-22 (docs/KART-WORLD.md §6)
  name: { en: 'Needle Lane', 'zh-TW': '針眼巷' },
  theme: 'night',
  laps: 3,
  road: needleRoad,
  gates: needleMade.gates,
  respawns: needleMade.respawns,
  grid: needleMade.grid,
  walls: needleWalls,
  boostPads: [],
  itemBoxes: [],
  decor: [],
}

const hopLaid = lay(
  [
    line(90, 34, { height: 6 }),
    // The first drop, straight into a long right
    line(40, 30, { height: 6, mark: 'step1' }),
    line(24, 30, { height: 5.4 }),
    right(120, 30, 30, { height: 5 }),
    line(60, 30, { height: 4.5 }),
    left(60, 50, 30, { height: 4 }),
    // The second, into a right hairpin
    line(40, 30, { height: 4, mark: 'step2' }),
    line(24, 30, { height: 3.4 }),
    right(150, 28, 30, { height: 3 }),
    fitted(30, { height: 2 }),
    // The third, into a left
    line(20, 30, { height: 2, mark: 'step3' }),
    line(26, 30, { height: 1.4 }),
    left(60, 40, 30, { height: 1 }),
    right(140, 34, 32, { height: 0 }),
    fitted(30, { height: 3 }),
    // Home on the crest: a long fast sweep
    right(70, 120, 30, { height: 6 }),
  ],
  { width: 34, height: 6 },
)

const hopMade = circuit({
  control: hopLaid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
  jumps: [
    [...hopLaid.marks.step1!, 1],
    [...hopLaid.marks.step2!, 1],
    [...hopLaid.marks.step3!, 1],
  ],
})

export const CHALLENGE_HOP: TrackJson = {
  format: TRACK_FORMAT,
  id: 'ch-hop',
  name: { en: 'Hop Yard', 'zh-TW': '跳台場' },
  theme: 'sunset',
  laps: 3,
  road: hopMade.road,
  gates: hopMade.gates,
  respawns: hopMade.respawns,
  grid: hopMade.grid,
  walls: [],
  boostPads: [],
  itemBoxes: [],
  decor: [],
  jumps: hopMade.jumps,
}

// 2026-11-22 (#103, obstacles.ts): Lock Gate Lane (閘門巷, a working name, about 0.9 km, 26 m wide),
// a loop round a dock basin with the moving obstacles in it: a boom across the whole road on the
// first straight (wait for it, or time the run-up), a container sliding across the back straight,
// and the two half-booms of a level crossing on the way home, one down while the other is up
const LOCK_WIDTH = 26

const lockLaid = lay(
  [
    line(60, LOCK_WIDTH),
    line(70, LOCK_WIDTH, { mark: 'boom' }),
    line(50, LOCK_WIDTH),
    right(90, 30, LOCK_WIDTH),
    line(40, LOCK_WIDTH),
    left(60, 34, LOCK_WIDTH),
    right(150, 30, LOCK_WIDTH),
    line(70, LOCK_WIDTH),
    line(40, LOCK_WIDTH, { mark: 'slide' }),
    fitted(LOCK_WIDTH),
    right(90, 30, LOCK_WIDTH),
    line(50, LOCK_WIDTH, { mark: 'cross' }),
    fitted(LOCK_WIDTH),
    right(90, 30, LOCK_WIDTH),
  ],
  { width: LOCK_WIDTH },
)

const lockMade = circuit({
  control: lockLaid.control,
  sample: LAY_SAMPLE,
  line: [0, 0],
})

/** Lock Gate Lane's obstacles, at their marks: steps of 1/60 s from GO */
export const LOCK_OBSTACLES: readonly ObstacleJson[] = [
  // The lock gate: down over the whole road for 2 s of every 5, a second's warning
  {
    kind: 'boom',
    // Half-way between two gates, well clear of their respawn points
    at: lockMade.nearest(...lockLaid.marks.boom!) + 2.5,
    from: -LOCK_WIDTH / 2,
    to: LOCK_WIDTH / 2,
    period: 300,
    shift: 150,
    closed: 120,
    warn: 60,
  },
  // A container on its trolley, across the back straight and back every 6 s
  {
    kind: 'slider',
    at: lockMade.nearest(...lockLaid.marks.slide!) - 2.5,
    length: 6.1,
    size: 10,
    a: -5,
    b: 5,
    period: 360,
    shift: 0,
    move: 72,
    warn: 48,
  },
  // The level crossing: the left half down, then the right
  {
    kind: 'boom',
    at: lockMade.nearest(...lockLaid.marks.cross!),
    from: -LOCK_WIDTH / 2,
    to: 0,
    period: 360,
    shift: 0,
    closed: 120,
    warn: 48,
  },
  {
    kind: 'boom',
    at: lockMade.nearest(...lockLaid.marks.cross!),
    from: 0,
    to: LOCK_WIDTH / 2,
    period: 360,
    shift: 180,
    closed: 120,
    warn: 48,
  },
]

export const CHALLENGE_LOCK: TrackJson = {
  format: TRACK_FORMAT,
  id: 'ch-lock',
  name: { en: 'Lock Gate Lane', 'zh-TW': '閘門巷' },
  theme: 'day',
  laps: 3,
  road: lockMade.road,
  gates: lockMade.gates,
  respawns: lockMade.respawns,
  grid: lockMade.grid,
  walls: [],
  boostPads: [],
  itemBoxes: [],
  decor: [],
  obstacles: LOCK_OBSTACLES,
}

export const CHALLENGE_TRACK_IDS = ['ch-needle', 'ch-hop', 'ch-lock'] as const
export type ChallengeTrackId = (typeof CHALLENGE_TRACK_IDS)[number]

export const isChallengeTrackId = (value: unknown): value is ChallengeTrackId =>
  typeof value === 'string' && (CHALLENGE_TRACK_IDS as readonly string[]).includes(value)

const JSONS: Readonly<Record<ChallengeTrackId, TrackJson>> = {
  'ch-needle': CHALLENGE_NEEDLE,
  'ch-hop': CHALLENGE_HOP,
  'ch-lock': CHALLENGE_LOCK,
}

const parsed = new Map<ChallengeTrackId, Track>()

/** A challenge track, checked like any track file */
export function challengeTrack(id: ChallengeTrackId): Track {
  const known = parsed.get(id)
  if (known) return known
  const result = parseTrack(JSONS[id])
  if ('problems' in result) throw new Error(`${id}: ${result.problems.join('; ')}`)
  parsed.set(id, result.track)
  return result.track
}
