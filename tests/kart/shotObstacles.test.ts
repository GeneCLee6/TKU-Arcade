import { describe, expect, it } from 'vitest'
import {
  clearOfObstacles,
  obstaclesOf,
  obstacleStop,
  placeObstacle,
  sliderState,
  tickAtMs,
  type BoomJson,
  type SliderJson,
} from '../../shared/kart/obstacles.ts'
import { dropDecoy, dropPuddle, layFog, SHOT_TUNING, throwHail, type Thrower } from '../../shared/kart/shots.ts'
import type { RoadPoint } from '../../shared/kart/track.ts'
import { challengeTrack } from '../../shared/kart/tracks/challenge.ts'

// 2026-11-23 (#150): items against the moving obstacles. A hailstone stops at a boom that is down or a
// container in its way at that moment; a puddle or a fake box never lies inside one

/** A straight road heading -z: point 2 stands at (0, -100), its right is +x */
const ROAD: RoadPoint[] = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 0, z: -50 * i, width: 24 }))

const BOOM: BoomJson = { kind: 'boom', at: 2, from: -12, to: 12, period: 600, shift: 0, closed: 120, warn: 60 }
const SLIDER: SliderJson = {
  kind: 'slider',
  at: 2,
  length: 6,
  size: 6,
  a: -6,
  b: 6,
  period: 360,
  shift: 0,
  move: 60,
  warn: 40,
}
const boom = placeObstacle(ROAD, BOOM)
const slider = placeObstacle(ROAD, SLIDER)

/** A kart at the start of the road heading down it, standing still */
const KART: Thrower = { seat: 0, x: 0, z: 0, heading: 0, vx: 0, vz: 0 }
const flightMs = (until: number, at: number) => until - at
const hailMetres = (shot: { until: number; at: number; vx: number; vz: number }) =>
  (Math.hypot(shot.vx, shot.vz) * flightMs(shot.until, shot.at)) / 1000

describe('the race clock by the server clock', () => {
  it('steps of 1/60 s since GO', () => {
    expect(tickAtMs(10_000, 10_000)).toBe(0)
    expect(tickAtMs(10_000, 11_000)).toBe(60)
    expect(tickAtMs(10_000, 9_500)).toBe(-30)
  })
})

describe('a hailstone against the obstacles', () => {
  it('stops at a boom that is down as it gets there', () => {
    const shot = throwHail(1, KART, 0, [], { obstacles: [boom], tick: 0 })
    // Left 2.6 m ahead; the boom stands 100 m down the road
    expect(hailMetres(shot)).toBeCloseTo(100 - SHOT_TUNING.hailLead, 0)
  })

  it('flies on under a boom that is up, and with no obstacles its whole range', () => {
    const up = throwHail(1, KART, 0, [], { obstacles: [boom], tick: 200 })
    expect(hailMetres(up)).toBeCloseTo(SHOT_TUNING.hailRange, 0)
    const none = throwHail(1, KART, 0, [])
    expect(none.until).toBe(up.until)
  })

  it('by the boom at the moment it gets there, not as it leaves', () => {
    // Up as it is thrown (tick 590) but down from tick 600: it gets there about 70 steps later
    const closing = throwHail(1, KART, 0, [], { obstacles: [boom], tick: 590 })
    expect(hailMetres(closing)).toBeCloseTo(100 - SHOT_TUNING.hailLead, 0)
    // Down as it is thrown (tick 110) but up from tick 120: gone by the time it arrives
    const opening = throwHail(1, KART, 0, [], { obstacles: [boom], tick: 110 })
    expect(hailMetres(opening)).toBeCloseTo(SHOT_TUNING.hailRange, 0)
  })

  it('stops at a container in its way, flies past one held to the side', () => {
    // Held at a (-6): the box spans -9 to -3, clear of the middle the stone flies down
    expect(sliderState(SLIDER, 0).across).toBe(-6)
    const past = throwHail(1, KART, 0, [], { obstacles: [slider], tick: 0 })
    expect(hailMetres(past)).toBeCloseTo(SHOT_TUNING.hailRange, 0)
    // Thrown so it gets there (about 70 steps) as the box crosses the middle (tick 150)
    const blocked = throwHail(1, KART, 0, [], { obstacles: [slider], tick: 80 })
    expect(hailMetres(blocked)).toBeLessThan(100)
    expect(hailMetres(blocked)).toBeGreaterThan(90)
  })

  it('the same numbers every time: every browser draws the same flight', () => {
    const a = throwHail(7, KART, 1234, [], { obstacles: [boom, slider], tick: 80 })
    const b = throwHail(7, KART, 1234, [], { obstacles: [boom, slider], tick: 80 })
    expect(a).toEqual(b)
  })

  it('obstacleStop looks only as far as asked', () => {
    expect(obstacleStop([boom], 0, 0, 0, -84, 0, 1)).toBeNull()
    expect(obstacleStop([boom], 0, 0, 0, -84, 0, 2)).toBeCloseTo(100 / 84, 2)
    expect(obstacleStop([], 0, 0, 0, -84, 0, 2)).toBeNull()
  })
})

