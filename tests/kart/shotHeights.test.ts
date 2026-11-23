import { describe, expect, it } from 'vitest'
import {
  clearOfObstacles,
  obstacleAtHeight,
  obstacleStop,
  placeObstacle,
  SLIDER_HEIGHT,
  type SliderJson,
} from '../../shared/kart/obstacles.ts'
import {
  dropDecoy,
  dropPuddle,
  foreseeHit,
  heightsMeet,
  isShot,
  layFog,
  SHOT_HEIGHTS,
  SHOT_TUNING,
  shotHeight,
  shotHits,
  throwHail,
  type Thrower,
} from '../../shared/kart/shots.ts'
import { shotsAt } from '../../shared/kart/replayShots.ts'
import { courseOf, type RoadPoint } from '../../shared/kart/track.ts'
import { groundAt } from '../../shared/kart/terrain.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.87): the items by height. At the Zhuwei Flyover's crossing a
// puddle, a fake box or a hailstone on one road leaves a kart on the other be; a kart in the air
// passes over a puddle; a hailstone flies over a container below it and under the viaduct's kerbs.
// A shot without a height (a flat track, from before) is judged on the plan as it always was

const track = raceTrack('zhuwei')!
const terrain = courseOf(track).terrain!
const crossing = track.crossings![0]!
const AT = 50_000

/** The heading along road segment `index` (from point index to index + 1) */
function along(road: readonly RoadPoint[], index: number) {
  const a = road[index]!
  const b = road[(index + 1) % road.length]!
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const dx = (b.x - a.x) / length
  const dz = (b.z - a.z) / length
  return { dx, dz, heading: Math.atan2(dx, -dz) }
}

/** A kart `back` metres before the crossing on road segment `index`, at height `y`, standing */
function before(index: number, back: number, y: number): Thrower {
  const { dx, dz, heading } = along(track.road, index)
  return { seat: 0, x: crossing.x - dx * back, z: crossing.z - dz * back, heading, vx: 0, vz: 0, y }
}

const standing = (x: number, z: number, y: number | undefined, from: number, to: number) => ({
  from: { x, z, at: from, ...(y !== undefined ? { y } : {}) },
  to: { x, z, at: to, ...(y !== undefined ? { y } : {}) },
})

describe('the crossing: two roads, one over the other', () => {
  it('is a viaduct well over a body height above the underpass', () => {
    expect(crossing.upperY - crossing.lowerY).toBeGreaterThan(2 * SHOT_HEIGHTS.reach)
  })
})

