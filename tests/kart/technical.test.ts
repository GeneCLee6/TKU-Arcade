// 2026-11-18 (owner: "the maps should be more fun, not so many straights ... technical, like the
// classic maps"; docs/KART-FEEL.md §10, docs/ARCHITECTURE.md §4.33): all five built-in tracks redrawn.
// Each is checked the way the old street was (oldstreet.test.ts): a legal track that never runs
// into itself, whose kerbs never fold, wide enough everywhere, its gates in order and close enough
// that none can be missed, its respawns and its grid of eight on the road; the computer karts of
// all three difficulties drive three laps of it without ever being told they go the wrong way; and
// it is less straight than it was.
import { describe, expect, it } from 'vitest'
import { roadShape } from '../../scripts/kart/shape.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import { seconds, startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, gateCrossing, recordKey, type Track } from '../../shared/kart/track.ts'
import { RACE_TRACK_IDS, type RaceTrackId } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { KART_RADIUS, wallClearance } from '../../shared/kart/walls.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { BOT_SKILLS, DIFFICULTIES } from '../../src/kart/bots/skill.ts'
import { alongRoad } from './trackShape.ts'

/** What each redrawn track promises: its records' key, the most of it that may be straight, its jumps */
const PLAN: Record<
  RaceTrackId,
  { key: string; straight: number; was: number; longest: number; jumps: number; hilly: boolean }
> = {
  riverside: {
    key: 'riverside@13',
    straight: 0.35,
    was: 0.36,
    longest: 285,
    jumps: 1,
    hilly: true,
  },
  harbour: { key: 'harbour@12', straight: 0.34, was: 0.54, longest: 290, jumps: 0, hilly: false },
  tamkang: { key: 'tamkang@12', straight: 0.34, was: 0.36, longest: 390, jumps: 1, hilly: true },
  oldstreet: { key: 'oldstreet@9', straight: 0.4, was: 0.6, longest: 340, jumps: 0, hilly: false },
  guanyin: { key: 'guanyin@8', straight: 0.43, was: 0.56, longest: 200, jumps: 2, hilly: true },
  // 2026-11-18, the four new ones (moreTracks.test.ts has what is their own): at most 30% straight
  mangrove: { key: 'mangrove', straight: 0.3, was: 0.3, longest: 280, jumps: 0, hilly: false },
  fort: { key: 'fort@2', straight: 0.3, was: 0.3, longest: 200, jumps: 1, hilly: true },
  danhai: { key: 'danhai', straight: 0.3, was: 0.3, longest: 220, jumps: 0, hilly: false },
  datun: { key: 'datun@2', straight: 0.3, was: 0.3, longest: 200, jumps: 2, hilly: true },
  // 2026-11-19, the two to learn by heart (skillTracks.test.ts has what is their own): a shortcut
  // is a straight line, so they are straighter than the technical four
  // 2026-11-20: the wharf's shed lane is a branch (branches.ts), its records afresh; then (revision
  // 3) the road round the shed reaches further out and the lane is half as long as it
  wharf: { key: 'wharf@3', straight: 0.36, was: 0.36, longest: 230, jumps: 2, hilly: true },
  lanes: { key: 'lanes', straight: 0.4, was: 0.4, longest: 220, jumps: 3, hilly: true },
  // 2026-11-20, the first with branches (branches.test.ts and skillTracks.test.ts have its own)
  works: { key: 'works', straight: 0.4, was: 0.4, longest: 220, jumps: 1, hilly: true },
}

const load = (id: RaceTrackId): Track => raceTrack(id)!

