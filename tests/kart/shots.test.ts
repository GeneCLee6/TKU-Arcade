// e9-t06b: the thrown and dropped items as pure numbers: how each shot is made, where it is as time
// goes on, what it hits and what it misses, and what a hit does to the kart.
import { describe, expect, it } from 'vitest'
import { stunStep, STUN_TOP_SPEED } from '../../shared/kart/itemEffects.ts'
import { ITEM_TABLE, TARGETED_ITEMS } from '../../shared/kart/items.ts'
import { INITIAL_KART, KART_TUNING } from '../../shared/kart/physics.ts'
import {
  closestApproach,
  dropPuddle,
  isShot,
  keepShots,
  rayToWall,
  sendCloud,
  SHOT_TUNING,
  shotHits,
  shotLive,
  shotPosition,
  throwHail,
  type KartShot,
} from '../../shared/kart/shots.ts'
import { KART_RADIUS } from '../../shared/kart/walls.ts'

const AT = 50_000
/** Seat 0 at the origin facing -z (heading 0), at the top speed */
const thrower = { seat: 0, x: 0, z: 0, heading: 0, vx: 0, vz: -KART_TUNING.topSpeed }
/** A wall straight across the way, 100 m ahead */
const wallAhead = [{ ax: -50, az: -100, bx: 50, bz: -100 }]

describe('rays and approaches', () => {
  it('finds the first wall along a ray, and none behind or to the side', () => {
    expect(rayToWall(wallAhead, 0, 0, 0, -1, 500)).toBeCloseTo(100)
    expect(rayToWall(wallAhead, 0, 0, 0, 1, 500)).toBe(500)
    expect(rayToWall(wallAhead, 0, 0, 1, 0, 500)).toBe(500)
    // Past its end
    expect(rayToWall(wallAhead, 80, 0, 0, -1, 500)).toBe(500)
  })

  it('finds how close two moving points come over a time', () => {
    // Head on, through each other
    expect(closestApproach(10, 0, -20, 0, 1)).toBeCloseTo(0)
    // Not long enough to get there
    expect(closestApproach(10, 0, -5, 0, 1)).toBeCloseTo(5)
    // Passing 3 m apart
    expect(closestApproach(10, 3, -20, 0, 1)).toBeCloseTo(3)
    // Moving apart: closest at the start
    expect(closestApproach(10, 0, 5, 0, 1)).toBeCloseTo(10)
    expect(closestApproach(4, 0, 0, 0, 1)).toBeCloseTo(4)
  })
})

