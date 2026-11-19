// 2026-11-18 (owner: "more technical ... more maps, ones that tell the drivers apart";
// docs/ARCHITECTURE.md §4.37, docs/KART-FEEL.md §10.1): the four new tracks. technical.test.ts checks
// each as it checks every built-in track (legal, never crossing itself, wide enough, gates in order,
// a grid of eight, all three computer difficulties three laps without a wrong way or a reset);
// here is what is their own: the way they are laid (lay.ts), the night circuit's roundabout and its
// shortcut, how much of each is corners, the gap between the feel drivers, and their scenery.
import { describe, expect, it } from 'vitest'
import { FEEL_DRIVERS, feelRace } from '../../scripts/kart/feel.ts'
import { roadShape } from '../../scripts/kart/shape.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { roadClearance } from '../../shared/kart/scenery.ts'
import {
  nearestRoadPoint,
  startTrial,
  stepTrial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf, roadDirection } from '../../shared/kart/track.ts'
import {
  ISLAND_INNER,
  ISLAND_OUTER,
  ROUNDABOUT_RADIUS,
  ROUNDABOUT_WIDTH,
} from '../../shared/kart/tracks/danhai.ts'
import { fitted, lay, LAY_SAMPLE, left, line, right } from '../../shared/kart/tracks/lay.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { KART_RADIUS } from '../../shared/kart/walls.ts'
import { FORT_HALF, LOCAL_TRACK_IDS, localPlan } from '../../src/kart/art/localPlan.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { BOT_SKILLS, DIFFICULTIES } from '../../src/kart/bots/skill.ts'
import { sharpCorners } from './trackShape.ts'

describe('a road laid corner by corner', () => {
  // A stadium: two straights joined by two half circles of 40 m
  const stadium = () =>
    lay([fitted(30), right(180, 40, 30), line(100, 30), right(180, 40, 30), fitted(30)], {
      width: 30,
    })

  it('closes on the line: the two fitted straights are solved for', () => {
    // Parallel straights cannot close a loop: the fit needs two directions
    expect(stadium).toThrow(/parallel/)
    const laid = lay(
      [
        line(50, 30),
        right(90, 40, 30),
        fitted(30),
        right(90, 40, 30),
        line(120, 30),
        right(90, 40, 30),
        line(80, 30, { mid: 'far', mark: 'corner' }),
        right(90, 40, 30),
        fitted(30),
      ],
      { width: 30 },
    )
    // A rectangle: its sides come out equal to the ones across
    expect(laid.fits[0]).toBeCloseTo(80, 6)
    expect(laid.fits[1]).toBeCloseTo(70, 6)
    const first = laid.control[0]!
    const last = laid.control.at(-1)!
    expect(first[0]).toBeCloseTo(0, 6)
    expect(first[1]).toBeCloseTo(0, 6)
    // The last point is one sample short of the first
    expect(Math.hypot(last[0] - first[0], last[1] - first[1])).toBeLessThan(LAY_SAMPLE * 1.5)
    // Its points are a sample apart, more or less, all the way round
    laid.control.forEach((point, index) => {
      const next = laid.control[(index + 1) % laid.control.length]!
      const gap = Math.hypot(next[0] - point[0], next[1] - point[1])
      expect(gap).toBeGreaterThan(LAY_SAMPLE * 0.6)
      expect(gap).toBeLessThan(LAY_SAMPLE * 1.5)
    })
    // The named places: the middle and the end of the far side
    expect(laid.marks.far![0]).toBeCloseTo(laid.marks.corner![0] + 40, 6)
    expect(laid.marks.far![1]).toBeCloseTo(laid.marks.corner![1], 6)
    // A flat road has no heights
    expect(first).toHaveLength(3)
  })

  it('turns exactly as told: an arc is on its circle', () => {
    const laid = lay(
      [fitted(30), left(90, 50, 30), fitted(30), left(90, 50, 30), line(60, 30), left(180, 80, 30)],
      { width: 30 },
    )
    // The last step is a half circle of 80 m about (-80, 0): its points are all 80 m from there
    const arc = laid.control.slice(-Math.round((Math.PI * 80) / LAY_SAMPLE))
    for (const [x, z] of arc) expect(Math.hypot(x + 80, z)).toBeCloseTo(80, 6)
  })

  it('carries widths and heights from step to step, and must end where it began', () => {
    const steps = (down: number) => [
      line(60, 36, { height: 6 }),
      right(90, 40, 30, { height: 6 }),
      fitted(30, { height: down }),
      right(90, 40, 30),
      line(140, 30),
      right(90, 40, 30),
      line(80, 30),
      right(90, 40, 30),
      fitted(30),
    ]
    const laid = lay(steps(0), { width: 30, height: 0 })
    const heights = laid.control.map((point) => point[3]!)
    expect(Math.max(...heights)).toBe(6)
    expect(Math.min(...heights)).toBe(0)
    // Eased: no step from one point to the next steeper than a hill may be
    heights.forEach((height, index) => {
      const next = heights[(index + 1) % heights.length]!
      expect(Math.abs(next - height) / LAY_SAMPLE).toBeLessThan(0.25)
    })
    // The width narrows evenly along the first corner
    expect(laid.control[0]![2]).toBe(30)
    expect(laid.control[10]![2]).toBe(36)
    expect(() => lay(steps(2), { width: 30, height: 0 })).toThrow(/not where it began/)
  })

  it('refuses a plan that does not turn a whole circle, or cannot close', () => {
    expect(() => lay([fitted(30), right(90, 40, 30), fitted(30)], { width: 30 })).toThrow(
      /whole circle/,
    )
    expect(() => lay([line(10, 30), right(360, 40, 30)], { width: 30 })).toThrow(/two straights/)
    // The far side is longer than the near side can ever be made
    expect(() =>
      lay(
        [
          line(300, 30),
          right(90, 40, 30),
          fitted(30),
          right(90, 40, 30),
          line(20, 30),
          right(90, 40, 30),
          line(80, 30),
          right(90, 40, 30),
          fitted(30),
        ],
        { width: 30 },
      ),
    ).toThrow(/does not close/)
  })
})

