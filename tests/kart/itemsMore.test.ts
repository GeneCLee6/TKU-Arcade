// 2026-11-20 (docs/ARCHITECTURE.md §4.45): the six items of the second round in the browser: what
// they do to a kart (static, fog, the lifts), how they look and sound (hitFx.ts, itemSounds.ts), how
// a replay shows a mirror and a bubble that stops two, and when a computer kart uses each, the
// expert's included. The room's side is tests/games/kart-items-more.test.ts.
import { describe, expect, it } from 'vitest'
import type { KartItemEvent, KartState as RoomState } from '../../shared/games/kart/types.ts'
import { startRun } from '../../shared/kart/course.ts'
import {
  boostKart,
  FOG_TOP_SPEED,
  fogStep,
  jamStep,
} from '../../shared/kart/itemEffects.ts'
import { ITEM_IDS, ITEM_TUNING } from '../../shared/kart/items.ts'
import { INITIAL_KART, KART_TUNING, NO_INPUT, stepKart } from '../../shared/kart/physics.ts'
import { mirrorsAt, shieldsAt, type ReplayEvent } from '../../shared/kart/replay.ts'
import { SHOT_ITEMS, SHOT_TUNING } from '../../shared/kart/shots.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { courseOf } from '../../shared/kart/track.ts'
import { botSeats, createBotRace } from '../../src/kart/bots/botRace.ts'
import { createItemRider } from '../../src/kart/bots/effects.ts'
import { createLocalRoom } from '../../src/kart/bots/localRoom.ts'
import { drawBots } from '../../src/kart/bots/roster.ts'
import { EXPERT_SKILL } from '../../src/kart/bots/expert.ts'
import { IDLE_USE_MS, wantsToUse, type ItemSituation } from '../../src/kart/bots/itemSense.ts'
import { BOT_SKILLS } from '../../src/kart/bots/skill.ts'
import { cuesOf, effectsOf, hitFrameOf, type FxEvent } from '../../src/kart/hitFx.ts'
import { CUE_SOUNDS, cueSeconds, USE_SOUNDS } from '../../src/kart/itemSounds.ts'
import { watchCuesOf } from '../../src/kart/watchSounds.ts'

const fx = (event: Partial<FxEvent>): FxEvent => ({
  item: 'boost',
  by: 0,
  targets: [],
  blocked: [],
  at: 1_000,
  ...event,
})

describe('what the new items do to a kart', () => {
  it('static: the burning boost is cut and no charge can be fired, but the charges are kept', () => {
    const boosting = { ...INITIAL_KART, boostSeconds: 2, stackSeconds: 1, storedBoosts: 2 }
    const jammed = jamStep(boosting)
    expect(jammed).toMatchObject({ boostSeconds: 0, stackSeconds: 0, storedBoosts: 2, boostHeld: true })
    // A press now is not a fresh press: nothing fires
    const pressed = stepKart(jammed, { ...NO_INPUT, throttle: true, boost: true }, KART_TUNING)
    expect(pressed.storedBoosts).toBe(2)
    expect(pressed.boostSeconds).toBe(0)
    // Once the static is over, a fresh press fires one
    const released = stepKart(pressed, { ...NO_INPUT, throttle: true, boost: false }, KART_TUNING)
    const fired = stepKart(released, { ...NO_INPUT, throttle: true, boost: true }, KART_TUNING)
    expect(fired.storedBoosts).toBe(1)
  })

  it('fog: held back towards the fog’s top speed, but a boost still pushes through', () => {
    const fast = { ...INITIAL_KART, vz: -KART_TUNING.topSpeed }
    let kart = fast
    for (let i = 0; i < 60; i++) kart = fogStep(kart, 1 / 60)
    expect(Math.hypot(kart.vx, kart.vz)).toBeLessThan(KART_TUNING.topSpeed)
    expect(Math.hypot(kart.vx, kart.vz)).toBeGreaterThanOrEqual(FOG_TOP_SPEED - 1e-6)
    expect(fogStep({ ...fast, boostSeconds: 1 }, 1 / 60)).toEqual({ ...fast, boostSeconds: 1 })
  })

  it('a boost for as long as the event says', () => {
    expect(boostKart(INITIAL_KART, 3).boostSeconds).toBe(3)
    expect(boostKart(INITIAL_KART).boostSeconds).toBe(ITEM_TUNING.boostSeconds)
  })

  it('a computer kart’s rider applies them from the room’s events', () => {
    const track = raceTrack('riverside')!
    const rider = createItemRider(1, track)
    const run = startRun(courseOf(track))
    const event = (over: Partial<KartItemEvent>): KartItemEvent => ({
      n: 0,
      item: 'boost',
      by: 0,
      targets: [],
      blocked: [],
      at: 1_000,
      warps: [],
      hit: false,
      ...over,
    })
    const state = (events: KartItemEvent[]) => ({ events }) as unknown as RoomState
    // A team-mate's rally lifts it, for as long as the event says
    const lifted = rider.step(run, state([event({ item: 'rally', targets: [1], ms: 2_000 })]), 1_000, () => null)
    expect(lifted.kart.boostSeconds).toBe(2)
    // Static on it: the next steps cut any boost
    const jammed = rider.step(
      { ...lifted, kart: { ...lifted.kart, boostSeconds: 2 } },
      state([event({ n: 1, item: 'jam', targets: [1] })]),
      1_100,
      () => null,
    )
    expect(jammed.kart.boostSeconds).toBe(0)
    expect(rider.stunned(1_100)).toBe(false)
    // A bounced shot onto it stuns it
    rider.step(jammed, state([event({ n: 2, item: 'hail', by: 0, targets: [1], hit: true, bounced: true })]), 1_200, () => null)
    expect(rider.stunned(1_300)).toBe(true)
  })
})

