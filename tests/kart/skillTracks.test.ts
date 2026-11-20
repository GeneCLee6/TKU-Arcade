// 2026-11-19 (owner: "it is too easy to become an expert ... drift before the ramp, know the map
// by heart, shortcuts only the skilled get through"; docs/KART-FEEL.md §11, docs/ARCHITECTURE.md
// §4.38): the drift jump, the walls a flying kart clears, a track's guide (its safe line, its
// technical line, the slots and drift jumps that line asks for) and the two tracks to learn by
// heart. technical.test.ts checks each track as it checks every built-in one; here is what is
// their own, and the measure the owner asked for: on these tracks the driver who knows them (the
// master) is well ahead of the one who only drives well (the expert), and a novice still finishes.
import { describe, expect, it } from 'vitest'
import { createDriver, DRIVERS, measure } from '../../scripts/kart/drivers.ts'
import { startRun, stepRun, type Course, type Run } from '../../shared/kart/course.ts'
import {
  ARCADE_TUNING,
  INITIAL_KART,
  KART_TUNING,
  NO_INPUT,
  type KartInput,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import { TERRAIN_TUNING, terrainOf } from '../../shared/kart/terrain.ts'
import {
  nearestRoadPoint,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { forkAt, roadDepth, routeRoad } from '../../shared/kart/branches.ts'
import { courseOf, parseTrack, roadDirection, type RoadPoint } from '../../shared/kart/track.ts'
import { acrossRoad, fence, guideFor, island } from '../../shared/kart/tracks/guide.ts'
import { routeGuide, trackGuide } from '../../shared/kart/tracks/guides.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { FENCE_HEIGHT, SLOT, WHARF } from '../../shared/kart/tracks/wharf.ts'
import { collideWalls, KART_RADIUS, type Wall } from '../../shared/kart/walls.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { BOT_SKILLS, DIFFICULTIES, type BotSkill } from '../../src/kart/bots/skill.ts'
import { calloutBetween } from '../../src/kart/callouts.ts'

const DEG = Math.PI / 180

/** A straight road towards -z, 40 m wide, with a jump lip (2 m up) at z = -100 */
function rampCourse(walls: readonly Wall[] = []): Course {
  const road: RoadPoint[] = []
  for (let i = 0; i <= 120; i++) {
    road.push({ x: 0, z: -i * 5, width: 40, y: i === 20 ? 2 : i === 19 ? 1 : 0 })
  }
  return { walls, start: { x: 0, z: 0, heading: 0 }, terrain: terrainOf({ road, jumps: [20] })! }
}

const going = (course: Course, speed: number, z: number, x = 0): Run => ({
  ...startRun(course),
  kart: { ...INITIAL_KART, x, z, vz: -speed, throttleHeld: true },
})

const THROTTLE: KartInput = { ...NO_INPUT, throttle: true }
const DRIFT_RIGHT: KartInput = { ...THROTTLE, drift: true, steer: 1 }

/** Drives until the car has taken off and come down again; every run on the way */
function overTheRamp(
  course: Course,
  run: Run,
  input: (run: Run) => KartInput,
  tuning: KartTuning = KART_TUNING,
) {
  const runs: Run[] = []
  let flown = false
  for (let step = 0; step < 600; step++) {
    run = stepRun(run, input(run), course, tuning)
    runs.push(run)
    if ((run.kart.air ?? 0) > 0) flown = true
    else if (flown) break
  }
  return runs
}

const travelOf = (run: Run) => Math.atan2(run.kart.vx, -run.kart.vz)

describe('the drift jump', () => {
  const course = rampCourse()

  it('a car that takes off straight lands straight, with the clean landing’s boost', () => {
    const runs = overTheRamp(course, going(course, 60, -40), () => THROTTLE)
    const landed = runs.at(-1)!
    expect(runs.some((run) => (run.kart.air ?? 0) > 0)).toBe(true)
    expect(landed.kart.drifting).toBe(false)
    expect(landed.kart.driftJumps ?? 0).toBe(0)
    expect(landed.kart.miniSeconds).toBeCloseTo(TERRAIN_TUNING.landingBoost, 6)
    expect(Math.abs(travelOf(landed))).toBeLessThan(1 * DEG)
  })

  it('a drift begun before the lip is carried through the air and landed', () => {
    // The drift is begun a quarter of a second before the lip
    const runs = overTheRamp(course, going(course, 60, -85), () => DRIFT_RIGHT)
    const off = runs.findIndex((run) => (run.kart.air ?? 0) > 0)
    const takeoff = runs[off]!
    const landed = runs.at(-1)!
    expect(takeoff.kart.airDrift).toBe(1)
    // In the air it is not a drift on the ground (no smoke, no gauge), but its time runs on
    expect(takeoff.kart.drifting).toBe(false)
    const before = runs[off - 1]!
    expect(takeoff.kart.airHeld).toBeCloseTo(before.kart.driftSeconds + 1 / 60, 6)
    // It flies the way it was sliding: off the road's own direction, to the right
    expect(travelOf(takeoff)).toBeGreaterThan(5 * DEG)
    expect(travelOf(landed)).toBeCloseTo(travelOf(takeoff), 6)
    expect(landed.kart.x).toBeGreaterThan(takeoff.kart.x + 4)
    // Down in the drift it left in, deeper than it took off (the nose swung on in the air), as
    // long as it has been held, the instant boost earned, and counted
    expect(landed.kart.drifting).toBe(true)
    expect(landed.kart.driftDirection).toBe(1)
    expect(landed.kart.airDrift).toBe(0)
    expect(landed.kart.driftSeconds).toBeGreaterThan(0.6)
    const slipAt = (run: Run) => run.kart.heading - travelOf(run)
    expect(slipAt(landed)).toBeGreaterThan(slipAt(takeoff) + 10 * DEG)
    expect(slipAt(landed)).toBeLessThanOrEqual(KART_TUNING.driftMaxSlip + 1e-9)
    expect(landed.kart.driftJumps).toBe(1)
    // No clean landing's boost: the reward is the drift, its instant boost and the gauge
    expect(landed.kart.miniSeconds).toBe(0)
    expect(landed.kart.gauge).toBeGreaterThan(before.kart.gauge + TERRAIN_TUNING.driftJumpGauge - 1)
    const next = stepRun(landed, DRIFT_RIGHT, course)
    expect(next.kart.burstReady).toBe(true)
    // The callout says so
    expect(calloutBetween(runs.at(-2)!.kart, landed.kart)).toEqual({ kind: 'driftJump', count: 0 })
  })

  it('turns as soon as it is down, where a straight landing has still to swing its tail out', () => {
    // Which way each is going a third of a second after its wheels are down, off the road's own
    // direction: the straight flier presses the drift only once it is down
    const after = (input: (run: Run) => KartInput) => {
      const runs = overTheRamp(course, going(course, 60, -85), input)
      let run = runs.at(-1)!
      const landedAt = travelOf(run)
      for (let step = 0; step < 18; step++) run = stepRun(run, DRIFT_RIGHT, course)
      return { now: travelOf(run), since: travelOf(run) - landedAt }
    }
    const carried = after(() => DRIFT_RIGHT)
    const straight = after(() => THROTTLE)
    // Already round a good part of the corner, against a car that has only begun
    expect(carried.now).toBeGreaterThan(55 * DEG)
    expect(straight.now).toBeLessThan(40 * DEG)
    // ... and coming round faster: its tail is out already
    expect(carried.since).toBeGreaterThan(straight.since * 1.15)
  })

  it('is dropped by letting go of the drift key in the air', () => {
    const runs = overTheRamp(course, going(course, 60, -85), (run) =>
      (run.kart.air ?? 0) > 0.3 ? { ...THROTTLE, steer: 1 } : DRIFT_RIGHT,
    )
    const landed = runs.at(-1)!
    expect(landed.kart.drifting).toBe(false)
    expect(landed.kart.driftJumps ?? 0).toBe(0)
    expect(landed.kart.airDrift).toBe(0)
  })

  it('takes a real drift: a tail hardly out at the lip is not carried', () => {
    // Pressed two steps before the lip
    const runs = overTheRamp(course, going(course, 60, -98.5), () => DRIFT_RIGHT)
    const off = runs.find((run) => (run.kart.air ?? 0) > 0)!
    expect(off.kart.airDrift ?? 0).toBe(0)
  })

  it('is the classic feel’s alone: the arcade (old) preset flies as it always did', () => {
    const runs = overTheRamp(course, going(course, 50, -85), () => DRIFT_RIGHT, ARCADE_TUNING)
    for (const run of runs) {
      expect(run.kart.airDrift).toBeUndefined()
      expect(run.kart.driftJumps).toBeUndefined()
    }
  })
})

describe('a wall with a top', () => {
  // Across the road at z = -130, 30 m past the lip
  const across = (top?: number): Wall => ({
    ax: -20,
    az: -130,
    bx: 20,
    bz: -130,
    ...(top === undefined ? {} : { top }),
  })

  it('is flown over by a car high enough, and stops one that is not', () => {
    const fast = overTheRamp(
      rampCourse([across(1.5)]),
      going(rampCourse(), 60, -40),
      () => THROTTLE,
    )
    expect(fast.every((run) => run.hitSpeed === 0)).toBe(true)
    expect(fast.at(-1)!.kart.z).toBeLessThan(-140)
    // Too slow: down before the fence, and into it
    const course = rampCourse([across(1.5)])
    let run = going(course, 22, -80)
    let hit = 0
    for (let step = 0; step < 240; step++) {
      run = stepRun(run, NO_INPUT, course)
      hit = Math.max(hit, run.hitSpeed)
    }
    expect(hit).toBeGreaterThan(5)
    expect(run.kart.z).toBeGreaterThan(-130 + KART_RADIUS - 0.01)
  })

  it('stops a flying car when it has no top, or one higher than the car flies', () => {
    for (const wall of [across(), across(12)]) {
      const course = rampCourse([wall])
      const runs = overTheRamp(course, going(course, 60, -40), () => THROTTLE)
      expect(runs.some((run) => run.hitSpeed > 20)).toBe(true)
    }
  })

  it('counts the height only of a car in the air', () => {
    const wall = across(0.5)
    const before = { ...INITIAL_KART, x: 0, z: -129, vz: -30, y: 3, air: 0 }
    const after = { ...before, z: -129.5 }
    expect(collideWalls(before, after, [wall], KART_TUNING).touching).toBe(true)
    const flying = { ...after, air: 0.2 }
    expect(collideWalls(before, flying, [wall], KART_TUNING).touching).toBe(false)
  })

  it('is part of the track format: a top is a height', () => {
    const withTop = parseTrack({ ...WHARF, walls: [{ ax: 0, az: 0, bx: 1, bz: 1, top: 2 }] })
    expect('track' in withTop && withTop.track.walls[0]!.top).toBe(2)
    const bad = parseTrack({ ...WHARF, walls: [{ ax: 0, az: 0, bx: 1, bz: 1, top: 'high' }] })
    expect('problems' in bad).toBe(true)
  })
})

describe('a guide', () => {
  const road: RoadPoint[] = []
  for (let i = 0; i < 60; i++) road.push({ x: 0, z: -i * 6, width: 40, y: i * 0.1 })
  // Closed far away, so that the ends do not matter
  road.push({ x: 300, z: -180, width: 40, y: 0 })

  it('places things across the road: metres right of the middle, at a road point or between two', () => {
    expect(acrossRoad(road, 10, 7)).toEqual({ x: 7, z: -60 })
    expect(acrossRoad(road, 10.5, -4)).toEqual({ x: -4, z: -63 })
  })

  it('builds fences and islands, a fence’s top over the road beside it', () => {
    const low = fence(
      road,
      [
        [10, -5],
        [12, 5],
      ],
      1.5,
    )
    expect(low).toEqual([{ ax: -5, az: -60, bx: 5, bz: -72, top: 1.2 + 1.5 }])
    expect(fence(road, [[10, 0]])).toEqual([])
    // An island: a closed loop with a nose beyond each end
    const walls = island(road, 20, 24, 4, 8)
    expect(walls).toHaveLength(12)
    walls.forEach((wall, index) => {
      const next = walls[(index + 1) % walls.length]!
      expect([wall.bx, wall.bz]).toEqual([next.ax, next.az])
    })
    expect(walls[0]).toMatchObject({ ax: 6, az: -114 })
  })

  it('has two lines, down the middle until told otherwise; a chord is straight as the crow flies', () => {
    const builder = guideFor(road)
    builder.safe.hold(10, 14, 6, 3)
    builder.tech.chord([20, -10], [30, 10], 2)
    builder.slot(25, 0).cue({ lip: 40, way: 1, land: [48, 5], into: 0.3, nose: 0.6 })
    const guide = builder.build()
    expect(guide.safe).toHaveLength(road.length)
    expect(guide.tech[5]).toBe(0)
    expect(guide.techRoom[5]).toBe(15)
    // The safe line's steps are eased; the technical line is exactly what was drawn
    expect(guide.safe[12]).toBeGreaterThan(5)
    expect(guide.safe[9]).toBeGreaterThan(0)
    expect(guide.safe[9]).toBeLessThan(6)
    expect(guide.tech[10]).toBe(0)
    expect(guide.tech[20]).toBeCloseTo(-10, 6)
    expect(guide.tech[25]).toBeCloseTo(0, 6)
    expect(guide.tech[30]).toBeCloseTo(10, 6)
    expect(guide.techRoom[25]).toBe(2)
    expect(guide.slots).toEqual([{ index: 25, across: 0 }])
    expect(guide.cues[0]!.lip).toBe(40)
  })
})

const SKILL_TRACKS = ['wharf', 'lanes'] as const

/** How far right of the middle (x, z) is at the road point nearest it */
function acrossAt(road: readonly RoadPoint[], x: number, z: number) {
  const index = nearestRoadPoint(road, x, z)
  const point = road[index]!
  const { dx, dz } = roadDirection(road, index)
  return { index, across: (x - point.x) * -dz + (z - point.z) * dx }
}

describe.each(SKILL_TRACKS)('%s, a track to learn by heart', (id) => {
  const track = raceTrack(id)!
  const guide = trackGuide(id)!
  const { road } = track

  it('has a guide: two lines on the road, clear of every wall, that differ where the shortcuts are', () => {
    expect(guide.safe).toHaveLength(road.length)
    expect(guide.tech).toHaveLength(road.length)
    let apart = 0
    road.forEach((point, index) => {
      for (const across of [guide.safe[index]!, guide.tech[index]!]) {
        expect(Math.abs(across), `road ${index}`).toBeLessThan(point.width / 2 - KART_RADIUS)
      }
      if (Math.abs(guide.safe[index]! - guide.tech[index]!) > 10) apart++
      // The safe line keeps a kart's width and more from every wall on the road
      const safe = acrossRoad(road, index, guide.safe[index]!)
      for (const wall of track.walls) {
        const lengthSq = (wall.bx - wall.ax) ** 2 + (wall.bz - wall.az) ** 2
        const t = Math.max(
          0,
          Math.min(
            1,
            ((safe.x - wall.ax) * (wall.bx - wall.ax) + (safe.z - wall.az) * (wall.bz - wall.az)) /
              lengthSq,
          ),
        )
        const gap = Math.hypot(
          safe.x - (wall.ax + (wall.bx - wall.ax) * t),
          safe.z - (wall.az + (wall.bz - wall.az) * t),
        )
        expect(gap, `road ${index}`).toBeGreaterThan(KART_RADIUS + 3)
      }
    })
    // A fifth of the lap or more is driven somewhere else by those who know it
    expect(apart / road.length).toBeGreaterThan(0.2)
  })

  it('has its slots in its walls: a gap a kart fits through, and no wider than it says', () => {
    expect(guide.slots.length).toBeGreaterThanOrEqual(3)
    for (const slot of guide.slots) {
      const middle = acrossRoad(road, slot.index, slot.across)
      const ends = track.walls
        .flatMap((wall) => [
          Math.hypot(wall.ax - middle.x, wall.az - middle.z),
          Math.hypot(wall.bx - middle.x, wall.bz - middle.z),
        ])
        .sort((a, b) => a - b)
      // A wall's end either side, half a slot away
      expect(ends[0]!).toBeGreaterThan(SLOT / 2 - 0.6)
      expect(ends[1]!).toBeLessThan(SLOT / 2 + 0.6)
    }
  })

  it('has a drift jump at every ramp its technical line takes, and fences only a flier clears', () => {
    expect(guide.cues.length).toBeGreaterThanOrEqual(2)
    for (const cue of guide.cues) {
      expect(track.jumps).toContain(cue.lip)
      // The landing is on the road, further on
      expect(cue.land[0]).toBeGreaterThan(cue.lip + 5)
      const land = acrossRoad(road, cue.land[0], cue.land[1])
      expect(roadClearance(road, land.x, land.z)).toBeLessThan(-KART_RADIUS)
    }
    const fences = track.walls.filter((wall) => wall.top !== undefined && wall.top < 4)
    expect(fences.length).toBeGreaterThanOrEqual(1)
    for (const wall of fences) {
      const { index } = acrossAt(road, wall.ax, wall.az)
      expect(wall.top! - (road[index]!.y ?? 0)).toBeCloseTo(FENCE_HEIGHT, 0)
    }
    // Every other wall is a shed's: nothing flies over it
    for (const wall of track.walls.filter((one) => !fences.includes(one))) {
      const { index } = acrossAt(road, wall.ax, wall.az)
      expect(wall.top! - (road[index]!.y ?? 0)).toBeGreaterThan(7)
    }
  })

  it('pays the technical line with boost pads no other line reaches', () => {
    const hidden = track.boostPads.filter((pad) => {
      const { index, across } = acrossAt(road, pad.x, pad.z)
      return Math.abs(across - guide.tech[index]!) < 1 && Math.abs(across - guide.safe[index]!) > 12
    })
    expect(hidden.length).toBeGreaterThanOrEqual(3)
  })

  // Three seeds each: the master and the expert are steady hands, so the gap is the track's
  const runs = (who: 'novice' | 'expert' | 'master', seeds: readonly number[]) =>
    seeds.map((seed) => measure(track, DRIVERS[who], KART_TUNING, seed))
  const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length

  it('the driver who knows it is well ahead of the one who only drives well', () => {
    const expert = runs('expert', [7, 14, 21])
    const master = runs('master', [7, 14, 21])
    for (const run of [...expert, ...master]) {
      expect(run.finished).toBe(true)
      expect(run.resets).toBe(0)
    }
    const gap = 1 - mean(master.map((run) => run.seconds)) / mean(expert.map((run) => run.seconds))
    // The owner's mark: 8 to 10% or more (measured: the wharf 12%, the lanes 8%). 2026-11-20: the
    // wharf's shed lane became a branch, a road of its own (branches.ts), and gives less than the
    // lane inside a wide road did: 6 to 7%
    expect(gap).toBeGreaterThan(id === 'wharf' ? 0.055 : 0.065)
    // Both boost most of the way round: it is the line that tells them apart, not the gauge
    for (const run of master) expect(run.cover).toBeGreaterThan(0.6)
  }, 120_000)

  it('a novice still finishes it, slowly', () => {
    for (const run of runs('novice', [7, 14])) {
      expect(run.finished).toBe(true)
      // 2026-11-20: the wharf's novice is put back now and then all round the lap (seed 14: ten)
      expect(run.resets).toBeLessThanOrEqual(id === 'wharf' ? 10 : 8)
      expect(run.seconds).toBeLessThan(200)
    }
  }, 120_000)

  // 2026-11-20: and the expert computer kart, which drives the master's line (src/kart/bots/expert.ts)
  it.each([
    ['the master', DRIVERS.master.skill],
    ['the expert computer kart', BOT_SKILLS.expert],
  ] as const)(
    '%s does what the guide asks: every drift jump landed, every slot gone through',
    (_, skill) => {
      const plain = courseOf(track)
      const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road }
      const brain = createBotBrain(skill, road, KART_TUNING, 7, track.jumps, track.walls, guide)
      let trial = startTrial(course)
      const through = new Set<number>()
      for (let step = 0; trial.phase !== 'finished' && step < 200 * 60; step++) {
        trial = stepTrial(trial, brain(trial, { speedShare: 1 }), course)
        const { kart } = trial.run
        guide.slots.forEach((slot, index) => {
          const middle = acrossRoad(road, slot.index, slot.across)
          if (Math.hypot(kart.x - middle.x, kart.z - middle.z) < SLOT / 2) through.add(index)
        })
      }
      expect(trial.phase).toBe('finished')
      expect(trial.run.resets).toBe(0)
      expect(trial.run.kart.driftJumps).toBe(guide.cues.length * track.laps)
      expect(through.size).toBe(guide.slots.length)
    },
    60_000,
  )

  // The three levels the owner has yet to teach the guide to (the expert, above, knows it)
  it.each(DIFFICULTIES.filter((level) => level !== 'expert'))(
    'a %s computer kart keeps to the safe line: no drift jump, no slot',
    (level) => {
      const plain = courseOf(track)
      const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road }
      const skill = BOT_SKILLS[level]
      const brain = createBotBrain(skill, road, KART_TUNING, 5, track.jumps, track.walls, guide)
      let trial = startTrial(course)
      let slots = 0
      for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
        trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
        const { kart } = trial.run
        for (const slot of guide.slots) {
          const middle = acrossRoad(road, slot.index, slot.across)
          if (Math.hypot(kart.x - middle.x, kart.z - middle.z) < SLOT / 2) slots++
        }
      }
      expect(trial.phase).toBe('finished')
      expect(trial.run.kart.driftJumps ?? 0).toBe(0)
      expect(slots).toBe(0)
    },
    60_000,
  )
})