describe.each(RACE_TRACK_IDS)('the redrawn %s', (id) => {
  const track = load(id)
  const { road } = track
  const plan = PLAN[id]

  it('starts its records afresh', () => {
    expect(recordKey(track)).toBe(plan.key)
  })

  it('is less straight than it was, with no straight longer than the one to the line', () => {
    const shape = roadShape(road)
    expect(shape.straightShare).toBeLessThan(plan.straight)
    expect(plan.straight).toBeLessThanOrEqual(plan.was + 0.001)
    expect(shape.longestStraight).toBeLessThan(plan.longest)
    // It turns one way and then the other at least ten times a lap: esses, chicanes, switchbacks
    expect(shape.flips).toBeGreaterThanOrEqual(10)
    expect(shape.length).toBeGreaterThan(1700)
    expect(shape.length).toBeLessThan(3300)
  })

  it('leaves room for eight karts side by side everywhere: 28 m or more', () => {
    expect(Math.min(...road.map((point) => point.width))).toBeGreaterThanOrEqual(28)
  })

  it('never runs into itself, and its kerbs never fold over', () => {
    for (let i = 0; i < road.length; i++) {
      for (let j = i + 1; j < road.length; j++) {
        if (alongRoad(road, i, j) < Math.max(90, (road[i]!.width + road[j]!.width) * 1.2)) continue
        const gap = Math.hypot(road[i]!.x - road[j]!.x, road[i]!.z - road[j]!.z)
        if (gap <= (road[i]!.width + road[j]!.width) / 2 + 4) {
          throw new Error(`road ${i} and ${j} are ${gap.toFixed(1)} m apart`)
        }
      }
    }
    for (let index = 0; index < road.length; index++) {
      const a = road[(index - 2 + road.length) % road.length]!
      const b = road[index]!
      const c = road[(index + 2) % road.length]!
      const ab = Math.hypot(b.x - a.x, b.z - a.z)
      const bc = Math.hypot(c.x - b.x, c.z - b.z)
      const ca = Math.hypot(a.x - c.x, a.z - c.z)
      const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))
      const radius = cross < 1e-6 ? Infinity : (ab * bc * ca) / (2 * cross)
      expect(radius, `road ${index}`).toBeGreaterThan(b.width / 2 + 3)
    }
  })

  it('has its gates in order round the lap, near enough to each other, each with a respawn on the road', () => {
    expect(track.gates.length).toBeGreaterThanOrEqual(30)
    expect(track.respawns).toHaveLength(track.gates.length)
    track.gates.forEach((gate, index) => {
      const next = track.gates[(index + 1) % track.gates.length]!
      const middle = { x: (gate.ax + gate.bx) / 2, z: (gate.az + gate.bz) / 2 }
      const nextMiddle = { x: (next.ax + next.bx) / 2, z: (next.az + next.bz) / 2 }
      // No further than a few seconds' drive, and reaching kerb to kerb: none can be driven round.
      // 2026-11-20: a track with branches has no gate across a branch's mouth (branches.ts): a gap
      // where one leaves or joins the road at a shallow angle
      expect(Math.hypot(nextMiddle.x - middle.x, nextMiddle.z - middle.z)).toBeLessThan(
        track.forks ? 170 : 70,
      )
      expect(Math.hypot(gate.bx - gate.ax, gate.bz - gate.az)).toBeGreaterThan(27.9)
      // Driving from this gate's respawn to the next one's crosses the next gate forwards
      const from = track.respawns[index]!
      const to = track.respawns[(index + 1) % track.respawns.length]!
      const ahead = { x: to.x + Math.sin(to.heading) * 2, z: to.z - Math.cos(to.heading) * 2 }
      expect(gateCrossing(next, from.x, from.z, ahead.x, ahead.z)).toBe(1)
      // The respawn is on the road, a kart's width and more in from the kerbs and any island
      expect(roadClearance(road, from.x, from.z)).toBeLessThan(-(KART_RADIUS + 4))
      if (track.walls.length > 0) {
        expect(wallClearance(track.walls, from.x, from.z)).toBeGreaterThan(KART_RADIUS + 2)
      }
    })
  })

  it.skipIf(!track.forks)(
    'has branches of their own: kerbs that never fold, gates and respawns on them, clear of walls',
    () => {
      for (const fork of track.forks ?? []) {
        const { path } = fork
        expect(Math.min(...path.map((point) => point.width))).toBeGreaterThanOrEqual(10)
        for (let index = 2; index < path.length - 2; index++) {
          const a = path[index - 2]!
          const b = path[index]!
          const c = path[index + 2]!
          const ab = Math.hypot(b.x - a.x, b.z - a.z)
          const bc = Math.hypot(c.x - b.x, c.z - b.z)
          const ca = Math.hypot(a.x - c.x, a.z - c.z)
          const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x))
          const radius = cross < 1e-6 ? Infinity : (ab * bc * ca) / (2 * cross)
          expect(radius, `branch point ${index}`).toBeGreaterThan(b.width / 2 + 3)
        }
        expect(fork.count).toBeGreaterThanOrEqual(1)
        fork.respawns.forEach((spot) => {
          expect(roadClearance(road, spot.x, spot.z)).toBeLessThan(-(KART_RADIUS + 2))
          expect(wallClearance(track.allWalls, spot.x, spot.z)).toBeGreaterThan(KART_RADIUS + 1)
        })
      }
    },
  )

  it('has a grid of eight on the road behind the line, no two places touching', () => {
    expect(track.grid).toHaveLength(8)
    const line = track.gates[0]!
    track.grid.forEach((place, index) => {
      expect(roadClearance(road, place.x, place.z)).toBeLessThan(-(KART_RADIUS + 1))
      // Behind the line: driving on from the place crosses it forwards
      const far = {
        x: place.x + Math.sin(place.heading) * 60,
        z: place.z - Math.cos(place.heading) * 60,
      }
      expect(gateCrossing(line, place.x, place.z, far.x, far.z)).toBe(1)
      for (const other of track.grid.slice(index + 1)) {
        expect(Math.hypot(other.x - place.x, other.z - place.z)).toBeGreaterThan(
          2 * KART_RADIUS + 1,
        )
      }
    })
  })

  it('keeps its boost pads and item boxes on the road', () => {
    for (const thing of [...track.boostPads, ...track.itemBoxes]) {
      expect(roadClearance(road, thing.x, thing.z)).toBeLessThan(-KART_RADIUS)
    }
    expect(track.boostPads.length).toBeGreaterThanOrEqual(2)
  })

  it('has the hills and jumps it promises', () => {
    expect(track.jumps ?? []).toHaveLength(plan.jumps)
    expect(road.some((point) => (point.y ?? 0) !== 0)).toBe(plan.hilly)
    // A jump is lined up: the road runs straight on for the flight
    for (const lip of track.jumps ?? []) {
      const a = road[lip]!
      const b = road[(lip + 5) % road.length]!
      const before = road[(lip - 2 + road.length) % road.length]!
      const turn =
        Math.atan2(b.x - a.x, -(b.z - a.z)) - Math.atan2(a.x - before.x, -(a.z - before.z))
      expect(Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)))).toBeLessThan(0.2)
    }
  })

  it.each(DIFFICULTIES)(
    'a %s computer kart drives three laps, never the wrong way',
    (level) => {
      const plain = courseOf(track)
      const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road }
      const skill = BOT_SKILLS[level]
      for (const seed of [7, 3]) {
        // 2026-11-20: the hands that choose the road on a track with branches (routes.ts), the
        // brain as it always was on any other
        const brain = createTrackBrain(skill, track, KART_TUNING, seed)
        let trial = startTrial(course)
        let wrong = 0
        let resets = 0
        for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
          const input = brain(trial, { speedShare: skill.topSpeedShare })
          if (input.reset) resets++
          const before = trial.wrongWay
          trial = stepTrial(trial, input, course, KART_TUNING)
          if (trial.wrongWay && !before) wrong++
        }
        expect(trial.phase, `seed ${seed}`).toBe('finished')
        expect(wrong, `seed ${seed}`).toBe(0)
        // Never stuck against a wall for long enough to be put back on the road
        expect(resets, `seed ${seed}`).toBe(0)
        expect(seconds(trial.steps)).toBeLessThan(200)
      }
    },
    60_000,
  )
})