describe('how the new items look and sound (hitFx.ts, itemSounds.ts)', () => {
  it('a mirror flashes where it turned the shot back, and the thrower spins', () => {
    const effects = effectsOf(fx({ item: 'hail', by: 2, targets: [1], hit: true, bounced: true }))
    expect(effects).toContainEqual({ kind: 'flash', look: 'bounce', seat: 2, at: 1_000 })
    expect(effects.find((one) => one.kind === 'spin')).toMatchObject({ seat: 1, item: 'hail' })
    // The mirror's racer hears it go back; the thrower hears the hit
    expect(cuesOf(fx({ item: 'hail', by: 2, targets: [1], hit: true, bounced: true }), 2)).toContainEqual({ kind: 'bounce' })
    expect(cuesOf(fx({ item: 'hail', by: 2, targets: [1], hit: true, bounced: true }), 1)).toContainEqual({ kind: 'hit' })
  })

  it('fog closes round a kart without a spin', () => {
    const event = fx({ item: 'fog', by: 0, targets: [3], hit: true })
    expect(effectsOf(event)).toEqual([{ kind: 'flash', look: 'fog', seat: 3, at: 1_000 }])
    expect(cuesOf(event, 3)).toEqual([{ kind: 'fogged' }])
    expect(cuesOf(event, 0)).toEqual([])
  })

  it('a skip splashes, a rally cheers the whole team, static crackles on its target', () => {
    expect(effectsOf(fx({ item: 'skip', by: 4 }))).toContainEqual({ kind: 'flash', look: 'splash', seat: 4, at: 1_000 })
    const rally = effectsOf(fx({ item: 'rally', by: 0, targets: [2, 4] }))
    expect(rally.map((one) => one.seat).sort()).toEqual([0, 2, 4])
    expect(cuesOf(fx({ item: 'rally', by: 0, targets: [2] }), 2)).toEqual([{ kind: 'use', item: 'rally' }])
    expect(effectsOf(fx({ item: 'jam', by: 1, targets: [0] }))).toContainEqual({ kind: 'flash', look: 'static', seat: 0, at: 1_000 })
    expect(cuesOf(fx({ item: 'jam', by: 1, targets: [0] }), 0)).toEqual([{ kind: 'jammed' }])
    // A bubble that stopped the static pops instead
    expect(cuesOf(fx({ item: 'jam', by: 1, targets: [0], blocked: [0] }), 0)).toEqual([{ kind: 'pop' }])
  })

  it('turns each flash into a burst of its own at its kart', () => {
    const effects = effectsOf(fx({ item: 'skip', by: 4 }))
    const frame = hitFrameOf(effects, effects, 1_000, () => ({ x: 3, z: 4 }))
    expect(frame.bursts).toEqual([{ kind: 'splash', x: 3, z: 4 }])
  })

  it('has a short sound of its own for every item and cue', () => {
    for (const item of ITEM_IDS) {
      expect(USE_SOUNDS[item].length, item).toBeGreaterThan(0)
      expect(cueSeconds({ kind: 'use', item }), item).toBeLessThan(1.2)
    }
    for (const kind of ['bounce', 'fogged', 'jammed'] as const) {
      expect(CUE_SOUNDS[kind].length).toBeGreaterThan(0)
      expect(cueSeconds({ kind })).toBeLessThan(1.2)
    }
  })

  it('lets a watcher hear a mirror and fog near the kart followed', () => {
    const where = () => ({ x: 0, z: 0 })
    expect(watchCuesOf(fx({ item: 'hail', by: 2, targets: [1], hit: true, bounced: true }), 2, where)).toContainEqual({
      cue: { kind: 'bounce' },
      volume: 1,
    })
    expect(watchCuesOf(fx({ item: 'fog', targets: [1], hit: true }), 1, where)).toEqual([
      { cue: { kind: 'fogged' }, volume: 1 },
    ])
  })
})

