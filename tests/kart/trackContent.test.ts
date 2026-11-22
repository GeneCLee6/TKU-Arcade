import { describe, expect, it } from 'vitest'
import { forkAt } from '../../shared/kart/branches.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { seconds, startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, roadDirection, type Track } from '../../shared/kart/track.ts'
import { HARBOUR_STEP } from '../../shared/kart/tracks/harbour.ts'
import { ALLEY_DOOR_WIDTH } from '../../shared/kart/tracks/oldstreet.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { routeGuide, trackGuide } from '../../shared/kart/tracks/guides.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { BOT_SKILLS, DIFFICULTIES, type Difficulty } from '../../src/kart/bots/skill.ts'
import { findSlots, wallRuns } from '../../src/kart/art/skillWalls.ts'

// 2026-11-22 (#103, docs/ARCHITECTURE.md §4.66): the lantern alley, the old street's second
// shortcut, and the steps into a corner on the harbour and the old street

const oldstreet = raceTrack('oldstreet')!
const harbour = raceTrack('harbour')!

const courseFor = (track: Track): TrialCourse => {
  const plain = courseOf(track)
  return { ...plain, checkpoints: plain.checkpoints!, road: track.road }
}

/** Three laps by `skill` hands: the branches taken, drift jumps, wrong ways, resets */
function race(track: Track, difficulty: Difficulty | 'master', seed: number) {
  const skill = difficulty === 'master' ? { ...BOT_SKILLS.expert } : BOT_SKILLS[difficulty]
  const brain = createTrackBrain(skill, track, KART_TUNING, seed)
  const course = courseFor(track)
  const paths = (track.forks ?? []).map((fork) => fork.path)
  let trial = startTrial(course)
  let wrong = 0
  let onBranch = 0
  let was = false
  for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
    const before = trial
    trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
    if (trial.wrongWay && !before.wrongWay) wrong++
    const on = paths.length > 0 && forkAt(track.road, paths, trial.run.kart.x, trial.run.kart.z) >= 0
    if (on && !was) onBranch++
    was = on
  }
  return {
    trial,
    wrong,
    onBranch,
    driftJumps: trial.run.kart.driftJumps ?? 0,
    resets: trial.run.resets,
    total: seconds(trial.steps),
  }
}

describe('the lantern alley (oldstreet@10)', () => {
  it('is a branch of its own off the lantern lane, its doorway one slot in a wall across it', () => {
    expect(oldstreet.revision).toBe(10)
    expect(oldstreet.forks).toHaveLength(1)
    const fork = oldstreet.forks![0]!
    // Shorter than the road round the corner it cuts
    const length = (points: readonly { x: number; z: number }[]) =>
      points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i]!.x, point.z - points[i]!.z), 0)
    const round = length(oldstreet.road.slice(fork.from, fork.to + 1))
    expect(length(fork.path)).toBeLessThan(round * 0.85)
    // The doorway: found from the walls themselves, as the art finds it
    const runs = wallRuns(oldstreet.walls.filter((wall) => wall.top !== undefined), () => 0)
    const slots = findSlots(runs)
    expect(slots).toHaveLength(1)
    expect(slots[0]!.width).toBeCloseTo(ALLEY_DOOR_WIDTH, 1)
    // The route's guide aims the technical line through it
    expect(routeGuide('oldstreet')!.slots).toHaveLength(1)
    expect(trackGuide('oldstreet')).toBeUndefined()
  })

  it('the expert takes it every lap; the easy, normal and hard computer karts never do', () => {
    for (const seed of [1, 2]) {
      const expert = race(oldstreet, 'expert', seed)
      expect(expert.trial.phase).toBe('finished')
      expect(expert.onBranch, `seed ${seed}`).toBe(3)
      expect(expert.wrong).toBe(0)
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const run = race(oldstreet, difficulty, seed)
        expect(run.trial.phase).toBe('finished')
        expect(run.onBranch, `${difficulty} ${seed}`).toBe(0)
        expect(run.wrong).toBe(0)
      }
    }
  }, 120_000)
})

describe('the steps into a corner', () => {
  it.each([
    ['harbour', harbour],
    ['oldstreet', oldstreet],
  ] as const)('%s has one, lined up, the road turning hard within 60 m of its lip', (_, track) => {
    expect(track.jumps).toHaveLength(1)
    const lip = track.jumps![0]!
    const { road } = track
    expect(road[lip]!.y).toBeCloseTo(1.6, 5)
    // The road turns at least 25 degrees within 60 m past the lip: a jump into a corner
    const start = roadDirection(road, lip)
    let run = 0
    let most = 0
    for (let index = lip + 1; run < 60; index++) {
      const a = road[(index - 1) % road.length]!
      const b = road[index % road.length]!
      run += Math.hypot(b.x - a.x, b.z - a.z)
      const now = roadDirection(road, index % road.length)
      most = Math.max(most, Math.acos(Math.max(-1, Math.min(1, start.dx * now.dx + start.dz * now.dz))))
    }
    expect(most).toBeGreaterThan((25 * Math.PI) / 180)
  })

  it('the harbour step is where the guide cues a drift jump, and the expert lands it every lap', () => {
    const guide = trackGuide('harbour')!
    expect(guide.cues).toHaveLength(1)
    const lip = harbour.jumps![0]!
    expect(guide.cues[0]!.lip).toBe(lip)
    const point = harbour.road[lip]!
    expect(Math.hypot(point.x - HARBOUR_STEP[0], point.z - HARBOUR_STEP[1])).toBeLessThan(6)
    for (const seed of [1, 2]) {
      const expert = race(harbour, 'expert', seed)
      expect(expert.trial.phase).toBe('finished')
      expect(expert.driftJumps, `seed ${seed}`).toBeGreaterThanOrEqual(3)
      expect(expert.resets).toBe(0)
    }
  }, 120_000)

  it('every computer kart takes both steps three laps running, never the wrong way', () => {
    for (const track of [harbour, oldstreet]) {
      for (const difficulty of DIFFICULTIES) {
        const run = race(track, difficulty, 3)
        expect(run.trial.phase, `${track.id} ${difficulty}`).toBe('finished')
        expect(run.wrong, `${track.id} ${difficulty}`).toBe(0)
        expect(run.resets, `${track.id} ${difficulty}`).toBeLessThanOrEqual(1)
      }
    }
  }, 120_000)
})