describe('hailstone (e9-t06b)', () => {
  it('leaves just ahead of the thrower, straight on, faster than the thrower', () => {
    const hail = throwHail(3, thrower, AT, [])
    expect(isShot(hail)).toBe(true)
    expect(hail).toMatchObject({ n: 3, item: 'hail', by: 0, at: AT, target: null })
    expect(hail.z).toBeCloseTo(-SHOT_TUNING.hailLead)
    expect(hail.vx).toBeCloseTo(0)
    expect(-hail.vz).toBeCloseTo(SHOT_TUNING.hailSpeed + KART_TUNING.topSpeed)
    // Its full range when nothing is in the way
    const speed = -hail.vz
    expect(hail.until - hail.at).toBeCloseTo((SHOT_TUNING.hailRange / speed) * 1000, -1)
  })

  it('flies in a straight line and stops at the first wall', () => {
    const hail = throwHail(0, thrower, AT, wallAhead)
    const half = shotPosition(hail, (hail.at + hail.until) / 2)
    expect(half.x).toBeCloseTo(0)
    expect(half.z).toBeCloseTo((hail.z - 100) / 2, 0)
    // Gone at the wall, and drawn no further
    expect(shotPosition(hail, hail.until).z).toBeCloseTo(-100, 0)
    expect(shotPosition(hail, hail.until + 5000).z).toBeCloseTo(-100, 0)
    expect(shotLive(hail, hail.until + 1)).toBe(false)
    expect(shotLive(hail, hail.at - 1)).toBe(false)
  })

  it('hits a kart in its way, even one it passes between two frames', () => {
    const hail = throwHail(0, { ...thrower, vz: 0 }, AT, [])
    // A kart sitting 40 m ahead
    const sitting = { x: 0, z: -40 }
    expect(shotHits(hail, 1, { ...sitting, at: AT }, { ...sitting, at: AT + 500 })).toBe(true)
    // Only once the hail has got there: a frame before it arrives does not count
    expect(shotHits(hail, 1, { ...sitting, at: AT }, { ...sitting, at: AT + 100 })).toBe(false)
    // A kart crossing its line between two frames, never near it at either frame
    expect(
      shotHits(hail, 1, { x: -20, z: -40, at: AT + 420 }, { x: 20, z: -40, at: AT + 470 }),
    ).toBe(true)
  })

  it('misses a kart off its line, its own thrower, and anyone before or after its flight', () => {
    const hail = throwHail(0, { ...thrower, vz: 0 }, AT, [])
    const beside = { x: KART_RADIUS + SHOT_TUNING.hailRadius + 1, z: -40 }
    expect(shotHits(hail, 1, { ...beside, at: AT }, { ...beside, at: AT + 800 })).toBe(false)
    // Its own thrower, right in front of it
    expect(shotHits(hail, 0, { x: 0, z: -5, at: AT }, { x: 0, z: -5, at: AT + 100 })).toBe(false)
    // Through its line before it was thrown
    expect(shotHits(hail, 1, { x: -20, z: -3, at: AT - 200 }, { x: 20, z: -3, at: AT - 100 })).toBe(
      false,
    )
    // Through its line after it hit a wall
    const short = throwHail(0, { ...thrower, vz: 0 }, AT, wallAhead)
    expect(
      shotHits(
        short,
        1,
        { x: 0, z: -110, at: short.until + 10 },
        { x: 0, z: -110, at: short.until + 60 },
      ),
    ).toBe(false)
  })

  it('a kart that jumped (a reset) is judged only where it is now', () => {
    const hail = throwHail(0, { ...thrower, vz: 0 }, AT, [])
    const now = AT + 300
    const there = shotPosition(hail, now)
    expect(shotHits(hail, 1, null, { ...there, at: now })).toBe(true)
    expect(shotHits(hail, 1, null, { x: there.x, z: there.z - 30, at: now })).toBe(false)
  })
})

describe('mud puddle (e9-t06b)', () => {
  const puddle = dropPuddle(5, thrower, AT)

  it('lies behind the kart that dropped it, still, until it dries', () => {
    expect(puddle).toMatchObject({ n: 5, item: 'puddle', by: 0, vx: 0, vz: 0, target: null })
    expect(puddle.z).toBeCloseTo(SHOT_TUNING.puddleBehind)
    expect(puddle.until).toBe(AT + SHOT_TUNING.puddleMs)
    expect(shotPosition(puddle, AT + 5000)).toEqual({ x: puddle.x, z: puddle.z })
  })

  it('catches the kart behind that drives through it, not one that drives round it', () => {
    const through = shotHits(
      puddle,
      1,
      { x: 0, z: 30, at: AT + 1000 },
      { x: 0, z: -5, at: AT + 1600 },
    )
    expect(through).toBe(true)
    const round = shotHits(
      puddle,
      1,
      { x: 6, z: 30, at: AT + 1000 },
      { x: 6, z: -5, at: AT + 1600 },
    )
    expect(round).toBe(false)
  })

  it('is safe for its owner until armed, then catches it too', () => {
    const on = { x: puddle.x, z: puddle.z }
    expect(shotHits(puddle, 0, { ...on, at: AT }, { ...on, at: AT + 100 })).toBe(false)
    expect(shotHits(puddle, 1, { ...on, at: AT }, { ...on, at: AT + 100 })).toBe(true)
    const armed = AT + SHOT_TUNING.puddleArmMs
    expect(shotHits(puddle, 0, { ...on, at: armed }, { ...on, at: armed + 50 })).toBe(true)
  })

  it('is gone once dry', () => {
    const on = { x: puddle.x, z: puddle.z }
    const later = puddle.until + 100
    expect(shotHits(puddle, 1, { ...on, at: later }, { ...on, at: later + 50 })).toBe(false)
  })
})

