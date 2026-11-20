// e9-t05, e9-t06a: the item race's pure parts: where the boxes are, the item frames, the draw, and
// what each item does to a kart in its own browser.
import { describe, expect, it } from 'vitest'
import { startRun } from '../../shared/kart/course.ts'
import {
  decodeItemFrame,
  drawItem,
  encodeItemFrame,
  HEADWIND_TOP_SPEED,
  ITEM_FRAME_BYTES,
  ITEM_IDS,
  ITEM_TABLE,
  itemBoxes,
  placeBucket,
  rollFor,
  TOW_TOP_SPEED,
} from '../../shared/kart/items.ts'
import { boostKart, headwindStep, towStep, warpRun } from '../../shared/kart/itemEffects.ts'
import { decodeFrame } from '../../shared/kart/net.ts'
import { INITIAL_KART, KART_TUNING } from '../../shared/kart/physics.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { courseOf } from '../../shared/kart/track.ts'

describe('item boxes (e9-t05)', () => {
  it('every race track has three rows of five, on the road and off the finish line', () => {
    for (const id of RACE_TRACK_IDS) {
      const track = raceTrack(id)!
      const boxes = itemBoxes(track)
      // N2's item track places its own (tests/kart/oldstreet.test.ts)
      expect(boxes).toHaveLength(track.itemBoxes.length > 0 ? track.itemBoxes.length : 15)
      const line = track.gates[0]!
      for (const box of boxes) {
        // Somewhere near the road's centre line (the road is at least 28 m wide)
        const nearest = Math.min(...track.road.map((p) => Math.hypot(p.x - box.x, p.z - box.z)))
        expect(nearest).toBeLessThan(40)
        const lineMid = { x: (line.ax + line.bx) / 2, z: (line.az + line.bz) / 2 }
        expect(Math.hypot(box.x - lineMid.x, box.z - lineMid.z)).toBeGreaterThan(5)
      }
    }
  })
})

describe('item frames', () => {
  it('round-trips a pickup and a use, small and apart from the kart frames', () => {
    const pickup = encodeItemFrame({ op: 'pickup', box: 7, tick: -12 })
    expect(pickup.byteLength).toBe(ITEM_FRAME_BYTES)
    expect(decodeItemFrame(pickup)).toEqual({ op: 'pickup', box: 7, tick: -12 })
    for (const item of ITEM_IDS) {
      expect(decodeItemFrame(encodeItemFrame({ op: 'use', item, tick: 900 }))).toEqual({
        op: 'use',
        item,
        tick: 900,
      })
    }
    expect(decodeFrame(pickup)).toBeNull()
  })

  it('reads nothing from junk', () => {
    expect(decodeItemFrame(new Uint8Array(3))).toBeNull()
    const bad = encodeItemFrame({ op: 'use', item: 'boost', tick: 1 })
    bad[2] = 99
    expect(decodeItemFrame(bad)).toBeNull()
    bad[1] = 9
    expect(decodeItemFrame(bad)).toBeNull()
  })
})

describe('the draw', () => {
  it('puts places into the front, middle and back', () => {
    expect(placeBucket(0, 1)).toBe('front')
    expect(placeBucket(0, 6)).toBe('front')
    expect(placeBucket(2, 6)).toBe('middle')
    expect(placeBucket(5, 6)).toBe('back')
    expect(placeBucket(1, 2)).toBe('back')
  })

  it('can give every item from some place, and follows the weights', () => {
    const given = new Set(Object.values(ITEM_TABLE).flatMap((row) => Object.keys(row)))
    expect([...given].sort()).toEqual([...ITEM_IDS].sort())
    const counts = new Map<string, number>()
    for (let n = 0; n < 4000; n++) {
      const item = drawItem('back', rollFor(42, n))
      counts.set(item, (counts.get(item) ?? 0) + 1)
    }
    // 2026-11-20: outside a team race the rally is never drawn (items.ts's TEAM_ONLY_ITEMS)
    const weights = Object.entries(ITEM_TABLE.back).filter(([item]) => item !== 'rally')
    expect(counts.get('rally')).toBeUndefined()
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
    for (const [item, weight] of weights) {
      expect((counts.get(item) ?? 0) / 4000).toBeCloseTo(weight / total, 1)
    }
  })

  it('rolls the same number for the same seed and count, in [0, 1)', () => {
    expect(rollFor(5, 3)).toBe(rollFor(5, 3))
    expect(rollFor(5, 3)).not.toBe(rollFor(5, 4))
    for (let n = 0; n < 200; n++) {
      const roll = rollFor(n * 7919, n)
      expect(roll).toBeGreaterThanOrEqual(0)
      expect(roll).toBeLessThan(1)
    }
  })
})

describe('what items do to a kart (e9-t06a)', () => {
  const moving = { ...INITIAL_KART, vz: -KART_TUNING.topSpeed }

  it('boost: the physics boost, never cut short', () => {
    expect(boostKart(moving).boostSeconds).toBeGreaterThan(2)
    expect(boostKart({ ...moving, boostSeconds: 9 }).boostSeconds).toBe(9)
  })

  it('headwind: boosts blown out, speed down to the headwind top within a second', () => {
    let kart = { ...moving, boostSeconds: 2, miniSeconds: 1 }
    for (let i = 0; i < 60; i++) kart = headwindStep(kart, 1 / 60)
    expect(kart.boostSeconds).toBe(0)
    expect(kart.miniSeconds).toBe(0)
    expect(Math.hypot(kart.vx, kart.vz)).toBeLessThanOrEqual(HEADWIND_TOP_SPEED + 1e-6)
    const slow = { ...INITIAL_KART, vz: -10 }
    expect(headwindStep(slow, 1 / 60)).toBe(slow)
  })

  it('tow: pulled towards the kart ahead, never past the tow top, not when on its tail', () => {
    let kart = moving
    for (let i = 0; i < 120; i++) kart = towStep(kart, { x: 0, z: -2000 }, 1 / 60)
    const speed = Math.hypot(kart.vx, kart.vz)
    expect(speed).toBeGreaterThan(KART_TUNING.topSpeed)
    expect(speed).toBeLessThanOrEqual(TOW_TOP_SPEED + 1e-6)
    expect(towStep(moving, { x: 1, z: -2 }, 1 / 60)).toBe(moving)
  })

  it('swap: put where the other was, its gates and heading, at its own speed, as a reset', () => {
    const track = raceTrack('riverside')!
    const run = { ...startRun(courseOf(track)), kart: moving }
    const warped = warpRun(
      run,
      { seat: 1, x: 10, z: 20, heading: Math.PI / 2, nextGate: 5, crossings: 1 },
      track,
    )
    expect(warped.kart).toMatchObject({ x: 10, z: 20, heading: Math.PI / 2 })
    expect(warped.kart.vx).toBeCloseTo(KART_TUNING.topSpeed)
    expect(warped.kart.vz).toBeCloseTo(0)
    expect(warped).toMatchObject({ nextGate: 5, crossings: 1, resets: run.resets + 1 })
    expect(warped.safe).toEqual(courseOf(track).checkpoints!.respawns[4])
  })
})