describe('a fog bank against the obstacles', () => {
  it('is laid short of a boom that is down', () => {
    const target = { x: 0, z: -80, heading: 0, speed: 50 }
    const open = layFog(1, KART, target, 0, [], { obstacles: [boom], tick: 200 })
    const shut = layFog(1, KART, target, 0, [], { obstacles: [boom], tick: 0 })
    expect(open.z).toBeLessThan(-100)
    expect(shut.z).toBeGreaterThan(-100 + SHOT_TUNING.fogRadius - 0.01)
  })
})

describe('a puddle or a fake box lies clear of every obstacle', () => {
  it('moved out of the whole stretch a container slides over, the shorter way', () => {
    // Dropped 3.6 m behind a kart at z -98.4: the puddle would land at z -94.8, inside the stretch
    const kart = { ...KART, z: -98.4 }
    const puddle = dropPuddle(1, kart, 0, { obstacles: [slider], tick: 0 })
    expect(puddle.x).toBe(0)
    // The stretch runs 3 m along either side of z -100; the puddle's 1.6 m must be out of it
    expect(Math.abs(puddle.z + 100)).toBeGreaterThanOrEqual(3 + SHOT_TUNING.puddleRadius)
    expect(puddle.z).toBeGreaterThan(-100)
    const decoy = dropDecoy(2, kart, 0, { obstacles: [slider], tick: 0 })
    expect(Math.abs(decoy.z + 100)).toBeGreaterThanOrEqual(3 + SHOT_TUNING.decoyRadius)
  })

  it('moved off a boom’s line, whether it is up or down', () => {
    const kart = { ...KART, z: -104 }
    const puddle = dropPuddle(1, kart, 0, { obstacles: [boom], tick: 300 })
    expect(Math.abs(puddle.z + 100)).toBeGreaterThanOrEqual(SHOT_TUNING.puddleRadius)
  })

  it('left where it fell when clear, and beside a container’s stretch', () => {
    const clear = dropPuddle(1, { ...KART, z: -60 }, 0, { obstacles: [boom, slider], tick: 0 })
    expect(clear).toEqual(dropPuddle(1, { ...KART, z: -60 }, 0))
    // Beside the box's stretch (it reaches 12 m right of the middle at most): untouched
    expect(clearOfObstacles([slider], 13, -100, 0.5)).toEqual({ x: 13, z: -100 })
  })

  it('on Lock Gate Lane, wherever it is dropped along the road', () => {
    const track = challengeTrack('ch-lock')
    const obstacles = obstaclesOf(track)
    expect(obstacles.length).toBeGreaterThan(0)
    for (let i = 0; i < track.road.length; i++) {
      const point = track.road[i]!
      for (const across of [-4, 0, 4]) {
        const spot = clearOfObstacles(obstacles, point.x + across, point.z, SHOT_TUNING.puddleRadius)
        // Already clear: asking again moves it no more
        expect(clearOfObstacles(obstacles, spot.x, spot.z, SHOT_TUNING.puddleRadius)).toEqual(spot)
      }
    }
  })
})