describe('thundercloud (e9-t06b)', () => {
  it('flies longer the further its target, within its bounds', () => {
    const near = sendCloud(1, thrower, 2, 10, AT)
    const mid = sendCloud(1, thrower, 2, 190, AT)
    const far = sendCloud(1, thrower, 2, 5000, AT)
    expect(near.until - AT).toBe(SHOT_TUNING.cloudMinMs)
    expect(mid.until - AT).toBe(Math.round((190 / SHOT_TUNING.cloudSpeed) * 1000))
    expect(far.until - AT).toBe(SHOT_TUNING.cloudMaxMs)
    expect(mid).toMatchObject({ item: 'cloud', by: 0, target: 2 })
  })

  it('is drawn on its way to wherever its target is, arriving on time', () => {
    const cloud = sendCloud(1, thrower, 2, 190, AT)
    const target = { x: 30, z: -150 }
    const start = shotPosition(cloud, AT, target)
    expect(start.x).toBeCloseTo(0)
    const half = shotPosition(cloud, (AT + cloud.until) / 2, target)
    expect(half.z).toBeLessThan(0)
    expect(half.z).toBeGreaterThan(-150)
    expect(shotPosition(cloud, cloud.until, target)).toEqual(target)
    // Without its target in sight it waits where it left
    expect(shotPosition(cloud, cloud.until, null)).toEqual({ x: 0, z: 0 })
  })

  it('strikes its target alone, wherever it is, once it arrives', () => {
    const cloud = sendCloud(1, thrower, 2, 190, AT)
    const anywhere = { x: 500, z: 500 }
    expect(shotHits(cloud, 2, null, { ...anywhere, at: cloud.until - 1 })).toBe(false)
    expect(shotHits(cloud, 2, null, { ...anywhere, at: cloud.until })).toBe(true)
    expect(shotHits(cloud, 1, null, { ...anywhere, at: cloud.until })).toBe(false)
    expect(shotHits(cloud, 0, null, { ...anywhere, at: cloud.until })).toBe(false)
    // A target not heard from for too long is let off
    expect(
      shotHits(cloud, 2, null, { ...anywhere, at: cloud.until + SHOT_TUNING.graceMs + 1 }),
    ).toBe(false)
  })
})

describe('shots kept and a hit kart', () => {
  it('keeps shots until a little past their time, and at most so many', () => {
    const hail = throwHail(0, thrower, AT, wallAhead)
    expect(keepShots([hail], hail.until + SHOT_TUNING.graceMs)).toHaveLength(1)
    expect(keepShots([hail], hail.until + SHOT_TUNING.graceMs + 1)).toHaveLength(0)
    const many: KartShot[] = Array.from({ length: SHOT_TUNING.maxShots + 5 }, (_, n) =>
      dropPuddle(n, thrower, AT),
    )
    const kept = keepShots(many, AT)
    expect(kept).toHaveLength(SHOT_TUNING.maxShots)
    expect(kept.at(-1)!.n).toBe(SHOT_TUNING.maxShots + 4)
  })

  it('reads nothing that is not a shot', () => {
    expect(isShot(null)).toBe(false)
    expect(isShot({ ...dropPuddle(0, thrower, AT), item: 'rocket' })).toBe(false)
    expect(isShot({ ...dropPuddle(0, thrower, AT), x: Number.NaN })).toBe(false)
    expect(isShot({ ...dropPuddle(0, thrower, AT), target: 'x' })).toBe(false)
  })

  it('stuns: boosts lost, the speed brought down hard within half a second', () => {
    let kart = { ...INITIAL_KART, vz: -KART_TUNING.topSpeed, boostSeconds: 2, stackSeconds: 1 }
    for (let i = 0; i < 30; i++) kart = stunStep(kart, 1 / 60)
    expect(kart.boostSeconds).toBe(0)
    expect(kart.stackSeconds).toBe(0)
    expect(Math.hypot(kart.vx, kart.vz)).toBeLessThanOrEqual(STUN_TOP_SPEED + 1e-6)
    const slow = { ...INITIAL_KART, vz: -5 }
    expect(stunStep(slow, 1 / 60)).toBe(slow)
  })

  it('never gives the leader a shot that flies at someone ahead', () => {
    expect(ITEM_TABLE.front.hail ?? 0).toBe(0)
    expect(ITEM_TABLE.front.cloud ?? 0).toBe(0)
    expect(TARGETED_ITEMS.has('cloud')).toBe(true)
    // The back of the field gets the chasing cloud more often than the middle
    expect(ITEM_TABLE.back.cloud ?? 0).toBeGreaterThan(ITEM_TABLE.middle.cloud ?? 0)
  })
})