describe('a replay shows mirrors and a bubble that stops two (2026-11-20)', () => {
  const event = (over: Partial<ReplayEvent>): ReplayEvent => ({
    tick: 0,
    item: 'boost',
    by: 0,
    targets: [],
    blocked: [],
    ...over,
  })

  it('a mirror is up from its use until its time or until it sends a shot back', () => {
    const events = [
      event({ tick: 10, item: 'mirror', by: 1 }),
      event({ tick: 100, item: 'hail', by: 1, targets: [0], hit: true, bounced: true }),
    ]
    expect(mirrorsAt(events, 50, 480)).toEqual([1])
    expect(mirrorsAt(events, 120, 480)).toEqual([])
    expect(mirrorsAt([events[0]!], 600, 480)).toEqual([])
  })

  it('a bubble that stops two stays up after the first, and lasts as long as its event says', () => {
    const events = [
      event({ tick: 10, item: 'shield', by: 1, ms: 10_000 }),
      event({ tick: 60, item: 'jam', by: 0, targets: [1], blocked: [1], kept: [1] }),
      event({ tick: 90, item: 'jam', by: 0, targets: [1], blocked: [1] }),
    ]
    expect(shieldsAt(events, 70, 480)).toEqual([1])
    expect(shieldsAt(events, 100, 480)).toEqual([])
    // 10 s is 600 ticks, past the standard 480
    expect(shieldsAt([events[0]!], 550, 480)).toEqual([1])
  })
})

describe('when a computer kart uses the new items', () => {
  const base: ItemSituation = {
    item: 'mirror',
    heldMs: 5_000,
    waitMs: 1_000,
    ahead: null,
    aheadCount: 0,
    behind: null,
    straight: false,
    threatened: false,
  }
  const near = { distance: 80, angle: 0.02, sameLap: true }

  it('a mirror, like a bubble, at once against a threat', () => {
    expect(wantsToUse(true, { ...base, heldMs: 0, threatened: true })).toBe(true)
    expect(wantsToUse(true, base)).toBe(false)
    expect(wantsToUse(true, { ...base, heldMs: base.waitMs + IDLE_USE_MS })).toBe(true)
  })

  it('fog and static only with someone ahead; fog not on the nose of the kart in front', () => {
    expect(wantsToUse(true, { ...base, item: 'fog' })).toBe(false)
    expect(wantsToUse(true, { ...base, item: 'fog', ahead: near, aheadCount: 1 })).toBe(true)
    expect(wantsToUse(true, { ...base, item: 'fog', ahead: { ...near, distance: 10 }, aheadCount: 1 })).toBe(false)
    expect(wantsToUse(true, { ...base, item: 'jam' })).toBe(false)
    expect(wantsToUse(true, { ...base, item: 'jam', aheadCount: 3 })).toBe(true)
  })

  it('a skip and a rally on a straight, a skip at once to get out from under a threat, a fake box as a puddle', () => {
    for (const item of ['skip', 'rally'] as const) {
      expect(wantsToUse(true, { ...base, item })).toBe(false)
      expect(wantsToUse(true, { ...base, item, straight: true })).toBe(true)
    }
    expect(wantsToUse(true, { ...base, item: 'skip', heldMs: 0, threatened: true })).toBe(true)
    expect(wantsToUse(true, { ...base, item: 'decoy' })).toBe(false)
    expect(wantsToUse(true, { ...base, item: 'decoy', behind: 20 })).toBe(true)
  })

  it('the expert and the hard bot judge every item; the easy one uses all of them as they come', () => {
    expect(EXPERT_SKILL.itemSense).toBe(true)
    expect(BOT_SKILLS.hard.itemSense).toBe(true)
    for (const item of ITEM_IDS) {
      expect(typeof wantsToUse(true, { ...base, item })).toBe('boolean')
      expect(wantsToUse(false, { ...base, item })).toBe(true)
    }
  })

  it('has every shot it can meet on the road: the fog and the fake box are shots', () => {
    expect([...SHOT_ITEMS]).toEqual(['hail', 'cloud', 'puddle', 'fog', 'decoy'])
    expect(SHOT_TUNING.fogBlindMs).toBeLessThanOrEqual(2_000)
  })
})

describe('computer karts race with the new items (2026-11-20)', () => {
  it('experts in a team item race use them, and every one finishes', () => {
    let now = 1_000_000
    const id = 'oldstreet'
    const room = createLocalRoom({
      seats: 7,
      options: { track: id, laps: 3, mode: 'items', teams: 'teams' },
      seed: 11,
      now: () => now,
    })
    const race = createBotRace({
      room,
      track: raceTrack(id)!,
      laps: 3,
      bots: botSeats(drawBots(7, 11), 0, 'expert'),
      players: [],
      seed: 11,
      now,
    })
    const used = new Set<string>()
    let seen = 0
    for (let ms = 0; room.state().phase !== 'finished' && ms < 10 * 60_000; ms += 50) {
      now += 50
      race.advance(now)
      for (const event of room.state().events) {
        if (event.n < seen) continue
        seen = event.n + 1
        if (!event.hit) used.add(event.item)
      }
    }
    race.stop()
    const state = room.state()
    expect(state.phase).toBe('finished')
    for (const racer of state.racers) expect(racer.finishMs, String(racer.seat)).not.toBeNull()
    const fresh = ['mirror', 'fog', 'skip', 'jam', 'rally', 'decoy'].filter((item) => used.has(item))
    expect(fresh.length, [...used].join()).toBeGreaterThanOrEqual(4)
  }, 120_000)
})
