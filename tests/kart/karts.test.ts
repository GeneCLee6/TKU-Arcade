import { describe, expect, it } from 'vitest'
import { kart as kartModule } from '../../shared/games/kart/rules.ts'
import {
  applyKart,
  BUDGET_STATS,
  DRIVER_IDS,
  KART_BODY_RADIUS,
  KART_IDS,
  KART_SERIES,
  KART_STATS,
  KART_TIERS,
  kartKind,
  kartMass,
  kartRadius,
  KARTS,
  kartSpec,
  KIND_TRAITS,
  LOADOUT_DRIVERS,
  LOADOUT_KARTS,
  loadoutByte,
  loadoutOfByte,
  lookOf,
  parseLook,
  STAT_MAX,
  STAT_MIN,
  itemPerksOf,
  itemPointsOf,
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
import { collideWalls, KART_RADIUS } from '../../shared/kart/walls.ts'
import { LOOK_PATTERN, parseClientMessage } from '../../shared/protocol.ts'
import { OUTFIT_IDS } from '../../shared/kart/outfits.ts'
import { driveFrames } from './raceDriver.ts'

/** The top speed a kart settles at, flat out on the throttle alone */
function flatOut(id: (typeof KART_IDS)[number]): number {
  const tuning = applyKart(KART_TUNING, id)
  let state = INITIAL_KART
  for (let step = 0; step < 900; step++) state = stepKart(state, { ...NO_INPUT, throttle: true }, tuning)
  return Math.hypot(state.vx, state.vz)
}

const OLD_SIX = ['tide', 'comet', 'ray', 'crab', 'heron', 'flyfish'] as const
// 2026-11-21: a season's flagship stands apart, over the budget on purpose (tests/kart/meta.test.ts
// and flagship.test.ts hold it); every rule here is for the others
const REGULAR = KARTS.filter((one) => one.tier !== 'flagship')
const REGULAR_IDS = REGULAR.map((one) => one.id)
const REGULAR_TIERS = KART_TIERS.filter((tier) => tier !== 'flagship')
const ONLY_KARTS = REGULAR.filter((one) => one.kind === 'kart')
const BIKES = REGULAR.filter((one) => one.kind === 'bike')

describe('the vehicles and four drivers (e10-t05, and the series and bikes of 2026-11-19)', () => {
  it('has twenty vehicles: seventeen karts and three bikes, and four drivers', () => {
    expect(KARTS.map((one) => one.id)).toEqual([...KART_IDS])
    expect(new Set(KART_IDS).size).toBe(KART_IDS.length)
    expect(ONLY_KARTS).toHaveLength(17)
    expect(BIKES).toHaveLength(3)
    expect(DRIVER_IDS).toHaveLength(4)
  })

  it('keeps the first six as they were: their places, their tiers and their points', () => {
    expect(KART_IDS.slice(0, 6)).toEqual([...OLD_SIX])
    expect(KARTS.slice(0, 6).map((one) => [one.id, one.tier, one.stats])).toEqual([
      ['tide', 'entry', { speed: 0, acceleration: 0, handling: 0, charge: 0, weight: 0 }],
      ['comet', 'entry', { speed: -1, acceleration: 2, handling: 1, charge: -2, weight: -1 }],
      ['ray', 'advanced', { speed: 1, acceleration: -1, handling: 1, charge: -1, weight: 0 }],
      ['crab', 'advanced', { speed: 0, acceleration: -2, handling: 1, charge: 1, weight: 2 }],
      ['heron', 'expert', { speed: 2, acceleration: -1, handling: -2, charge: 1, weight: -1 }],
      ['flyfish', 'expert', { speed: -1, acceleration: 0, handling: -1, charge: 2, weight: 0 }],
    ])
    // ... and drive as they did: the stats alone, no trait and a kart's own circle
    for (const id of OLD_SIX) {
      expect(kartKind(id)).toBe('kart')
      expect(kartSpec(id).traits).toBeUndefined()
      expect(applyKart(KART_TUNING, id).bodyRadius).toBeUndefined()
    }
  })

  it('has at least two karts in every series, of different tiers, and a bike of every tier', () => {
    for (const series of KART_SERIES) {
      const members = ONLY_KARTS.filter((one) => one.series === series)
      expect(members.length, series).toBeGreaterThanOrEqual(2)
      expect(new Set(members.map((one) => one.tier)).size, series).toBe(members.length)
    }
    expect(BIKES.map((one) => one.tier).sort()).toEqual([...REGULAR_TIERS].sort())
    for (const tier of REGULAR_TIERS) {
      expect(KARTS.filter((one) => one.tier === tier).length, tier).toBeGreaterThanOrEqual(5)
    }
  })

  it('gives every series the stat it is named for: nobody in it is below par there', () => {
    const lead = { sprint: 'acceleration', speed: 'speed', drift: 'charge', heavy: 'weight' } as const
    for (const kart of ONLY_KARTS) {
      if (kart.series === 'allround') {
        // An all-rounder strays at most a point from the standard, anywhere
        for (const stat of KART_STATS) expect(Math.abs(kart.stats[stat]), kart.id).toBeLessThanOrEqual(1)
        continue
      }
      // 2026-11-20: the item series is built for items: it spends points on them, none on a stat
      if (kart.series === 'item') {
        expect(itemPointsOf(kart.id), kart.id).toBeGreaterThan(0)
        for (const stat of BUDGET_STATS) expect(kart.stats[stat], kart.id).toBeLessThanOrEqual(1)
        continue
      }
      expect(kart.stats[lead[kart.series]], kart.id).toBeGreaterThan(0)
      // ... and only the item series spends on items
      expect(itemPointsOf(kart.id), kart.id).toBe(0)
    }
    // A bike is light, whatever else it is
    for (const bike of BIKES) expect(bike.stats.weight, bike.id).toBeLessThan(0)
  })

  it('makes every kart a trade-off: its points sum to zero, and none is best or worst at everything', () => {
    for (const { id, stats } of REGULAR) {
      // 2026-11-20: a point spent on items (the item series) is a point of the same budget
      const sum = BUDGET_STATS.reduce((total, stat) => total + stats[stat], 0) + itemPointsOf(id)
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
    const ratioOf = (ids: readonly (typeof KART_IDS)[number][], key: keyof typeof KART_TUNING) =>
      ids.map((id) => applyKart(KART_TUNING, id)[key] / KART_TUNING[key])
    const ratio = (key: keyof typeof KART_TUNING) => ratioOf(KART_IDS, key)
    const karts = ONLY_KARTS.map((one) => one.id)
    // The top speed is every vehicle's, a bike's too: no kind of vehicle is faster on a straight
    for (const share of ratio('topSpeed')) expect(Math.abs(share - 1)).toBeLessThanOrEqual(0.05)
    for (const share of ratioOf(karts, 'gaugeFillRate')) expect(Math.abs(share - 1)).toBeLessThanOrEqual(0.1 + 1e-9)
    for (const share of ratioOf(karts, 'turnRate')) expect(Math.abs(share - 1)).toBeLessThanOrEqual(0.1)
    // A bike's own numbers come on top (KIND_TRAITS), still close: within a quarter either way
    for (const share of ratio('gaugeFillRate')) expect(Math.abs(share - 1)).toBeLessThanOrEqual(0.25)
    for (const share of ratio('turnRate')) expect(Math.abs(share - 1)).toBeLessThanOrEqual(0.15)
    for (const key of ['boostTopSpeedFactor', 'miniTopSpeedFactor', 'startTopSpeedFactor'] as const) {
      for (const share of ratio(key)) expect(share, key).toBe(1)
    }
    const tops = ratioOf(REGULAR_IDS, 'topSpeed')
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(0.03 + 1e-9)
    // Measured on the physics, not only read off the table
    const speeds = REGULAR_IDS.map(flatOut)
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
    const seen = new Set<number>()
    for (const kart of KART_IDS) {
      for (const driver of DRIVER_IDS) {
        const byte = loadoutByte(kart, driver)
        expect(byte).toBeGreaterThanOrEqual(0)
        expect(byte).toBeLessThan(256)
        expect(Number.isInteger(byte)).toBe(true)
        expect(loadoutOfByte(byte)).toEqual({ kart, driver })
        seen.add(byte)
      }
    }
    // Every pick has a byte of its own
    expect(seen.size).toBe(KART_IDS.length * DRIVER_IDS.length)
    // A frame from before e10-t05 sent the body's index (0 to 2): the same kart, the first driver
    expect(loadoutOfByte(2)).toEqual({ kart: 'ray', driver: 'spade' })
    expect(loadoutOfByte(0xff)).toEqual({ kart: 'tide', driver: 'spade' })
  })

  it('has room in the byte for every vehicle and driver, and for more of each', () => {
    expect(KART_IDS.length).toBeLessThanOrEqual(LOADOUT_KARTS)
    expect(DRIVER_IDS.length).toBeLessThanOrEqual(LOADOUT_DRIVERS)
    expect(LOADOUT_KARTS * LOADOUT_DRIVERS).toBe(256)
  })

  it('reads every byte a page from before 2026-11-19 sent as it did then', () => {
    // Then: the kart in the low four bits, the driver in the high four, six karts and four drivers
    const before = (kart: number, driver: number) => kart | (driver << 4)
    OLD_SIX.forEach((kart, kartIndex) => {
      DRIVER_IDS.forEach((driver, driverIndex) => {
        expect(loadoutByte(kart, driver)).toBe(before(kartIndex, driverIndex))
        expect(loadoutOfByte(before(kartIndex, driverIndex))).toEqual({ kart, driver })
      })
    })
    // ... and a page from then, reading a new vehicle's byte with its own table, finds a kart and a
    // driver it knows, or its defaults: never nothing (a look only; the room judges by this table)
    const thenKarts = OLD_SIX
    for (const kart of KART_IDS) {
      for (const driver of DRIVER_IDS) {
        const byte = loadoutByte(kart, driver)
        const read = { kart: thenKarts[byte & 0x0f] ?? 'tide', driver: DRIVER_IDS[(byte >> 4) & 0x0f] ?? 'spade' }
        expect(KART_IDS).toContain(read.kart)
        expect(DRIVER_IDS).toContain(read.driver)
        // The first sixteen read as themselves or as the default; only past them is another shown
        if (KART_IDS.indexOf(kart) < 6) expect(read).toEqual({ kart, driver })
      }
    }
  })

  it('writes the pick as a member look the room accepts, and reads it back', () => {
    for (const kart of KART_IDS) {
      for (const driver of DRIVER_IDS) {
        const look = lookOf(kart, driver)
        expect(LOOK_PATTERN.test(look)).toBe(true)
        expect(parseLook(look)).toEqual({ kart, driver, outfit: 'race' })
        expect(parseClientMessage(JSON.stringify({ t: 'set_look', look }))).toEqual({
          t: 'set_look',
          look,
        })
        // 2026-11-23 (outfits.ts): the outfit a third word, left out for the race suit
        for (const outfit of OUTFIT_IDS) {
          const dressed = lookOf(kart, driver, outfit)
          expect(LOOK_PATTERN.test(dressed)).toBe(true)
          expect(parseLook(dressed)).toEqual({ kart, driver, outfit })
          expect(parseClientMessage(JSON.stringify({ t: 'set_look', look: dressed }))).toEqual({
            t: 'set_look',
            look: dressed,
          })
          // What a page from before the outfits reads of it: the kart and the driver, as ever
          const [thenKart, thenDriver] = dressed.split('.')
          expect({ kart: thenKart, driver: thenDriver }).toEqual({ kart, driver })
        }
      }
    }
    expect(lookOf('tide', 'spade', 'race')).toBe('tide.spade')
    expect(parseLook('tide.spade.tuxedo')).toEqual({ kart: 'tide', driver: 'spade', outfit: 'race' })
    expect(parseLook('tide')).toBeNull()
    expect(parseLook('car.spade')).toBeNull()
    expect(parseLook(undefined)).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'set_look', look: null }))).toEqual({
      t: 'set_look',
      look: null,
    })
    for (const look of ['', 'UPPER', 'a.b.c.d', 'x'.repeat(17), 3, '<script>']) {
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
    // Every vehicle's cap is its own top speed with its biggest boost, times the margin of 1.5: a
    // bike's traits move it with them, and no vehicle's cap is under its own flat-out speed
    for (const id of KART_IDS) {
      const tuning = applyKart(KART_TUNING, id)
      expect(speedCapFor(id), id).toBeGreaterThanOrEqual(tuning.topSpeed * tuning.boostTopSpeedFactor * 1.5 - 1e-9)
      expect(speedCapFor(id), id).toBeGreaterThan(flatOut(id) * 1.5)
    }
    // Vehicles with the same speed points share a cap, kart or bike
    expect(speedCapFor('hornet')).toBeCloseTo(speedCapFor('ray'), 9)
    expect(speedCapFor('swift')).toBeCloseTo(speedCapFor('tide'), 9)
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

describe('a bike (2026-11-19): numbers on the same physics, not physics of its own', () => {
  it('holds the kart\'s circle to the walls\' own', () => {
    expect(KART_BODY_RADIUS).toBe(KART_RADIUS)
    expect(KIND_TRAITS.kart).toEqual({ radius: KART_RADIUS, mass: 1, traits: {} })
  })

  it('is narrower and lighter than any kart, by its kind', () => {
    for (const bike of BIKES) {
      expect(kartRadius(bike.id)).toBeLessThan(KART_RADIUS)
      expect(applyKart(KART_TUNING, bike.id).bodyRadius).toBe(KIND_TRAITS.bike.radius)
      for (const kart of ONLY_KARTS) expect(kartMass(bike.id), bike.id).toBeLessThan(kartMass(kart.id))
    }
    for (const kart of ONLY_KARTS) expect(kartRadius(kart.id)).toBe(KART_RADIUS)
  })

  it('gains and pays, both: quicker to tip in and to straighten, a shallower drift and a dearer wall', () => {
    const bike = applyKart(KART_TUNING, 'swift')
    const kart = KART_TUNING
    // What it gains
    expect(bike.steerResponse).toBeGreaterThan(kart.steerResponse)
    expect(bike.driftSlipIn).toBeLessThan(kart.driftSlipIn)
    expect(bike.driftRecoverRate).toBeGreaterThan(kart.driftRecoverRate)
    // What it pays
    expect(bike.driftSlip).toBeLessThan(kart.driftSlip)
    expect(bike.driftScrub).toBeGreaterThan(kart.driftScrub)
    expect(bike.gripScrub).toBeGreaterThan(kart.gripScrub)
    // Its boosts are a kart's: as long, as strong
    expect(bike.boostDuration).toBe(kart.boostDuration)
    expect(bike.wallImpactLoss).toBeGreaterThan(kart.wallImpactLoss)
    // The instant boost is still earned by the same share of the drift's depth
    expect(bike.dashMinSlip / bike.driftSlip).toBeCloseTo(kart.dashMinSlip / kart.driftSlip, 9)
  })

  it('scales any number of the tuning a kind or a machine names, and nothing else', () => {
    const named = new Set(Object.keys(KIND_TRAITS.bike.traits))
    const stats = new Set(['topSpeed', 'acceleration', 'turnRate', 'driftTurnRate', 'driftSteerRate', 'gaugeFillRate'])
    const bike = applyKart(KART_TUNING, 'swift')
    for (const key of TUNING_KEYS) {
      if (named.has(key) || stats.has(key)) continue
      expect(bike[key], key).toBe(KART_TUNING[key])
    }
    for (const key of named) expect(TUNING_KEYS, key).toContain(key)
  })

  it('fits a gap a kart is pushed out of', () => {
    // A wall along z, one metre to the right of where both stand
    const wall = [{ ax: 1, az: -10, bx: 1, bz: 10 }]
    const still = { ...INITIAL_KART, x: 0, z: 0 }
    const kart = collideWalls(still, still, wall, applyKart(KART_TUNING, 'tide'))
    const bike = collideWalls(still, still, wall, applyKart(KART_TUNING, 'swift'))
    expect(kart.touching).toBe(true)
    expect(kart.state.x).toBeCloseTo(1 - KART_RADIUS)
    expect(bike.touching).toBe(false)
    expect(bike.state.x).toBe(0)
  })

  it('bumps at its own width, and is the one thrown aside', () => {
    const still = { ...INITIAL_KART, x: 0, z: 0 }
    // Two metres apart: two karts touch (2.4 m), a bike and a kart do not quite (2.05 m)
    const beside = { x: 2.1, z: 0, vx: 0, vz: 0 }
    expect(bumpKart(still, [beside]).kart.x).toBeLessThan(0)
    expect(bumpKart(still, [beside], kartMass('swift'), kartRadius('swift')).kart.x).toBe(0)
    // Two bikes pass closer still
    const bikeBeside = { x: 1.8, z: 0, vx: 0, vz: 0, radius: kartRadius('swift') }
    expect(bumpKart(still, [bikeBeside], 1, kartRadius('swift')).kart.x).toBe(0)
    // Overlapping, the bike takes the larger share of the push
    const close = { x: 1, z: 0, vx: 0, vz: 0 }
    const bike = bumpKart(still, [{ ...close, mass: kartMass('whale') }], kartMass('petrel'), kartRadius('petrel'))
    const whale = bumpKart(still, [{ ...close, mass: kartMass('petrel'), radius: kartRadius('petrel') }], kartMass('whale'))
    expect(Math.abs(bike.kart.x)).toBeGreaterThan(Math.abs(whale.kart.x) * 1.5)
  })
})

describe('the item series (2026-11-20)', () => {
  const ITEM_SERIES = KARTS.filter((one) => one.series === 'item')

  it('has three karts, one of each tier, whose perks stay small', () => {
    expect(ITEM_SERIES.map((one) => one.id)).toEqual(['pelican', 'otter', 'cormorant'])
    expect(ITEM_SERIES.map((one) => one.tier)).toEqual(['entry', 'advanced', 'expert'])
    for (const one of ITEM_SERIES) {
      const perks = itemPerksOf(one.id)
      expect(perks.luck).toBeLessThanOrEqual(2)
      expect(perks.duration).toBeLessThanOrEqual(1.5)
      expect(perks.shieldHits).toBeLessThanOrEqual(2)
      // The same top speed as the standard kart: the trade is paid elsewhere
      expect(one.stats.speed).toBe(0)
    }
  })

  it('gives every other vehicle no perks at all', () => {
    for (const one of KARTS.filter((kart) => kart.series !== 'item')) {
      expect(itemPerksOf(one.id), one.id).toEqual({ luck: 0, duration: 1, shieldHits: 1 })
    }
  })

  it('reads the perks the same from a frame byte as from the id', () => {
    for (const one of ITEM_SERIES) {
      const byte = loadoutByte(one.id, 'club')
      expect(itemPerksOf(loadoutOfByte(byte).kart)).toEqual(itemPerksOf(one.id))
    }
  })
})
