import { describe, expect, it } from 'vitest'
import { SHOT_TUNING } from '../../shared/kart/shots.ts'
import { ITEM_IDS } from '../../shared/kart/items.ts'
import {
  createHitFeed,
  crossed,
  cuesOf,
  effectsOf,
  hitFrameOf,
  HOP_HEIGHT,
  OWN_KART,
  shakeAt,
  shakeOffset,
  SPIN_TURNS,
  spinPose,
  spinsAt,
  STILL_SPIN,
  type FxEvent,
} from '../../src/kart/hitFx.ts'
import { CUE_SOUNDS, cueSeconds, USE_SOUNDS, voicesOf } from '../../src/kart/itemSounds.ts'

// 2026-11-17: a hit's looks and sounds, derived from the room's item events alone

const hit = (over: Partial<FxEvent> = {}): FxEvent => ({
  item: 'hail',
  by: 0,
  targets: [1],
  blocked: [],
  at: 10_000,
  hit: true,
  ...over,
})

describe('the spin of a stunned kart', () => {
  it('is still before the stun and after it', () => {
    expect(spinPose(-1, 1000)).toEqual(STILL_SPIN)
    expect(spinPose(1000, 1000)).toEqual(STILL_SPIN)
    expect(spinPose(5000, 1000)).toEqual(STILL_SPIN)
    expect(spinPose(100, 0)).toEqual(STILL_SPIN)
  })

  it('turns fast at first, slows, and ends on whole turns, back on its heading', () => {
    const at = (ms: number) => spinPose(ms, 1000).yaw
    expect(at(0)).toBe(0)
    expect(at(100) - at(0)).toBeGreaterThan(at(900) - at(800))
    for (let ms = 50; ms < 1000; ms += 50) expect(at(ms)).toBeGreaterThan(at(ms - 50))
    expect(at(999)).toBeCloseTo(SPIN_TURNS * 2 * Math.PI, 3)
  })

  it('hops off the road, never below it, lower each time', () => {
    let highest = 0
    for (let ms = 0; ms < 1000; ms += 5) {
      const { lift } = spinPose(ms, 1000)
      expect(lift).toBeGreaterThanOrEqual(0)
      expect(lift).toBeLessThanOrEqual(HOP_HEIGHT)
      highest = Math.max(highest, lift)
    }
    expect(highest).toBeGreaterThan(HOP_HEIGHT / 2)
    // The peaks of the first and the last hop
    expect(spinPose(1000 / 6, 1000).lift).toBeGreaterThan(spinPose(5000 / 6, 1000).lift)
  })

  it('shakes the camera only during the stun, dying away', () => {
    expect(shakeOffset(-5, 1000)).toEqual({ x: 0, y: 0 })
    expect(shakeOffset(1000, 1000)).toEqual({ x: 0, y: 0 })
    const size = (ms: number) => {
      let most = 0
      for (let t = ms; t < ms + 100; t += 2) {
        const { x, y } = shakeOffset(t, 1000)
        most = Math.max(most, Math.hypot(x, y))
      }
      return most
    }
    expect(size(0)).toBeGreaterThan(size(800))
  })
})

describe('the effects of an event', () => {
  it('spins a kart hit by a shot for as long as it is stunned', () => {
    expect(effectsOf(hit({ item: 'cloud' }))).toEqual([
      { kind: 'spin', seat: 1, at: 10_000, ms: SHOT_TUNING.stunMs.cloud, item: 'cloud' },
    ])
  })

  it('pops the bubble that stopped a shot, or a headwind or a swap', () => {
    expect(effectsOf(hit({ blocked: [1] }))).toEqual([{ kind: 'pop', seat: 1, at: 10_000 }])
    expect(
      effectsOf({ item: 'headwind', by: 0, targets: [1, 2], blocked: [2], at: 5, hit: false }),
    ).toEqual([{ kind: 'pop', seat: 2, at: 5 }])
  })

  it('leaves nothing for a plain use, or a cloud still flying', () => {
    expect(effectsOf({ item: 'boost', by: 0, targets: [], blocked: [], at: 5 })).toEqual([])
    expect(effectsOf({ item: 'cloud', by: 0, targets: [1], blocked: [], at: 5 })).toEqual([])
  })
})

