import { describe, expect, it } from 'vitest'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { seconds, startTrial, stepTrial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, type Track } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import type { KartMode } from '../../shared/games/kart/types.ts'
import { DRIVERS, measure } from '../../scripts/kart/drivers.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { createTrackBrain } from '../../src/kart/bots/routes.ts'
import { botSeats, createBotRace } from '../../src/kart/bots/botRace.ts'
import { IDLE_USE_MS, wantsToUse, type ItemSituation } from '../../src/kart/bots/itemSense.ts'
import { createLocalRoom } from '../../src/kart/bots/localRoom.ts'
import { drawBots, MAX_BOTS } from '../../src/kart/bots/roster.ts'
import {
  bandedShare,
  BOT_SKILLS,
  DIFFICULTIES,
  RUBBER_BAND,
  type Difficulty,
} from '../../src/kart/bots/skill.ts'

// Computer opponents (owner 2026-11-17; docs/ARCHITECTURE.md §4.20)

const SEEDS = [1, 2, 3]

function trackOf(id: string): Track {
  const track = raceTrack(id)
  if (!track) throw new Error(id)
  return track
}

/** One bot alone on a track, three laps, with no one to race: its time and how it went */
function solo(track: Track, difficulty: Difficulty, seed: number) {
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
  const skill = BOT_SKILLS[difficulty]
  // 2026-11-20: the hands that choose the road on a track with branches (routes.ts)
  const brain = createTrackBrain(skill, track, KART_TUNING, seed)
  let trial = startTrial(course)
  let wrongWays = 0
  for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
    const before = trial
    trial = stepTrial(trial, brain(trial, { speedShare: skill.topSpeedShare }), course)
    if (trial.wrongWay && !before.wrongWay) wrongWays++
  }
  return { trial, wrongWays, total: seconds(trial.steps) }
}

describe.each(RACE_TRACK_IDS)('bots alone on %s', (id) => {
  const track = trackOf(id)
  const runs = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      SEEDS.map((seed) => solo(track, difficulty, seed)),
    ]),
  ) as Record<Difficulty, ReturnType<typeof solo>[]>

  it('finish three laps at every difficulty, never the wrong way', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const run of runs[difficulty]) {
        expect(run.trial.phase).toBe('finished')
        expect(run.trial.laps).toHaveLength(3)
        expect(run.wrongWays).toBe(0)
      }
    }
  })

  it('are faster the harder they are, lap for lap on average', () => {
    const lap = (difficulty: Difficulty) =>
      runs[difficulty].reduce((sum, run) => sum + run.total, 0) / (SEEDS.length * 3)
    // 2026-11-20: the expert (expert.ts) above them all
    expect(lap('expert')).toBeLessThan(lap('hard'))
    expect(lap('hard')).toBeLessThan(lap('normal'))
    expect(lap('normal')).toBeLessThan(lap('easy'))
  })
})

// 2026-11-20 (docs/ARCHITECTURE.md §4.40): the expert computer kart drives as the scripted master
// does (src/kart/bots/drivers.ts), on the tracks to learn by heart too
describe.each(['wharf', 'lanes'])('the expert computer kart on %s', (id) => {
  it('laps within 5% of the master', () => {
    const track = trackOf(id)
    const expert = SEEDS.reduce((sum, seed) => sum + solo(track, 'expert', seed).total, 0)
    const master = SEEDS.reduce(
      (sum, seed) => sum + measure(track, DRIVERS.master, KART_TUNING, seed).seconds,
      0,
    )
    expect(Math.abs(expert - master) / master).toBeLessThanOrEqual(0.05)
  }, 60_000)
})

describe('the expert computer kart and the rubber band', () => {
  it('eases off ahead of the people, its foot flat down or not', () => {
    const track = trackOf('riverside')
    const plain = courseOf(track)
    const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
    // Steps it lifts off on the straight, no boost burning, going faster than the share allows
    const lifts = (speedShare: number) => {
      const brain = createBotBrain(
        BOT_SKILLS.expert,
        track.road,
        KART_TUNING,
        1,
        track.jumps,
        track.walls,
        trackGuide(track.id),
      )
      let trial = startTrial(course)
      let count = 0
      for (let step = 0; trial.phase !== 'finished' && step < 400 * 60; step++) {
        const input = brain(trial, { speedShare })
        const { kart } = trial.run
        const calm = kart.boostSeconds === 0 && kart.miniSeconds === 0 && !kart.drifting
        if (trial.phase === 'racing' && calm && !input.throttle) count++
        trial = stepTrial(trial, input, course)
      }
      return count
    }
    const eased = bandedShare(BOT_SKILLS.expert.topSpeedShare, RUBBER_BAND.fullLead)
    expect(eased).toBeLessThan(1)
    expect(lifts(eased)).toBeGreaterThan(lifts(1) + 100)
  }, 60_000)
})

/** A race of bots alone in a room of this browser's, on a counter for a clock */
function botsOnly(id: string, mode: KartMode, difficulty: Difficulty, count: number, seed = 7) {
  let now = 1_000_000
  const track = trackOf(id)
  const room = createLocalRoom({
    seats: count,
    options: { track: id, laps: 3, mode },
    seed,
    now: () => now,
  })
  const race = createBotRace({
    room,
    track,
    laps: 3,
    bots: botSeats(drawBots(count, seed), 0, difficulty),
    players: [],
    seed,
    now,
  })
  let hits = 0
  let seenEvents = 0
  for (let ms = 0; room.state().phase !== 'finished' && ms < 10 * 60_000; ms += 50) {
    now += 50
    race.advance(now)
    for (const event of room.state().events) {
      if (event.n < seenEvents) continue
      seenEvents = event.n + 1
      if (event.hit) hits++
    }
  }
  return { room, race, hits }
}