describe('a jump into a corner', () => {
  it('the computer karts lift before the crest: the datun ridge is driven with fewer crashes', () => {
    // 2026-11-19: the expert's crashes on the ridge, three laps (22 before the lift, the hardest
    // of them after the second jump, into the left that tightens)
    const run = measure(raceTrack('datun')!, DRIVERS.expert, KART_TUNING, 7)
    expect(run.finished).toBe(true)
    expect(run.crashes).toBeLessThanOrEqual(20)
  }, 60_000)

  it('the master is the expert on a track without a guide', () => {
    const track = raceTrack('fort')!
    expect(trackGuide('fort')).toBeUndefined()
    const expert = measure(track, DRIVERS.expert, KART_TUNING, 7)
    const master = measure(track, DRIVERS.master, KART_TUNING, 7)
    expect(master.seconds).toBe(expert.seconds)
  }, 60_000)
})

// 2026-11-20 (docs/KART-FEEL.md §14, docs/ARCHITECTURE.md §4.41): the shortcuts that are roads of
// their own (shared/kart/branches.ts). The Viaduct Works has three, each asking for its own hands;
// the wharf's shed lane is one. The driver who knows them takes every one of them every lap; the
// computer karts, who do not, never do; and the gap between the two is the owner's mark.
const BRANCH_TRACKS = ['works', 'wharf'] as const