describe('the computer karts on the technical tracks', () => {
  it('the hard one takes the old street’s shortcut, the others the safe lane', () => {
    const track = load('oldstreet')
    const plain = courseOf(track)
    const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
    const lane = (level: (typeof DIFFICULTIES)[number]) => {
      const skill = BOT_SKILLS[level]
      const brain = createBotBrain(skill, track.road, KART_TUNING, 7, track.jumps, track.walls)
      let trial = startTrial(course)
      // The temple square is inside the fork: nearer it than the island is the shortcut
      let nearest = Infinity
      for (let step = 0; trial.phase !== 'finished' && step < 60 * 60; step++) {
        trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
        const { x, z } = trial.run.kart
        nearest = Math.min(nearest, Math.hypot(x - 356, z + 186))
      }
      return nearest
    }
    expect(lane('hard')).toBeLessThan(80)
    expect(lane('normal')).toBeGreaterThan(90)
    expect(lane('easy')).toBeGreaterThan(90)
  })

  it('the hard one is quicker than the normal one, and the normal one than the easy one, everywhere', () => {
    for (const id of RACE_TRACK_IDS) {
      const track = load(id)
      const plain = courseOf(track)
      const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
      const time = (level: (typeof DIFFICULTIES)[number]) => {
        const skill = BOT_SKILLS[level]
        const brain = createTrackBrain(skill, track, KART_TUNING, 7)
        let trial = startTrial(course)
        for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
          trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
        }
        return seconds(trial.steps)
      }
      expect(time('hard'), id).toBeLessThan(time('normal'))
      expect(time('normal'), id).toBeLessThan(time('easy'))
    }
  }, 120_000)
})