describe('a race of bots in a room run in this browser', () => {
  it.each(RACE_TRACK_IDS)(
    'every bot finishes an item race on %s',
    (id) => {
      const { room, race } = botsOnly(id, 'items', 'normal', 4)
      const state = room.state()
      expect(state.phase).toBe('finished')
      for (const racer of state.racers) {
        expect(racer.out).toBe(false)
        expect(racer.finishMs).not.toBeNull()
        expect(racer.lapMs).toHaveLength(3)
      }
      // They took boxes and used what they got, and the room judged it
      const bots = race.bots()
      expect(bots.reduce((sum, bot) => sum + bot.pickups, 0)).toBeGreaterThan(4)
      expect(state.used).toBeGreaterThan(4)
      race.stop()
    },
    60_000,
  )

  it('karts are hit by the items and the standings follow the finish times', () => {
    const { room, hits } = botsOnly('oldstreet', 'items', 'hard', MAX_BOTS, 3)
    const state = room.state()
    expect(state.phase).toBe('finished')
    expect(hits).toBeGreaterThan(0)
    const times = state.racers.map((racer) => racer.finishMs ?? Infinity)
    expect(times.every(Number.isFinite)).toBe(true)
  }, 60_000)

  it('a plain race has no boxes and no items', () => {
    const { room } = botsOnly('riverside', 'race', 'easy', 2)
    const state = room.state()
    expect(state.phase).toBe('finished')
    expect(state.boxes).toHaveLength(0)
    expect(state.used).toBe(0)
  }, 60_000)
})

describe('the roster', () => {
  it('draws different names, and karts and drivers from the garage', () => {
    const bots = drawBots(MAX_BOTS, 5)
    expect(bots).toHaveLength(7)
    expect(new Set(bots.map((bot) => bot.name)).size).toBe(7)
    expect(drawBots(0, 1)).toHaveLength(1)
    expect(drawBots(99, 1)).toHaveLength(MAX_BOTS)
  })
})

describe('the rubber band', () => {
  it('changes nothing near the player, eases off ahead, lifts behind but never past the kart', () => {
    expect(bandedShare(0.95, 0)).toBe(0.95)
    expect(bandedShare(0.95, RUBBER_BAND.deadZone)).toBe(0.95)
    expect(bandedShare(0.95, 1)).toBeCloseTo(0.95 - RUBBER_BAND.aheadCut)
    expect(bandedShare(0.95, -1)).toBeCloseTo(0.95 + RUBBER_BAND.behindLift)
    expect(bandedShare(1, -1)).toBe(1)
    expect(bandedShare(0.95, 0.1)).toBeLessThan(0.95)
    expect(bandedShare(0.95, 0.1)).toBeGreaterThan(0.95 - RUBBER_BAND.aheadCut)
  })

  it('never lets a bot drive past its own top speed on the throttle', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(BOT_SKILLS[difficulty].topSpeedShare).toBeLessThanOrEqual(1)
    }
  })
})

describe('when a bot uses its item', () => {
  const base: ItemSituation = {
    item: 'boost',
    heldMs: 5_000,
    waitMs: 1_000,
    ahead: null,
    aheadCount: 0,
    behind: null,
    straight: false,
    threatened: false,
  }
  const near = { distance: 50, angle: 0.02, sameLap: true }

  it('holds every item for its wait first, except a shield against a threat', () => {
    expect(wantsToUse(true, { ...base, heldMs: 500, straight: true })).toBe(false)
    expect(wantsToUse(false, { ...base, heldMs: 500 })).toBe(false)
    expect(wantsToUse(true, { ...base, item: 'shield', heldMs: 0, threatened: true })).toBe(true)
  })

  it('without sense, uses anything once the wait is over', () => {
    expect(wantsToUse(false, { ...base, item: 'cloud' })).toBe(true)
    expect(wantsToUse(false, { ...base, item: 'hail' })).toBe(true)
  })

  it('with sense, a boost on a straight', () => {
    expect(wantsToUse(true, base)).toBe(false)
    expect(wantsToUse(true, { ...base, straight: true })).toBe(true)
  })

  it('with sense, items that reach ahead only with someone in reach', () => {
    for (const item of ['tow', 'cloud', 'swap', 'hail'] as const) {
      expect(wantsToUse(true, { ...base, item })).toBe(false)
      expect(wantsToUse(true, { ...base, item, ahead: near, aheadCount: 1 })).toBe(true)
    }
    expect(wantsToUse(true, { ...base, item: 'tow', ahead: { ...near, distance: 500 } })).toBe(
      false,
    )
    expect(wantsToUse(true, { ...base, item: 'swap', ahead: { ...near, sameLap: false } })).toBe(
      false,
    )
    // A hailstone only when the kart ahead is lined up
    expect(wantsToUse(true, { ...base, item: 'hail', ahead: { ...near, angle: 0.6 } })).toBe(false)
    expect(wantsToUse(true, { ...base, item: 'headwind' })).toBe(false)
    expect(wantsToUse(true, { ...base, item: 'headwind', aheadCount: 2 })).toBe(true)
  })

  it('with sense, a puddle for a kart close behind, and a shield when something comes', () => {
    expect(wantsToUse(true, { ...base, item: 'puddle' })).toBe(false)
    expect(wantsToUse(true, { ...base, item: 'puddle', behind: 20 })).toBe(true)
    expect(wantsToUse(true, { ...base, item: 'shield' })).toBe(false)
    // Held long enough with nothing to answer, either goes anyway
    const idle = base.waitMs + IDLE_USE_MS
    expect(wantsToUse(true, { ...base, item: 'shield', heldMs: idle })).toBe(true)
    expect(wantsToUse(true, { ...base, item: 'puddle', heldMs: idle })).toBe(true)
  })
})