/** What each of the four is for */
const PLAN = {
  mangrove: { sharp: 12, flips: 16, gap: 0.85 },
  fort: { sharp: 8, flips: 10, gap: 0.93 },
  danhai: { sharp: 10, flips: 10, gap: 0.9 },
  datun: { sharp: 14, flips: 16, gap: 0.92 },
} as const

describe.each(LOCAL_TRACK_IDS)('the technical track %s', (id) => {
  const track = raceTrack(id)!
  const { road } = track

  it('is nearly all corners: seven tenths of the lap or more', () => {
    const shape = roadShape(road)
    expect(shape.straightShare).toBeLessThanOrEqual(0.3)
    expect(shape.flips).toBeGreaterThanOrEqual(PLAN[id].flips)
    // Corners that want a drift: the road swings round by 75 degrees within 60 m
    expect(sharpCorners(road, 60, 75)).toBeGreaterThanOrEqual(PLAN[id].sharp)
  })

  it('has a row of item boxes or more, on the road and clear of any island', () => {
    expect(track.itemBoxes.length).toBeGreaterThanOrEqual(8)
    for (const box of track.itemBoxes) {
      expect(roadClearance(road, box.x, box.z)).toBeLessThan(-KART_RADIUS)
    }
  })

  it('tells the drivers apart: the expert is well ahead of the novice, the average between', () => {
    const [novice, average, expert] = (['novice', 'average', 'expert'] as const).map((who) =>
      feelRace(id, FEEL_DRIVERS[who], KART_TUNING),
    )
    for (const result of [novice!, average!, expert!]) expect(result.finished).toBe(true)
    expect(expert!.seconds).toBeLessThan(novice!.seconds * PLAN[id].gap)
    expect(average!.seconds).toBeLessThan(novice!.seconds)
    expect(expert!.seconds).toBeLessThan(average!.seconds)
  }, 60_000)

  it('keeps its own scenery off the road, the same every time, less of it at low quality', () => {
    const plan = localPlan(track, 1)!
    expect(plan.id).toBe(id)
    const things = [
      ...plan.pools.map((pool) => ({ ...pool, room: pool.size })),
      ...plan.clumps.map((clump) => ({ ...clump, room: 1 })),
      ...plan.planks.map((plank) => ({ ...plank, room: 2 })),
      ...plan.towers.map((tower) => ({
        ...tower,
        room: Math.hypot(tower.size, tower.depth) / 2,
      })),
      ...plan.grass.map((tuft) => ({ ...tuft, room: 0.5 })),
      ...plan.rocks.map((rock) => ({ ...rock, room: rock.size * 1.2 })),
      ...plan.vents.map((vent) => ({ ...vent, room: 2.2 * vent.size })),
      ...(plan.fort ? [{ ...plan.fort, room: plan.fort.size * Math.SQRT2 + 5 }] : []),
      ...(plan.ring ? [{ ...plan.ring, room: plan.ring.size }] : []),
      ...(plan.dome ? [{ ...plan.dome, room: plan.dome.size }] : []),
    ]
    expect(things.length).toBeGreaterThan(10)
    for (const thing of things) {
      expect(roadClearance(road, thing.x, thing.z)).toBeGreaterThan(thing.room + 1)
    }
    expect(localPlan(track, 1)).toEqual({ ...plan, fits: expect.any(Function) })
    const low = localPlan(track, 0)!
    const countOf = (one: typeof plan) =>
      one.pools.length + one.towers.length + one.grass.length + one.rocks.length
    if (countOf(plan) > 0) expect(countOf(low)).toBeLessThan(countOf(plan))
  })
})