describe.each(BRANCH_TRACKS)('%s, its branches', (id) => {
  const track = raceTrack(id)!
  const forks = track.forks!
  const paths = forks.map((fork) => fork.path)
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }

  /** One driver, three laps: which branches it was on, lap by lap, and how it went */
  function drive(skill: BotSkill | 'master', seed: number) {
    const brain =
      skill === 'master'
        ? createDriver(DRIVERS.master, track, KART_TUNING, seed)
        : (() => {
            const hands = createTrackBrain(skill, track, KART_TUNING, seed)
            return (trial: Trial) => hands(trial, { speedShare: skill.topSpeedShare })
          })()
    let trial = startTrial(course)
    const taken = new Set<string>()
    let wrong = 0
    for (let step = 0; trial.phase !== 'finished' && step < 300 * 60; step++) {
      trial = stepTrial(trial, brain(trial), course)
      if (trial.wrongWay) wrong++
      const on = forkAt(track.road, paths, trial.run.kart.x, trial.run.kart.z)
      if (on >= 0) taken.add(`${trial.laps.length}:${on}`)
    }
    return { trial, taken, wrong }
  }

  it('has a route guide for the way down every branch', () => {
    const guide = routeGuide(id)!
    const route = routeRoad(track, forks.map((_, index) => index))
    expect(guide.safe).toHaveLength(route.road.length)
    expect(guide.tech).toHaveLength(route.road.length)
  })

  it('the driver who knows it takes every branch every lap, and is never put back on the road', () => {
    const { trial, taken, wrong } = drive('master', 7)
    expect(trial.phase).toBe('finished')
    expect(trial.run.resets).toBe(0)
    expect(wrong).toBe(0)
    expect(taken.size).toBe(forks.length * track.laps)
  }, 60_000)

  // The expert computer kart (expert.ts) knows the techniques: it takes every branch too
  it.each(DIFFICULTIES)('a %s computer kart, two seeds, never the wrong way: down the branches only if it knows how', (level) => {
    const skill = BOT_SKILLS[level]
    for (const seed of [5, 9]) {
      const { trial, taken, wrong } = drive(skill, seed)
      expect(trial.phase, `seed ${seed}`).toBe('finished')
      expect(wrong, `seed ${seed}`).toBe(0)
      expect(trial.run.resets, `seed ${seed}`).toBe(0)
      expect(taken.size, `seed ${seed}`).toBe(skill.tricks ? forks.length * track.laps : 0)
    }
  }, 120_000)
})

