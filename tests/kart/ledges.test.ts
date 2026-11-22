// 2026-11-23 (shared/kart/ledges.ts, docs/ARCHITECTURE.md §4.76): high platforms. The least speed
// off the lip is a closed form of the flight terrain.ts flies, and it is the speed that decides:
// a little faster and the kart flies over the face and lands on the platform; a little slower and it
// meets the face and comes down on the main road, never stuck there for good. The track format
// checks a platform as it checks a branch; the server judges a lap over a platform as it judges one
// down any branch; the hands that know the shortcuts go for a platform only when fast enough.
import { describe, expect, it } from 'vitest'
import { routeRoad } from '../../shared/kart/branches.ts'
import { startRun, stepRun, type Run } from '../../shared/kart/course.ts'
import {
  flightHeight,
  flightToFace,
  LEDGE_MIN_STEP,
  onPlatform,
  speedToClear,
  trackLedges,
} from '../../shared/kart/ledges.ts'
import { INITIAL_KART, KART_TUNING, type KartInput } from '../../shared/kart/physics.ts'
import { judgeFrame, startTracking, type JudgeContext, type Tracked } from '../../shared/kart/race.ts'
import { TERRAIN_TUNING } from '../../shared/kart/terrain.ts'
import { courseOf, parseTrack, type Track } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { ledgeChoice, LEDGE_COMMIT, LEDGE_MARGIN } from '../../src/kart/bots/routes.ts'
import { ledgeBranch, ledgeJson } from './ledgeTrack.ts'
import { driveFrames } from './raceDriver.ts'

const parsed = (json: unknown): Track => {
  const result = parseTrack(json)
  if ('problems' in result) throw new Error(result.problems.join('; '))
  return result.track
}
const problems = (json: unknown): string[] => {
  const result = parseTrack(json)
  return 'problems' in result ? result.problems : []
}

const track = parsed(ledgeJson())
const [ledge] = trackLedges(track)

const THROTTLE: KartInput = { throttle: true, brake: false, steer: 0, drift: false, boost: false }

/** A kart 20 m before the lip, straight at it at `speed`, held there for three seconds */
function flyAt(speed: number): Run[] {
  const course = courseOf(track)
  let run = startRun(course)
  const { lip } = ledge!
  run = {
    ...run,
    kart: {
      ...INITIAL_KART,
      x: lip.x - lip.dx * 20,
      z: lip.z - lip.dz * 20,
      heading: Math.atan2(lip.dx, -lip.dz),
      vx: lip.dx * speed,
      vz: lip.dz * speed,
    },
  }
  const runs: Run[] = []
  for (let step = 0; step < 180; step++) {
    run = stepRun(run, THROTTLE, course, KART_TUNING)
    runs.push(run)
  }
  return runs
}

