// #86: what someone watching hears of the item race, live and in a replay
import { describe, expect, it } from 'vitest'
import { DRAWN_BEHIND_MS, type FxEvent } from '../../src/kart/hitFx.ts'
import {
  createWatchEars,
  HEAR_FAR_M,
  HEAR_NEAR_M,
  hearing,
  QUIETEST,
  REPLAY_CUES_PER_FRAME,
  replayCues,
  watchCuesOf,
} from '../../src/kart/watchSounds.ts'

const event = (over: Partial<FxEvent> = {}): FxEvent => ({
  item: 'hail',
  by: 0,
  targets: [1],
  blocked: [],
  at: 1_000,
  hit: false,
  ...over,
})

/** Seat 0 at the origin, seat 1 60 m away, seat 2 far off */
const places: Record<number, { x: number; z: number }> = {
  0: { x: 0, z: 0 },
  1: { x: 0, z: 60 },
  2: { x: 0, z: 500 },
}
const where = (seat: number) => places[seat]

describe('how loud', () => {
  it('is full nearby, fades with distance, and is gone far off', () => {
    expect(hearing(0)).toBe(1)
    expect(hearing(HEAR_NEAR_M)).toBe(1)
    expect(hearing(HEAR_FAR_M)).toBe(0)
    expect(hearing(1_000)).toBe(0)
    expect(hearing(Number.NaN)).toBe(0)
    let last = 1
    for (let d = HEAR_NEAR_M; d <= HEAR_FAR_M; d += 10) {
      expect(hearing(d)).toBeLessThanOrEqual(last)
      last = hearing(d)
    }
  })
})

describe('what a watcher hears of one event', () => {
  it('the followed kart’s own at full volume, others softer with distance', () => {
    expect(watchCuesOf(event({ by: 0 }), 0, where)).toEqual([
      { cue: { kind: 'use', item: 'hail' }, volume: 1 },
    ])
    const near = watchCuesOf(event({ by: 1 }), 0, where)
    expect(near).toHaveLength(1)
    expect(near[0]!.volume).toBeCloseTo(hearing(60))
    expect(near[0]!.volume).toBeGreaterThan(QUIETEST)
    expect(watchCuesOf(event({ by: 2 }), 0, where)).toEqual([])
  })

  it('a hit where the kart is hit, a pop for a bubble, and the thrower’s ding', () => {
    const struck = event({ hit: true, by: 0, targets: [1] })
    expect(watchCuesOf(struck, 1, where)).toEqual([{ cue: { kind: 'hit' }, volume: 1 }])
    expect(watchCuesOf(struck, 0, where).map((one) => one.cue.kind)).toEqual(['hit', 'landed'])
    const popped = event({ hit: true, by: 0, targets: [1], blocked: [1] })
    expect(watchCuesOf(popped, 1, where)).toEqual([{ cue: { kind: 'pop' }, volume: 1 }])
    const headwind = event({ item: 'headwind', by: 2, targets: [0, 1], blocked: [0] })
    expect(watchCuesOf(headwind, 0, where)).toEqual([{ cue: { kind: 'pop' }, volume: 1 }])
  })

  it('nothing while following nobody, nor from a kart not drawn', () => {
    expect(watchCuesOf(event(), null, where)).toEqual([])
    expect(watchCuesOf(event({ by: 5 }), 0, where)).toEqual([])
  })
})

describe('a live watcher', () => {
  it('hears each event once, when its kart is drawn there', () => {
    const ears = createWatchEars(1)
    const events = [
      { ...event({ at: 900, by: 0 }), n: 0 },
      { ...event({ at: 1_000, by: 0 }), n: 1 },
    ]
    expect(ears.read(events, 1_040, 0, where)).toEqual([])
    expect(ears.read(events, 1_040 + DRAWN_BEHIND_MS, 0, where)).toHaveLength(1)
    expect(ears.read(events, 2_000, 0, where)).toEqual([])
  })
})

describe('a replay', () => {
  const events = [
    event({ at: 1_000, by: 0 }),
    event({ at: 1_010, by: 1 }),
    event({ at: 1_020, by: 1, item: 'cloud', targets: [2] }),
    event({ at: 1_030, by: 1, hit: true, targets: [1], item: 'puddle' }),
    event({ at: 5_000, by: 0 }),
  ]

  it('sounds what it plays through, once', () => {
    expect(replayCues(events, 990, 1_005, 1, 0, where)).toHaveLength(1)
    expect(replayCues(events, 1_005, 1_006, 1, 0, where)).toEqual([])
    expect(replayCues(events, 4_990, 5_000, 1, 0, where)).toHaveLength(1)
  })

  it('is quiet when dragged or jumped, paused, or played backwards', () => {
    expect(replayCues(events, null, 5_000, 1, 0, where)).toEqual([])
    expect(replayCues(events, 1_005, 1_005, 1, 0, where)).toEqual([])
    expect(replayCues(events, 5_000, 900, 1, 0, where)).toEqual([])
  })

  it('a few at most a frame, loudest first', () => {
    const many = Array.from({ length: 10 }, (_, i) => event({ at: 1_000 + i, by: i % 2 }))
    const heard = replayCues(many, 990, 1_100, 2, 0, where)
    expect(heard).toHaveLength(REPLAY_CUES_PER_FRAME)
    expect(heard.every((one) => one.volume === 1)).toBe(true)
  })

  it('at the fastest speed only what touches the followed kart', () => {
    expect(replayCues(events, 990, 1_040, 4, 2, where)).toEqual([])
    const followed = replayCues(events, 990, 1_040, 4, 1, where)
    expect(followed.map((one) => one.cue.kind).sort()).toEqual(['hit', 'use', 'use'])
  })
})