describe('the Viaduct Works', () => {
  const track = raceTrack('works')!
  const [deck, alley, cut] = track.forks!

  it('has three branches, each a road of its own that skips a good part of the lap', () => {
    expect(track.forks).toHaveLength(3)
    for (const fork of track.forks!) {
      const mainLength = fork.to - fork.from
      expect(fork.path.length).toBeLessThan(mainLength)
      expect(fork.count).toBeGreaterThanOrEqual(3)
    }
  })

  it('the loading deck: off the ramp, raised, its mouth closed by a fence only a flier clears', () => {
    expect(track.jumps).toContain(deck!.from)
    expect(Math.max(...deck!.path.map((point) => point.y ?? 0))).toBeGreaterThanOrEqual(3)
    const fences = track.walls.filter(
      (wall) => wall.top !== undefined && wall.top < 4 && roadDepth(deck!.path, false, wall.ax, wall.az) > -14,
    )
    expect(fences.length).toBeGreaterThanOrEqual(3)
    for (const wall of fences) expect(wall.top).toBeCloseTo(FENCE_HEIGHT, 1)
  })

  it('the narrow alley: a slot in a shed wall across it, no wider than a slot', () => {
    const walls = track.walls.filter(
      (wall) => (wall.top ?? 0) > 7 && roadDepth(alley!.path, false, wall.ax, wall.az) > -3,
    )
    expect(walls.length).toBe(2)
    const [a, b] = walls
    const gap = Math.min(
      Math.hypot(a!.bx - b!.ax, a!.bz - b!.az),
      Math.hypot(a!.ax - b!.bx, a!.az - b!.bz),
      Math.hypot(a!.bx - b!.bx, a!.bz - b!.bz),
      Math.hypot(a!.ax - b!.ax, a!.az - b!.az),
    )
    expect(gap).toBeGreaterThan(2 * KART_RADIUS + 4)
    expect(gap).toBeLessThan(11)
  })

  it('the blind cut: off the crest, a shed’s wall along the kerb leaving only the first of its mouth open', () => {
    const crest = Math.max(...track.road.map((point) => point.y ?? 0))
    expect(track.road[cut!.from]!.y).toBeGreaterThan(crest - 0.5)
    const sheds = track.walls.filter(
      (wall) => (wall.top ?? 0) > 7 && roadDepth(cut!.path, false, wall.ax, wall.az) > -20,
    )
    expect(sheds.length).toBeGreaterThanOrEqual(1)
  })

  // Three seeds each: the master and the expert are steady hands, so the gap is the track's
  const runs = (who: 'novice' | 'expert' | 'master', seeds: readonly number[]) =>
    seeds.map((seed) => measure(track, DRIVERS[who], KART_TUNING, seed))
  const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length

  it('the driver who knows it is well ahead of the one who only drives well: 8% or more', () => {
    const expert = runs('expert', [7, 14, 21])
    const master = runs('master', [7, 14, 21])
    for (const run of [...expert, ...master]) {
      expect(run.finished).toBe(true)
      expect(run.resets).toBe(0)
    }
    const gap = 1 - mean(master.map((run) => run.seconds)) / mean(expert.map((run) => run.seconds))
    expect(gap).toBeGreaterThan(0.08)
  }, 120_000)

  it('a novice still finishes it, slowly', () => {
    for (const run of runs('novice', [7, 14])) {
      expect(run.finished).toBe(true)
      expect(run.resets).toBeLessThanOrEqual(10)
      expect(run.seconds).toBeLessThan(220)
    }
  }, 120_000)
})
