import { describe, expect, it } from 'vitest'
import { kart as kartModule } from '../../shared/games/kart/rules.ts'
import {
  applyKart,
  BUDGET_STATS,
  DRIVER_IDS,
  KART_IDS,
  KART_STATS,
  kartMass,
  KARTS,
  loadoutByte,
  loadoutOfByte,
  lookOf,
  parseLook,
  STAT_MAX,
  STAT_MIN,
} from '../../shared/kart/karts.ts'
import { encodeFrame, type KartFrame } from '../../shared/kart/net.ts'
import { INITIAL_KART, KART_TUNING, NO_INPUT, stepKart } from '../../shared/kart/physics.ts'
import {
  bumpKart,
  judgeFrame,
  SPEED_CAP,
  speedCapFor,
  startTracking,
} from '../../shared/kart/race.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { TUNING_KEYS, validValue } from '../../shared/kart/tuning.ts'
import { LOOK_PATTERN, parseClientMessage } from '../../shared/protocol.ts'
import { driveFrames } from './raceDriver.ts'

/** The top speed a kart settles at, flat out on the throttle alone */
function flatOut(id: (typeof KART_IDS)[number]): number {
  const tuning = applyKart(KART_TUNING, id)
  let state = INITIAL_KART
  for (let step = 0; step < 900; step++) state = stepKart(state, { ...NO_INPUT, throttle: true }, tuning)
  return Math.hypot(state.vx, state.vz)
}

describe('the six karts and four drivers (e10-t05)', () => {
  it('has six karts, two of each tier, and four drivers', () => {
    expect(KARTS.map((one) => one.id)).toEqual([...KART_IDS])
    expect(KART_IDS).toHaveLength(6)
    expect(DRIVER_IDS).toHaveLength(4)
    for (const tier of ['entry', 'advanced', 'expert']) {
      expect(KARTS.filter((one) => one.tier === tier)).toHaveLength(2)
    }
  })

  it('makes every kart a trade-off: its points sum to zero, and none is best or worst at everything', () => {
    for (const { id, stats } of KARTS) {
      const sum = BUDGET_STATS.reduce((total, stat) => total + stats[stat], 0)
      expect(sum, id).toBe(0)
      for (const stat of KART_STATS) {
        expect(stats[stat], `${id} ${stat}`).toBeGreaterThanOrEqual(STAT_MIN)
        expect(stats[stat], `${id} ${stat}`).toBeLessThanOrEqual(STAT_MAX)
      }
    }
    // No two karts the same
    const shapes = new Set(KARTS.map(({ stats }) => KART_STATS.map((stat) => stats[stat]).join()))
    expect(shapes.size).toBe(KARTS.length)
  })

  it('keeps the gaps within the PRD: top speed ±5% (and 3% apart), drift charge and handling ±10%', () => {
    const tunings = KART_IDS.map((id) => applyKart(KART_TUNING, id))
    const ratio = (key: keyof typeof KART_TUNING) => tunings.map((one) => one[key] / KART_TUNING[key])
    for (const share of ratio('topSpeed')) expect(Math.abs(share - 1)).toBeLessThanOrEqual(0.05)
    for (const share of ratio('gaugeFillRate')) expect(Math.abs(share - 1)).toBeLessThanOrEqual(0.1 + 1e-9)
    for (const share of ratio('turnRate')) expect(Math.abs(share - 1)).toBeLessThanOrEqual(0.1)
    const tops = ratio('topSpeed')
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(0.03 + 1e-9)
    // Measured on the physics, not only read off the table
    const speeds = KART_IDS.map(flatOut)
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.035)
  })

  it('stays inside every range the tuning panel allows', () => {
    for (const id of KART_IDS) {
      const tuning = applyKart(KART_TUNING, id)
      for (const key of TUNING_KEYS) expect(validValue(key, tuning[key]), `${id} ${key}`).toBe(true)
    }
  })

  it('leaves the standard kart as the standard tuning', () => {
    expect(applyKart(KART_TUNING, 'tide')).toEqual(KART_TUNING)
    expect(kartMass('tide')).toBe(1)
  })

  it('puts the kart and driver in one byte and reads them back, unknown ones as the defaults', () => {
    for (const kart of KART_IDS) {
      for (const driver of DRIVER_IDS) {
        const byte = loadoutByte(kart, driver)
        expect(byte).toBeGreaterThanOrEqual(0)
        expect(byte).toBeLessThan(256)
        expect(loadoutOfByte(byte)).toEqual({ kart, driver })
      }
    }
    // A frame from before e10-t05 sent the body's index (0 to 2): the same kart, the first driver
    expect(loadoutOfByte(2)).toEqual({ kart: 'ray', driver: 'spade' })
    expect(loadoutOfByte(0xff)).toEqual({ kart: 'tide', driver: 'spade' })
  })

  it('writes the pick as a member look the room accepts, and reads it back', () => {
    for (const kart of KART_IDS) {
      for (const driver of DRIVER_IDS) {
        const look = lookOf(kart, driver)
        expect(LOOK_PATTERN.test(look)).toBe(true)
        expect(parseLook(look)).toEqual({ kart, driver })
        expect(parseClientMessage(JSON.stringify({ t: 'set_look', look }))).toEqual({
          t: 'set_look',
          look,
        })
      }
    }
    expect(parseLook('tide')).toBeNull()
    expect(parseLook('car.spade')).toBeNull()
    expect(parseLook(undefined)).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'set_look', look: null }))).toEqual({
      t: 'set_look',
      look: null,
    })
    for (const look of ['', 'UPPER', 'a.b.c', 'x'.repeat(17), 3, '<script>']) {
      expect(parseClientMessage(JSON.stringify({ t: 'set_look', look }))).toBeNull()
    }
  })
})