describe('a puddle or a fake box at the crossing', () => {
  // Dropped 3.6 m behind a kart standing just past the crossing: it lies at the crossing
  const past = (index: number, y: number) => before(index, -SHOT_TUNING.puddleBehind, y)

  it('lies on the road it was dropped on', () => {
    const upper = dropPuddle(1, past(crossing.upper, crossing.upperY), AT, undefined, undefined, terrain)
    const lower = dropPuddle(2, past(crossing.lower, crossing.lowerY), AT, undefined, undefined, terrain)
    expect(upper.y).toBeCloseTo(crossing.upperY, 0)
    expect(lower.y).toBeCloseTo(crossing.lowerY, 0)
    expect(Math.hypot(upper.x - crossing.x, upper.z - crossing.z)).toBeLessThan(0.5)
    expect(Math.hypot(lower.x - crossing.x, lower.z - crossing.z)).toBeLessThan(0.5)
  })

  it('leaves a kart on the other road be, and gets one on its own', () => {
    for (const [index, mine, other] of [
      [crossing.upper, crossing.upperY, crossing.lowerY],
      [crossing.lower, crossing.lowerY, crossing.upperY],
    ] as const) {
      for (const shot of [
        dropPuddle(1, past(index, mine), AT, undefined, undefined, terrain),
        dropDecoy(2, past(index, mine), AT, undefined, terrain),
      ]) {
        const own = standing(shot.x, shot.z, mine, AT + 1000, AT + 1050)
        const away = standing(shot.x, shot.z, other, AT + 1000, AT + 1050)
        expect(shotHits(shot, 3, own.from, own.to, 0, terrain), `${shot.item} on its road`).toBe(true)
        expect(shotHits(shot, 3, away.from, away.to, 0, terrain), `${shot.item} under or over`).toBe(false)
      }
    }
  })

  it('a kart in the air passes over it, one low over it does not', () => {
    const shot = dropPuddle(1, past(crossing.lower, crossing.lowerY), AT, undefined, undefined, terrain)
    const high = standing(shot.x, shot.z, shot.y! + SHOT_HEIGHTS.reach + 0.5, AT + 1000, AT + 1050)
    const low = standing(shot.x, shot.z, shot.y! + SHOT_HEIGHTS.reach - 0.5, AT + 1000, AT + 1050)
    expect(shotHits(shot, 3, high.from, high.to)).toBe(false)
    expect(shotHits(shot, 3, low.from, low.to)).toBe(true)
  })

  it('without heights (a flat track, a race from before) is judged on the plan as before', () => {
    const flat = dropPuddle(1, past(crossing.upper, crossing.upperY), AT)
    expect(flat.y).toBeUndefined()
    const away = standing(flat.x, flat.z, crossing.lowerY, AT + 1000, AT + 1050)
    expect(shotHits(flat, 3, away.from, away.to, 0, terrain)).toBe(true)
    // A kart without a height against a shot with one: the plan as well
    const upper = dropPuddle(1, past(crossing.upper, crossing.upperY), AT, undefined, undefined, terrain)
    const plain = standing(upper.x, upper.z, undefined, AT + 1000, AT + 1050)
    expect(shotHits(upper, 3, plain.from, plain.to, 0, terrain)).toBe(true)
  })
})

describe('a hailstone through the crossing', () => {
  it('flies along the underpass, under the viaduct and its kerbs', () => {
    const thrower = before(crossing.lower, 30, crossing.lowerY)
    const shot = throwHail(1, thrower, AT, courseOf(track).walls, undefined, terrain)
    expect(shot.y).toBeCloseTo(crossing.lowerY, 5)
    const speed = Math.hypot(shot.vx, shot.vz)
    // Past the crossing: the viaduct's kerbs over it did not stop it
    expect(((shot.until - AT) / 1000) * speed).toBeGreaterThan(30 + 10)
    // At the crossing it is on the underpass
    const there = AT + ((30 - SHOT_TUNING.hailLead) / speed) * 1000
    expect(shotHeight(shot, there, terrain)).toBeCloseTo(crossing.lowerY, 0)
  })

  it('hits a kart on its own road there, and passes one on the viaduct over it', () => {
    const shot = throwHail(1, before(crossing.lower, 30, crossing.lowerY), AT, [], undefined, terrain)
    const under = standing(crossing.x, crossing.z, crossing.lowerY, AT, AT + 800)
    const over = standing(crossing.x, crossing.z, crossing.upperY, AT, AT + 800)
    expect(shotHits(shot, 3, under.from, under.to, 0, terrain)).toBe(true)
    expect(shotHits(shot, 3, over.from, over.to, 0, terrain)).toBe(false)
    // The browser foresees the same
    expect(foreseeHit([shot], 3, over.from, over.to, 0, new Set(), terrain)).toBeNull()
    expect(foreseeHit([shot], 3, under.from, under.to, 0, new Set(), terrain)?.n).toBe(1)
  })

  it('on the viaduct stays on the viaduct', () => {
    const shot = throwHail(1, before(crossing.upper, 30, crossing.upperY), AT, [], undefined, terrain)
    const speed = Math.hypot(shot.vx, shot.vz)
    const there = AT + ((30 - SHOT_TUNING.hailLead) / speed) * 1000
    expect(shotHeight(shot, there, terrain)).toBeCloseTo(crossing.upperY, 0)
    const under = standing(crossing.x, crossing.z, crossing.lowerY, AT, AT + 800)
    expect(shotHits(shot, 3, under.from, under.to, 0, terrain)).toBe(false)
  })

  it('thrown in the air, falls to the road under it', () => {
    const { y: _, ...thrower } = before(crossing.upper, 120, 0)
    // Without a height of its own: the road's under it
    const low = throwHail(1, thrower, AT, [], undefined, terrain)
    const road = low.y!
    const high = throwHail(1, { ...thrower, y: road + 3 }, AT, [], undefined, terrain)
    expect(shotHeight(high, AT, terrain)).toBeCloseTo(road + 3, 0)
    expect(shotHeight(high, AT + 200, terrain)!).toBeGreaterThan(shotHeight(low, AT + 200, terrain)! + 1)
    // Under gravity 30 m/s², 3 m takes under half a second
    expect(shotHeight(high, AT + 600, terrain)).toBeCloseTo(shotHeight(low, AT + 600, terrain)!, 5)
  })
})