describe('the flight', () => {
  it('the least speed is the one whose parabola is just at the top of the face', () => {
    for (const [rise, reach, cos] of [
      [0, 40, 1],
      [0.6, 36, 0.85],
      [-0.3, 50, 0.95],
    ] as const) {
      const need = speedToClear(rise, reach, cos)
      expect(flightHeight(need, reach, cos)).toBeCloseTo(rise, 6)
      expect(flightHeight(need + 1, reach, cos)).toBeGreaterThan(rise)
      expect(flightHeight(need - 1, reach, cos)).toBeLessThan(rise)
    }
    // Higher or further takes more; no speed reaches above the flight's peak
    expect(speedToClear(1, 40, 1)).toBeGreaterThan(speedToClear(0, 40, 1))
    expect(speedToClear(0, 50, 1)).toBeGreaterThan(speedToClear(0, 40, 1))
    expect(speedToClear(TERRAIN_TUNING.jumpLift * 40, 40, 1)).toBe(Infinity)
  })

  it('a platform knows its lip, its face and the speed it needs', () => {
    expect(ledge).toBeDefined()
    const fork = track.forks![0]!
    expect(fork.rise).toBeGreaterThan(1)
    expect(ledge!.top - (fork.path[fork.rise! - 1]!.y ?? 0)).toBeGreaterThanOrEqual(LEDGE_MIN_STEP)
    expect(ledge!.need).toBeCloseTo(speedToClear(ledge!.top - ledge!.lip.y, ledge!.reach, ledge!.cos), 6)
    // The face is a wall of the course, with a foot and a top
    expect(track.allWalls).toContainEqual(ledge!.face)
    expect(ledge!.face.base).toBeLessThan(0)
    // Kept when the track is written out and read again
    expect(problems(JSON.parse(JSON.stringify({ ...ledgeJson(), branches: track.branches })))).toEqual([])
    expect(track.branches![0]!.rise).toBe(ledgeBranch().rise)
  })

  it('a kart off the lip fast enough lands on the platform; one a little slower does not', () => {
    const need = ledge!.need
    const fast = flyAt(need + 4)
    expect(fast.some((run) => onPlatform(track, trackLedges(track), run.kart) === 0)).toBe(true)
    // Up there it rides the platform's height
    const up = fast.find((run) => onPlatform(track, trackLedges(track), run.kart) === 0 && !run.kart.air)!
    expect(up.kart.y).toBeCloseTo(ledge!.top, 1)
    const slow = flyAt(need - 6)
    expect(slow.every((run) => onPlatform(track, trackLedges(track), run.kart) < 0)).toBe(true)
    // ... and comes down on the road's own height in front of the face: no reset, no stranding up
    const last = slow[slow.length - 1]!
    expect(last.kart.y ?? 0).toBeLessThan(1)
    expect(last.resets).toBe(0)
  })

  it('says beforehand where a flight goes: onto it, short of it, past it', () => {
    const { lip, need } = ledge!
    const along = (speed: number, slant = 0) => {
      const c = Math.cos(slant)
      const s = Math.sin(slant)
      return flightToFace(ledge!, lip.x, lip.z, (lip.dx * c - lip.dz * s) * speed, (lip.dz * c + lip.dx * s) * speed)
    }
    expect(along(need + 3).outcome).toBe('on')
    expect(along(need - 3).outcome).toBe('short')
    expect(along(need + 3, 0.6).outcome).toBe('wide')
    expect(along(4).outcome).toBe('grounded')
  })
})

describe('the format', () => {
  it('refuses a platform that is not one: no lip, too low a face, a face on the road', () => {
    const branch = ledgeBranch()
    // Not from a lip of the main road
    expect(problems({ ...ledgeJson(branch), jumps: [] }).join()).toMatch(/jump lip/)
    // A face lower than a kart is tall
    const low = ledgeBranch({ faceAt: 50, top: 1.5, width: 12 })
    expect(problems(ledgeJson(low)).join()).toMatch(/steps up/)
    // A face on the main road
    const near = ledgeBranch({ faceAt: 20, top: 2.7, width: 12 })
    expect(problems(ledgeJson(near)).join()).toMatch(/on the main road/)
    // A rise that is not a point of the branch
    expect(problems(ledgeJson({ ...branch, rise: 999 })).join()).toMatch(/rise/)
  })

  it('a track without a platform has no face and no ledge', () => {
    for (const id of ['riverside', 'zhuwei', 'lanes'] as const) {
      expect(trackLedges(raceTrack(id)!)).toEqual([])
    }
  })
})