describe("the server's speed check reads each kart's numbers", () => {
  const track = raceTrack('riverside')!
  const GO = 100_000
  const context = { track, slot: 0, now: GO + 600_000, goAt: GO, laps: 0 }

  it('gives every kart its own cap, the fastest kart setting the default', () => {
    const caps = KART_IDS.map(speedCapFor)
    expect(SPEED_CAP).toBe(Math.max(...caps))
    expect(speedCapFor('heron')).toBeGreaterThan(speedCapFor('tide'))
    expect(speedCapFor('comet')).toBeLessThan(speedCapFor('tide'))
    // Stacked boosts on the fastest kart still pass with room to spare
    const heron = applyKart(KART_TUNING, 'heron')
    expect(heron.topSpeed * heron.boostStackFactor).toBeLessThan(speedCapFor('heron'))
  })

  it('takes a speed within the fastest kart margin from it, and refuses it from a slower kart', () => {
    const frame = driveFrames(track, 0).next().value as KartFrame
    // Between the two karts' caps: within the fastest kart's margin, past the slowest's
    const fast = (speedCapFor('heron') + speedCapFor('comet')) / 2
    const verdict = (kart: (typeof KART_IDS)[number]) =>
      judgeFrame(
        startTracking(track, 0),
        { ...frame, vx: fast, vz: 0, body: loadoutByte(kart, 'club') },
        { ...context, speedCap: speedCapFor(kart) },
      )
    expect(verdict('heron').kind).toBe('taken')
    expect(verdict('comet')).toMatchObject({ kind: 'refused', why: 'speed' })
  })

  it('in the room, holds each frame to the kart it names', () => {
    const seats = [{ id: 0 }]
    let state = kartModule.init(seats, { track: 'riverside', laps: 1, mode: 'race' }, {
      int: () => 0,
    } as never)
    state = { ...state, phase: 'racing', goAt: GO, racers: state.racers.map((one) => ({ ...one, loaded: true })) }
    const frame = driveFrames(track, 0).next().value as KartFrame
    const fast = (speedCapFor('heron') + speedCapFor('comet')) / 2
    const send = (kart: (typeof KART_IDS)[number]) =>
      kartModule.realtime!.frame(
        state,
        kartModule.realtime!.memory(),
        0,
        encodeFrame({ ...frame, vx: fast, vz: 0, body: loadoutByte(kart, 'heart') }),
        GO + 1000,
      )
    expect(send('heron').relay).not.toBeNull()
    expect(send('comet').relay).toBeNull()
  })
})

describe('bumps by weight (e10-t05a)', () => {
  const still = { ...INITIAL_KART, x: 0, z: 0 }
  const other = { x: 1, z: 0, vx: 0, vz: 0 }

  it('pushes equal karts apart half each, as before', () => {
    const { kart } = bumpKart(still, [other])
    expect(kart.x).toBeCloseTo(-(2 * 1.2 - 1) / 2)
  })

  it('pushes the lighter kart further than the heavier one', () => {
    const light = bumpKart(still, [{ ...other, mass: kartMass('crab') }], kartMass('heron'))
    const heavy = bumpKart(still, [{ ...other, mass: kartMass('heron') }], kartMass('crab'))
    expect(Math.abs(light.kart.x)).toBeGreaterThan(Math.abs(heavy.kart.x))
  })
})