describe('the four tracks’ landmarks', () => {
  it('none for any other track', () => {
    expect(localPlan(raceTrack('riverside')!, 1)).toBeNull()
    expect(localPlan(raceTrack('guanyin')!, 1)).toBeNull()
  })

  it('the fort stands on the hilltop, and no shared tree grows inside it', () => {
    const track = raceTrack('fort')!
    const plan = localPlan(track, 1)!
    const fort = plan.fort!
    expect(fort.size).toBe(FORT_HALF)
    const top = Math.max(...track.road.map((point) => point.y ?? 0))
    const near = track.road[nearestRoadPoint(track.road, fort.x, fort.z)]!
    expect(near.y ?? 0).toBeGreaterThanOrEqual(top - 6)
    // Straight ahead of the jump: the crest straight looks at it
    const lip = track.road[track.jumps![0]!]!
    const way = roadDirection(track.road, track.jumps![0]!)
    const to = { x: fort.x - lip.x, z: fort.z - lip.z }
    expect((to.x * way.dx + to.z * way.dz) / Math.hypot(to.x, to.z)).toBeGreaterThan(0.99)
    expect(plan.fits(fort.x, fort.z)).toBe(false)
    expect(plan.fits(fort.x + FORT_HALF + 12, fort.z)).toBe(true)
  })

  it('the ring of light is inside the roundabout, off the road', () => {
    const track = raceTrack('danhai')!
    const ring = localPlan(track, 1)!.ring!
    // In the middle of the circle the wide road turns about
    for (const point of track.road.filter((one) => one.width >= 82)) {
      expect(Math.hypot(point.x - ring.x, point.z - ring.z)).toBeCloseTo(ROUNDABOUT_RADIUS, 0)
    }
  })

  it('the weather dome is on the ridge, and the mangroves ring their pools', () => {
    const ridge = raceTrack('datun')!
    const dome = localPlan(ridge, 1)!.dome!
    const top = Math.max(...ridge.road.map((point) => point.y ?? 0))
    expect(ridge.road[nearestRoadPoint(ridge.road, dome.x, dome.z)]!.y).toBeGreaterThanOrEqual(
      top - 3,
    )
    const flats = localPlan(raceTrack('mangrove')!, 1)!
    expect(flats.pools.length).toBeGreaterThanOrEqual(8)
    expect(flats.planks.length).toBeGreaterThanOrEqual(20)
    for (const clump of flats.clumps) {
      const nearest = Math.min(
        ...flats.pools.map((pool) => Math.hypot(pool.x - clump.x, pool.z - clump.z) / pool.size),
      )
      expect(nearest).toBeLessThan(1.3)
    }
  })
})

describe('the night circuit’s roundabout', () => {
  const track = raceTrack('danhai')!
  const { road, walls } = track
  const wide = road.flatMap((point, index) => (point.width >= 82 ? [index] : []))
  const middle = wide[Math.floor(wide.length / 2)]!
  /** Metres right of the middle of the road at road point `index` */
  const across = (index: number, x: number, z: number) => {
    const { dx, dz } = roadDirection(road, index)
    return (x - road[index]!.x) * -dz + (z - road[index]!.z) * dx
  }

  it('has an island: a closed loop of walls, with a lane a kart fits through on either side', () => {
    expect(wide.length).toBeGreaterThan(20)
    expect(walls.length).toBeGreaterThan(wide.length * 2)
    walls.forEach((wall, index) => {
      const next = walls[(index + 1) % walls.length]!
      expect([next.ax, next.az]).toEqual([wall.bx, wall.bz])
    })
    for (const wall of walls) {
      const at = nearestRoadPoint(road, wall.ax, wall.az)
      const offset = across(at, wall.ax, wall.az)
      const half = road[at]!.width / 2
      // Inside (the right, the way the road turns): the shortcut, 20 m or more; outside: the rest
      expect(half - offset).toBeGreaterThanOrEqual(20)
      expect(offset + half).toBeGreaterThanOrEqual(34)
    }
  })

  it('the hard computer kart takes the short way round, the others the long way', () => {
    const plain = courseOf(track)
    const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road }
    const lane = (level: (typeof DIFFICULTIES)[number]) => {
      const skill = BOT_SKILLS[level]
      const brain = createBotBrain(skill, road, KART_TUNING, 7, track.jumps, walls)
      let trial = startTrial(course)
      const seen: number[] = []
      for (let step = 0; trial.phase !== 'finished' && step < 60 * 60; step++) {
        trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
        const { x, z } = trial.run.kart
        if (nearestRoadPoint(road, x, z) === middle) seen.push(across(middle, x, z))
      }
      expect(seen.length).toBeGreaterThan(0)
      return seen[0]!
    }
    // Inside the island (to its right) or outside it
    expect(lane('hard')).toBeGreaterThan(ISLAND_OUTER + KART_RADIUS)
    expect(lane('normal')).toBeLessThan(ISLAND_INNER - KART_RADIUS)
    expect(lane('easy')).toBeLessThan(ISLAND_INNER - KART_RADIUS)
  })

  it('the short way is short: well under half the long way round', () => {
    // Half a circle each: the lanes' middles are their radii
    const half = ROUNDABOUT_WIDTH / 2
    const inner = ROUNDABOUT_RADIUS - (ISLAND_OUTER + half) / 2
    const outer = ROUNDABOUT_RADIUS - (ISLAND_INNER - half) / 2
    expect(inner / outer).toBeLessThan(0.42)
    expect((outer - inner) * Math.PI).toBeGreaterThan(120)
  })
})