describe('the built-in platforms', () => {
  const lap = (road: readonly { x: number; z: number }[]) =>
    road.reduce((sum, a, index) => {
      const b = road[(index + 1) % road.length]!
      return sum + Math.hypot(b.x - a.x, b.z - a.z)
    }, 0)

  it.each([
    ['wharf', 1],
    ['works', 1],
    ['danhai', 1],
    ['breakwater', 3],
  ] as const)('%s: %i platform(s), each a real speed to reach and a real way shorter', (id, count) => {
    const one = raceTrack(id)!
    const ledges = trackLedges(one)
    expect(ledges).toHaveLength(count)
    const length = lap(one.road)
    for (const ledge of ledges) {
      // Beyond a lazy run, within a boost's reach
      expect(ledge.need).toBeGreaterThan(58)
      expect(ledge.need).toBeLessThan(KART_TUNING.topSpeed * KART_TUNING.boostTopSpeedFactor)
      const fork = one.forks![ledge.fork]!
      const main = lap(one.road.slice(fork.from, fork.to + 1)) - Math.hypot(
        one.road[fork.to]!.x - one.road[fork.from]!.x,
        one.road[fork.to]!.z - one.road[fork.from]!.z,
      )
      const own = lap(fork.path) - Math.hypot(
        fork.path[fork.path.length - 1]!.x - fork.path[0]!.x,
        fork.path[fork.path.length - 1]!.z - fork.path[0]!.z,
      )
      // At least 4% of a lap shorter
      expect((main - own) / length).toBeGreaterThan(0.04)
    }
  })

  it('the server judges a lap over the platforms as it judges one round the main road', () => {
    const one = raceTrack('breakwater')!
    const route = routeRoad(one, [0, 1, 2])
    const GO = 100_000
    const run = (road: readonly { x: number; z: number }[]) => {
      let tracked: Tracked = startTracking(one, 0)
      const laps: number[] = []
      const source = driveFrames(one, 0, 2.5, 0, road)
      for (let i = 0; i < 6000 && laps.length < 3; i++) {
        const frame = source.next().value!
        const now = GO + (frame.tick / 60) * 1000
        const context: JudgeContext = { track: one, slot: 0, now, goAt: GO, laps: laps.length }
        const verdict = judgeFrame(tracked, frame, context)
        expect(verdict.kind).toBe('taken')
        tracked = verdict.tracked
        if (verdict.kind === 'taken' && verdict.lapAt !== null) laps.push(verdict.lapAt)
      }
      return laps
    }
    for (const road of [one.road, route.road]) {
      const laps = run(road)
      expect(laps).toHaveLength(3)
      for (let at = 1; at < 3; at++) {
        expect((laps[at]! - laps[at - 1]!) / 1000).toBeCloseTo(lap(road) / 50, 0)
      }
    }
  })
})

describe('the hands', () => {
  const kart = (speed: number, extra: Partial<typeof INITIAL_KART> = {}) => ({
    ...INITIAL_KART,
    vx: 0,
    vz: -speed,
    ...extra,
  })

  it('go for a platform while fast enough or still gathering speed, and commit only with speed', () => {
    const need = ledge!.need
    expect(ledgeChoice(ledge!, kart(need + LEDGE_MARGIN + 1), 100).take).toBe(true)
    expect(ledgeChoice(ledge!, kart(need - 2), 100).take).toBe(true)
    expect(ledgeChoice(ledge!, kart(need - 20), 100).take).toBe(false)
    // At the commit, only with the margin
    expect(ledgeChoice(ledge!, kart(need - 2), LEDGE_COMMIT - 1).take).toBe(false)
    expect(ledgeChoice(ledge!, kart(need + LEDGE_MARGIN + 0.5), LEDGE_COMMIT - 1).take).toBe(true)
  })

  it('fire a charge for it when that is what it takes', () => {
    const need = ledge!.need
    const slow = ledgeChoice(ledge!, kart(need - 5, { storedBoosts: 1 }), 100)
    expect(slow).toEqual({ take: true, fire: true })
    // Not with nothing to fire, nor while a boost already runs
    expect(ledgeChoice(ledge!, kart(need - 5), 100).fire).toBe(false)
    expect(ledgeChoice(ledge!, kart(need - 5, { storedBoosts: 1, boostSeconds: 1 }), 100).fire).toBe(false)
  })
})