describe('the sounds of an event', () => {
  it('plays the item used for whoever used it, and nothing for a spectator', () => {
    const use: FxEvent = { item: 'swap', by: 2, targets: [1], blocked: [], at: 0 }
    expect(cuesOf(use, 2)).toEqual([{ kind: 'use', item: 'swap' }])
    expect(cuesOf(use, 1)).toEqual([])
    expect(cuesOf(use, null)).toEqual([])
  })

  it('a hit for the one hit, a ding for the thrower, a pop for a bubble', () => {
    expect(cuesOf(hit(), 1)).toEqual([{ kind: 'hit' }])
    expect(cuesOf(hit(), 0)).toEqual([{ kind: 'landed' }])
    expect(cuesOf(hit(), 3)).toEqual([])
    expect(cuesOf(hit({ blocked: [1] }), 1)).toEqual([{ kind: 'pop' }])
    expect(cuesOf(hit({ blocked: [1] }), 0)).toEqual([])
    // Into one's own puddle
    expect(cuesOf(hit({ item: 'puddle', by: 1 }), 1)).toEqual([{ kind: 'hit' }])
  })

  it('has a short sound for every item and every cue', () => {
    for (const item of ITEM_IDS) expect(USE_SOUNDS[item].length).toBeGreaterThan(0)
    for (const voices of Object.values(CUE_SOUNDS)) expect(voices.length).toBeGreaterThan(0)
    for (const item of ITEM_IDS) {
      const seconds = cueSeconds({ kind: 'use', item })
      expect(seconds).toBeGreaterThan(0)
      expect(seconds).toBeLessThan(1)
    }
    for (const voice of voicesOf({ kind: 'hit' })) {
      expect(voice.from).toBeGreaterThan(0)
      expect(voice.to).toBeGreaterThan(0)
      expect(voice.gain).toBeLessThanOrEqual(1)
    }
  })
})

describe('the hits showing at a moment', () => {
  const effects = [
    ...effectsOf(hit({ at: 1000 })),
    ...effectsOf(hit({ at: 1500, item: 'cloud', targets: [2] })),
  ]

  it('spins each kart hit until its stun is over', () => {
    expect([...spinsAt(effects, 900).keys()]).toEqual([])
    expect([...spinsAt(effects, 1600).keys()].sort()).toEqual([1, 2])
    expect([...spinsAt(effects, 1000 + SHOT_TUNING.stunMs.hail).keys()]).toEqual([2])
  })

  it('shakes only the camera of a kart spinning', () => {
    expect(shakeAt(effects, 1, 1100)).not.toEqual({ x: 0, y: 0 })
    expect(shakeAt(effects, 3, 1100)).toEqual({ x: 0, y: 0 })
  })

  it('bursts what began in between, for a replay playing through', () => {
    expect(crossed(effects, 900, 1000).map((one) => one.seat)).toEqual([1])
    expect(crossed(effects, 1000, 1499)).toEqual([])
    expect(crossed(effects, 1000, 1600).map((one) => one.seat)).toEqual([2])
  })

  it("puts this browser's kart under its own id, and bursts only where a kart is drawn", () => {
    const frame = hitFrameOf(effects, effects, 1600, (seat) =>
      seat === 1 ? { x: 5, z: 6 } : undefined,
    )
    expect([...frame.spins.keys()].sort()).toEqual([1, 2])
    expect(frame.bursts).toEqual([{ kind: 'star', x: 5, z: 6 }])
    expect(frame.shake).toEqual({ x: 0, y: 0 })
    const own = hitFrameOf(effects, [], 1600, () => null, 1)
    expect([...own.spins.keys()].sort()).toEqual([OWN_KART, 2].sort())
    expect(own.shake).not.toEqual({ x: 0, y: 0 })
  })
})

describe('a live feed of the room events', () => {
  it('reads each event once, from where it started, and forgets old effects', () => {
    const feed = createHitFeed(1, 1)
    const events = [
      { ...hit({ at: 0 }), n: 0 },
      { ...hit({ at: 1000 }), n: 1 },
    ]
    const first = feed.read(events, 1000)
    expect(first.effects.map((one) => one.at)).toEqual([1000])
    expect(first.cues).toEqual([{ kind: 'hit' }])
    expect(feed.read(events, 1100)).toEqual({ effects: [], cues: [] })
    expect(feed.effects).toHaveLength(1)
    feed.read(events, 1000 + SHOT_TUNING.stunMs.hail + 2000)
    expect(feed.effects).toHaveLength(0)
  })
})