describe('obstacles at a height', () => {
  // A straight road heading -z, its middle 4 m up (a viaduct); the container across it
  const ROAD: RoadPoint[] = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 0, z: -50 * i, width: 24, y: 4 }))
  const SLIDER: SliderJson = { kind: 'slider', at: 2, length: 6, size: 30, a: 0, b: 0, period: 360, shift: 0, move: 60, warn: 40 }
  const slider = placeObstacle(ROAD, SLIDER)

  it('a container stands from under its road to its top; a boom on its own road only', () => {
    expect(obstacleAtHeight(slider, 4)).toBe(true)
    expect(obstacleAtHeight(slider, 4 + SLIDER_HEIGHT + 0.1)).toBe(false)
    expect(obstacleAtHeight(slider, 4 - 9)).toBe(false)
  })

  it('stops a hailstone at its height, not one flying over it or on the road under it', () => {
    const flight = (height: number) => obstacleStop([slider], 0, 0, 0, -90, 0, 2, () => height)
    expect(flight(4)).not.toBeNull()
    expect(flight(4 + SLIDER_HEIGHT + 0.5)).toBeNull()
    expect(flight(-5)).toBeNull()
    // Without heights: as before, whatever the height
    expect(obstacleStop([slider], 0, 0, 0, -90, 0, 2)).not.toBeNull()
  })

  it('moves a puddle out of a container on its own road only', () => {
    expect(clearOfObstacles([slider], 0, -100, 1.6, 4)).not.toEqual({ x: 0, z: -100 })
    expect(clearOfObstacles([slider], 0, -100, 1.6, -5)).toEqual({ x: 0, z: -100 })
  })
})

describe('a fog bank', () => {
  it('lies on its target\'s road and fogs only karts near its height', () => {
    const target = { ...before(crossing.lower, 40, crossing.lowerY), speed: 0 }
    const shot = layFog(1, before(crossing.lower, 80, crossing.lowerY), target, AT, [], undefined, terrain)
    expect(shot.y).toBeCloseTo(groundAt(terrain, shot.x, shot.z, crossing.lowerY).y, 5)
    expect(Math.abs(shot.y! - crossing.lowerY)).toBeLessThan(Math.abs(shot.y! - crossing.upperY))
    expect(heightsMeet('fog', shot.y! + 3.5, shot.y!)).toBe(true)
    expect(heightsMeet('fog', shot.y! + 5, shot.y!)).toBe(false)
    expect(heightsMeet('fog', shot.y! - 2, shot.y!)).toBe(false)
  })
})

describe('kept and drawn', () => {
  it('a height is a number or absent', () => {
    const shot = dropPuddle(1, before(crossing.upper, 10, crossing.upperY), AT, undefined, undefined, terrain)
    expect(isShot(shot)).toBe(true)
    expect(isShot({ ...shot, y: Number.NaN })).toBe(false)
    expect(isShot({ ...shot, y: '4' })).toBe(false)
  })

  it("a replay draws a shot with a height at it, and an old one's without", () => {
    const upper = { ...dropPuddle(1, before(crossing.upper, -3.6, crossing.upperY), 0, undefined, undefined, terrain) }
    const old = { ...upper, n: 2, y: undefined }
    delete old.y
    const [withY, without] = shotsAt([upper, old], 30, () => null, terrain)
    expect(withY!.y).toBeCloseTo(crossing.upperY, 0)
    expect(without!.y).toBeUndefined()
  })
})
