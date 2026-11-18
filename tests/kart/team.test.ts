// The team race (2026-11-18; shared/kart/team.ts, docs/KART-NETCODE.md §17): the sides, the score,
// the team gauge as the room fills it from frames, the team boosts it hands out, the team boost in
// the physics (longer and faster than a boost from the gauge) and a whole team race of computer
// karts in a room run here.
import { describe, expect, it } from 'vitest'
import { makeSeats } from '../../shared/games/match.ts'
import { createRng } from '../../shared/games/rng.ts'
import { kart, teamScore } from '../../shared/games/kart/rules.ts'
import type { KartAction, KartState } from '../../shared/games/kart/types.ts'
import { isGameError, type Actor, type RealtimeMemory } from '../../shared/games/types.ts'
import { decodeItemFrame, encodeItemFrame } from '../../shared/kart/items.ts'
import { headwindStep, stunStep } from '../../shared/kart/itemEffects.ts'
import { applyKart, KART_IDS } from '../../shared/kart/karts.ts'
import {
  ARCADE_TUNING,
  INITIAL_KART,
  KART_TUNING,
  kartBoosting,
  kartSpeed,
  kartTeamBoosting,
  NO_INPUT,
  stepKart,
  type KartInput,
  type KartState as Kart,
} from '../../shared/kart/physics.ts'
import { speedCapFor } from '../../shared/kart/race.ts'
import {
  assignTeams,
  foeShots,
  gaugeStep,
  NO_TRACE,
  pointsForPlace,
  scoreTeams,
  TEAM_BOOST_MS,
  TEAM_GAUGE,
  teamBoostsLeft,
  teamGain,
} from '../../shared/kart/team.ts'
import { TEAM_BOOST } from '../../shared/kart/teamBoost.ts'
import { createTeamRider } from '../../shared/kart/teamRider.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { botSeats, createBotRace } from '../../src/kart/bots/botRace.ts'
import { createLocalRoom } from '../../src/kart/bots/localRoom.ts'
import { drawBots } from '../../src/kart/bots/roster.ts'
import { bytes, driveFrames } from './raceDriver.ts'

describe('the sides', () => {
  it('splits seats with no choice evenly, red first: 2v2, 3v3, 4v4', () => {
    expect(assignTeams(makeSeats(4))).toEqual([0, 1, 0, 1])
    expect(assignTeams(makeSeats(6))).toEqual([0, 1, 0, 1, 0, 1])
    expect(assignTeams(makeSeats(8)).filter((team) => team === 0)).toHaveLength(4)
    // An odd one out goes to red
    expect(assignTeams(makeSeats(5)).filter((team) => team === 0)).toHaveLength(3)
  })

  it('keeps a choice, and fills the smaller side with the rest', () => {
    const teams = assignTeams([
      { id: 0, team: 1 },
      { id: 1, team: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
    ])
    expect(teams).toEqual([1, 1, 0, 0, 0])
    // A computer kart on either side, as the host chose
    expect(assignTeams([{ id: 0, team: 0 }, { id: 1, team: 0 }, { id: 2, team: 1 }])).toEqual([
      0, 0, 1,
    ])
  })

  it('leaves no side empty with two karts or more, and ignores a side that is not one', () => {
    expect(assignTeams([{ id: 0, team: 0 }, { id: 1, team: 0 }])).toEqual([0, 1])
    expect(assignTeams([{ id: 0, team: 1 }, { id: 1, team: 1 }, { id: 2, team: 1 }])).toEqual([
      1, 1, 0,
    ])
    expect(assignTeams([{ id: 0, team: 7 }, { id: 1 }])).toEqual([0, 1])
    expect(assignTeams([{ id: 0, team: 1 }])).toEqual([1])
  })
})

describe('the score', () => {
  const teamOf = (teams: readonly (0 | 1)[]) => (seat: number) => teams[seat] ?? null

  it('gives 10, 8, 6, 5, 4, 3, 2, 1 by place and nothing after', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(pointsForPlace)).toEqual([10, 8, 6, 5, 4, 3, 2, 1, 0])
  })

  it('adds each side up: first and fourth beat second and third', () => {
    const score = scoreTeams([0, 1, 3, 2], teamOf([0, 1, 0, 1]), [2, 2])
    // Red: seat 0 first (10) and seat 2 fourth (5); blue: second (8) and third (6)
    expect(score.totals).toEqual([15, 14])
    expect(score.winner).toBe(0)
    expect(score.points.get(3)).toBe(6)
  })

  it('level, the side of the kart that finished first wins', () => {
    // 3v3: red 10 + 4 + 3 = 17, blue 8 + 6 + 5 = 19
    expect(scoreTeams([0, 1, 3, 5, 2, 4], teamOf([0, 1, 0, 1, 0, 1]), [3, 3]).totals).toEqual([
      17, 19,
    ])
    // Only the winner of a two-kart race home: 10 against nothing
    expect(scoreTeams([1], teamOf([0, 1]), [1, 1]).winner).toBe(1)
    // 1v1 with a made-up level score: the first home
    const level = scoreTeams([], teamOf([0, 1]), [1, 1])
    expect(level.totals).toEqual([0, 0])
    expect(level.winner).toBeNull()
  })

  it('counts only as many karts a side as the smaller side has', () => {
    // Three reds against one blue: only the best red counts
    const score = scoreTeams([3, 0, 1, 2], teamOf([0, 0, 0, 1]), [3, 1])
    expect(score.counted).toBe(1)
    expect(score.totals).toEqual([8, 10])
    expect(score.winner).toBe(1)
  })
})

describe('what a frame earns the team gauge', () => {
  const drift = { vx: 0, vz: -TEAM_GAUGE.topSpeed, drifting: true, boosting: false }
  const straight = { ...drift, drifting: false }

  it('fills by the time drifting and the speed, shared by the size of the team', () => {
    const first = teamGain(NO_TRACE, drift, 1_000, 1, false)
    // The first frame has no time behind it
    expect(first.gain).toBe(0)
    const next = teamGain(first.trace, drift, 1_050, 1, false)
    expect(next.gain).toBeCloseTo(TEAM_GAUGE.driftRate * 0.05, 9)
    expect(teamGain(first.trace, drift, 1_050, 4, false).gain).toBeCloseTo(next.gain / 4, 9)
    // Half the speed, half the points; too slow, none; not drifting, none
    const slow = { ...drift, vz: -TEAM_GAUGE.topSpeed / 2 }
    expect(teamGain(first.trace, slow, 1_050, 1, false).gain).toBeCloseTo(next.gain / 2, 9)
    expect(teamGain(first.trace, { ...drift, vz: -5 }, 1_050, 1, false).gain).toBe(0)
    expect(teamGain(first.trace, straight, 1_050, 1, false).gain).toBe(0)
  })

  it('a gap between frames earns no more than a tenth of a second', () => {
    const first = teamGain(NO_TRACE, drift, 1_000, 1, false)
    expect(teamGain(first.trace, drift, 9_000, 1, false).gain).toBeCloseTo(
      TEAM_GAUGE.driftRate * 0.1,
      9,
    )
  })

  it('a boost straight out of a drift earns the dash points, once', () => {
    let trace = teamGain(NO_TRACE, drift, 1_000, 2, false).trace
    trace = teamGain(trace, straight, 1_050, 2, false).trace
    const dash = teamGain(trace, { ...straight, boosting: true }, 1_100, 2, false)
    expect(dash.gain).toBeCloseTo(TEAM_GAUGE.dashPoints / 2, 9)
    // Still boosting: nothing more
    expect(teamGain(dash.trace, { ...straight, boosting: true }, 1_150, 2, false).gain).toBe(0)
    // A boost long after any drift is no dash
    const late = teamGain(trace, { ...straight, boosting: true }, 9_000, 2, false)
    expect(late.gain).toBe(0)
  })

  it('earns nothing while the kart burns its own team boost', () => {
    const first = teamGain(NO_TRACE, drift, 1_000, 1, true)
    expect(teamGain(first.trace, drift, 1_050, 1, true).gain).toBe(0)
    expect(teamGain(first.trace, { ...straight, boosting: true }, 1_050, 1, true).gain).toBe(0)
  })

  it('is told to the browsers in steps', () => {
    expect([0, 3.9, 4, 11, 99.9].map(gaugeStep)).toEqual([0, 0, 4, 8, 96])
  })
})

// ── The physics ───────────────────────────────────────────────────────────────────────────────────

const GO: KartInput = { ...NO_INPUT, throttle: true }

/** Steps with the same input; `press` taps the boost key on the first */
function run(kart: Kart, steps: number, press = false, tuning = KART_TUNING): Kart {
  let state = kart
  for (let step = 0; step < steps; step++) {
    state = stepKart(state, { ...GO, boost: press && step === 0 }, tuning)
  }
  return state
}

/** At the top speed on a straight */
const cruising = (extra: Partial<Kart> = {}): Kart => ({
  ...INITIAL_KART,
  vz: -KART_TUNING.topSpeed,
  ...extra,
})

describe('the team boost in the physics', () => {
  it('burns half as long again as a boost from the gauge, and goes faster', () => {
    expect(TEAM_BOOST.seconds).toBeCloseTo(KART_TUNING.boostDuration * 1.5, 9)
    expect(TEAM_BOOST.topSpeedFactor).toBeGreaterThan(KART_TUNING.boostTopSpeedFactor)
    expect(TEAM_BOOST.accelFactor).toBeGreaterThan(KART_TUNING.boostAccelFactor)

    const team = run(cruising({ teamBoosts: 1, teamSeconds: 0 }), 1, true)
    expect(team.teamBoosts).toBe(0)
    expect(kartTeamBoosting(team)).toBe(true)
    expect(kartBoosting(team)).toBe(true)
    // 4.35 s is 261 steps (give or take one: the clock counts down in sixtieths)
    const steps = Math.round(TEAM_BOOST.seconds * 60)
    expect(kartTeamBoosting(run(team, steps - 3))).toBe(true)
    expect(kartTeamBoosting(run(team, steps + 1))).toBe(false)

    const own = run(cruising({ storedBoosts: 1 }), 1, true)
    const ownSteps = Math.round(KART_TUNING.boostDuration * 60)
    expect(run(own, ownSteps + 1).boostSeconds).toBe(0)

    // Three seconds in, the team boost has the kart well over a plain boost's top speed
    const fast = kartSpeed(run(team, 180))
    const plain = kartSpeed(run(own, 150))
    expect(plain).toBeLessThanOrEqual(KART_TUNING.topSpeed * KART_TUNING.boostTopSpeedFactor + 1e-6)
    expect(fast).toBeGreaterThan(KART_TUNING.topSpeed * KART_TUNING.boostTopSpeedFactor + 1)
    expect(fast).toBeLessThanOrEqual(KART_TUNING.topSpeed * TEAM_BOOST.topSpeedFactor + 1e-6)
    // The room still takes its frames, whichever kart
    for (const id of KART_IDS) {
      const top = applyKart(KART_TUNING, id).topSpeed
      expect(top * TEAM_BOOST.topSpeedFactor).toBeLessThan(speedCapFor(id))
    }
  })

  it('fires before a charge of the kart, and no charge fires while it burns', () => {
    const both = cruising({ teamBoosts: 1, teamSeconds: 0, storedBoosts: 2 })
    const fired = run(both, 1, true)
    expect(fired.teamBoosts).toBe(0)
    expect(fired.storedBoosts).toBe(2)
    expect(fired.boostSeconds).toBe(0)
    // Let go, then pressed again mid-burn: nothing fires
    const again = run(run(fired, 30), 1, true)
    expect(again.storedBoosts).toBe(2)
    expect(again.boostSeconds).toBe(0)
    // Burnt out: the next press fires the charge
    const after = run(run(fired, 270), 1, true)
    expect(kartTeamBoosting(after)).toBe(false)
    expect(after.storedBoosts).toBe(1)
    expect(after.boostSeconds).toBeGreaterThan(0)
  })

  it('does not fire while a boost of the kart burns: only once it has burnt out', () => {
    const boosting = run(cruising({ teamBoosts: 2, teamSeconds: 0, storedBoosts: 1 }), 1, false)
    const own = run({ ...boosting, teamBoosts: 0 }, 1, true)
    expect(own.boostSeconds).toBeGreaterThan(0)
    // A second team boost while the first burns stays held
    const first = run(cruising({ teamBoosts: 2, teamSeconds: 0 }), 1, true)
    const second = run(run(first, 20), 1, true)
    expect(second.teamBoosts).toBe(1)
    // A press while the charge burns leaves the team boost held
    const during = run(run({ ...own, teamBoosts: 1 }, 20), 1, true)
    expect(during.teamBoosts).toBe(1)
    expect(kartTeamBoosting(during)).toBe(false)
  })

  it('fills none of the kart gauge while it burns, and a headwind or a hit blows it out', () => {
    const team = run(cruising({ teamBoosts: 1, teamSeconds: 0 }), 1, true)
    let drifting = team
    for (let step = 0; step < 60; step++) {
      drifting = stepKart(drifting, { ...GO, steer: 1, drift: true })
    }
    expect(drifting.drifting).toBe(true)
    expect(drifting.gauge).toBe(0)
    expect(kartTeamBoosting(headwindStep(team, 1 / 60))).toBe(false)
    expect(kartTeamBoosting(stunStep(team, 1 / 60))).toBe(false)
  })

  it('leaves a kart that is in no team race exactly as it was', () => {
    const solo = run(cruising({ storedBoosts: 1 }), 5, true)
    expect('teamBoosts' in solo).toBe(false)
    expect('teamSeconds' in solo).toBe(false)
    expect('teamSeconds' in headwindStep(solo, 1 / 60)).toBe(false)
  })

  it('in the arcade (old) feel is a boost of the team boost length, fired the same way', () => {
    const start: Kart = { ...INITIAL_KART, vz: -ARCADE_TUNING.topSpeed, teamBoosts: 1, teamSeconds: 0, storedBoosts: 1 }
    const fired = run(start, 1, true, ARCADE_TUNING)
    expect(fired.teamBoosts).toBe(0)
    expect(fired.storedBoosts).toBe(1)
    expect(kartTeamBoosting(fired)).toBe(true)
    expect(fired.boostSeconds).toBeCloseTo(TEAM_BOOST.seconds - 1 / 60, 6)
    expect(kartTeamBoosting(run(fired, 262, false, ARCADE_TUNING))).toBe(false)
  })
})

describe('a kart and the room keep count of its team boosts', () => {
  it('holds what the room says less those fired that the room has not counted', () => {
    expect(teamBoostsLeft(2, 0, 0)).toBe(2)
    expect(teamBoostsLeft(2, 0, 1)).toBe(1)
    expect(teamBoostsLeft(1, 1, 1)).toBe(1)
    expect(teamBoostsLeft(0, 3, 5)).toBe(0)
  })

  it('says when one was fired, once, and gives the kart the rest', () => {
    const rider = createTeamRider({ teamBoosts: 0, teamUsed: 0 })
    let kart = cruising()
    // Nothing held: the kart is told so (a team race's kart always has the fields)
    let out = rider.step(kart, { teamBoosts: 0, teamUsed: 0 })
    expect(out.fired).toBe(false)
    expect(out.kart.teamBoosts).toBe(0)
    // The room hands out two
    out = rider.step(out.kart, { teamBoosts: 2, teamUsed: 0 })
    expect(out.kart.teamBoosts).toBe(2)
    kart = stepKart(out.kart, { ...GO, boost: true })
    out = rider.step(kart, { teamBoosts: 2, teamUsed: 0 })
    expect(out.fired).toBe(true)
    // The room has not heard yet: one left, not two
    expect(out.kart.teamBoosts).toBe(1)
    kart = stepKart(out.kart, GO)
    out = rider.step(kart, { teamBoosts: 2, teamUsed: 0 })
    expect(out.fired).toBe(false)
    expect(out.kart.teamBoosts).toBe(1)
    // The room counted it
    out = rider.step(stepKart(out.kart, GO), { teamBoosts: 1, teamUsed: 1 })
    expect(out.kart.teamBoosts).toBe(1)
  })

  it('forgets a fire the room never heard of, after a while', () => {
    const rider = createTeamRider({ teamBoosts: 1, teamUsed: 0 })
    let out = rider.step(cruising(), { teamBoosts: 1, teamUsed: 0 })
    let kart = stepKart(out.kart, { ...GO, boost: true })
    out = rider.step(kart, { teamBoosts: 1, teamUsed: 0 })
    expect(out.kart.teamBoosts).toBe(0)
    for (let step = 0; step < 301; step++) {
      kart = stepKart(out.kart, GO)
      out = rider.step(kart, { teamBoosts: 1, teamUsed: 0 })
    }
    expect(out.kart.teamBoosts).toBe(1)
  })

  it('starts from the count of the room for a page that comes back mid-race', () => {
    const rider = createTeamRider({ teamBoosts: 1, teamUsed: 3 })
    expect(rider.step(cruising(), { teamBoosts: 1, teamUsed: 3 }).kart.teamBoosts).toBe(1)
  })
})

// ── The room ──────────────────────────────────────────────────────────────────────────────────────

const GO_AT = 1_000_000

function act(state: KartState, action: KartAction, actor: Actor = 'system'): KartState {
  const next = kart.reduce(state, action, actor, createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refused = (state: KartState, action: unknown, actor: Actor = 'system') =>
  isGameError(kart.reduce(state, action as KartAction, actor, createRng(7)))

/** A team race of `seats`, everyone loaded and GO passed */
function teamRace(seats: number, mode: 'items' | 'race' = 'race', laps = 3): KartState {
  let state = kart.init(
    makeSeats(seats),
    { track: 'riverside', laps, mode, teams: 'teams' },
    createRng(1),
  )
  for (let seat = 0; seat < seats; seat++) state = act(state, { t: 'loaded' }, seat)
  return act(act(state, { t: 'schedule', goAt: GO_AT }), { t: 'go' })
}

/** Feeds frames in as the room host does, applying what comes of them */
function feed(
  state: KartState,
  memory: RealtimeMemory,
  seat: number,
  data: Uint8Array,
  now: number,
): { state: KartState; actions: KartAction[] } {
  const answer = kart.realtime!.frame(state, memory, seat, data, now)
  let next = state
  for (const action of answer.actions) next = act(next, action)
  return { state: next, actions: answer.actions }
}

describe('a team race in the room', () => {
  it('puts everyone on a side, in either mode, and only when asked', () => {
    for (const mode of ['items', 'race'] as const) {
      const state = teamRace(4, mode)
      expect(state.teams).toEqual({ gauge: [0, 0], fills: [0, 0] })
      expect(state.racers.map((racer) => racer.team)).toEqual([0, 1, 0, 1])
      expect(state.racers.every((racer) => racer.teamBoosts === 0 && racer.teamUsed === 0)).toBe(
        true,
      )
    }
    const solo = kart.init(makeSeats(4), { track: 'riverside', laps: 3, mode: 'race' }, createRng(1))
    expect(solo.teams).toBeUndefined()
    expect(solo.racers.every((racer) => racer.team === undefined)).toBe(true)
    // The sides chosen in the waiting room come in with the seats
    const chosen = kart.init(
      [{ id: 0, team: 1 }, { id: 1, team: 1 }, { id: 2 }, { id: 3 }],
      { track: 'riverside', laps: 3, mode: 'race', teams: 'teams' },
      createRng(1),
    )
    expect(chosen.racers.map((racer) => racer.team)).toEqual([1, 1, 0, 0])
  })

  it('fills a gauge from the frames of a drifting kart, in steps, for its side only', () => {
    const track = raceTrack('riverside')!
    let state = teamRace(4)
    const memory = kart.realtime!.memory()
    const frames = driveFrames(track, 0)
    let now = GO_AT
    const told: number[] = []
    for (let i = 0; i < 40; i++) {
      now += 50
      const frame = { ...frames.next().value!, drifting: true }
      const out = feed(state, memory, 0, bytes(frame), now)
      state = out.state
      for (const action of out.actions) if (action.t === 'tgauge') told.push(action.gauge)
    }
    // 39 gaps of 50 ms at 50 m/s for a side of two: 14 × (50 / 68) × 1.95 / 2, about 10 points
    expect(state.teams!.gauge[0]).toBe(8)
    expect(state.teams!.gauge[1]).toBe(0)
    // Told only when it moves on a step, not every frame
    expect(told).toEqual([4, 8])
    // A kart that does not drift fills nothing
    const others = driveFrames(track, 1)
    for (let i = 0; i < 40; i++) {
      now += 50
      state = feed(state, memory, 1, bytes(others.next().value!), now).state
    }
    expect(state.teams!.gauge).toEqual([8, 0])
  })

  it('hands every kart of the side a team boost when the gauge fills, up to two', () => {
    const track = raceTrack('riverside')!
    let state = teamRace(4)
    const memory = kart.realtime!.memory()
    const frames = driveFrames(track, 0)
    const rest = [1, 2, 3].map((seat) => driveFrames(track, seat, 1))
    let now = GO_AT
    let fills = 0
    for (let i = 0; i < 1300 && fills < 3; i++) {
      now += 50
      // The others drive on slowly without drifting: heard from, so that none drops out
      rest.forEach((other, index) => {
        state = feed(state, memory, index + 1, bytes(other.next().value!), now).state
      })
      const frame = { ...frames.next().value!, drifting: true }
      const out = feed(state, memory, 0, bytes(frame), now)
      state = out.state
      if (out.actions.some((action) => action.t === 'tfill')) {
        fills++
        const held = Math.min(TEAM_BOOST.maxHeld, fills)
        expect(state.racers.map((racer) => racer.teamBoosts)).toEqual([held, 0, held, 0])
        expect(state.teams!.gauge[0]).toBe(0)
        expect(state.teams!.fills).toEqual([fills, 0])
      }
      if (state.phase !== 'racing') break
    }
    expect(fills).toBeGreaterThanOrEqual(2)
  })

  it('gives none to a kart of the side that has finished or dropped out', () => {
    let state = teamRace(4, 'race', 1)
    state = act(state, { t: 'lap', seat: 2, ms: 30_000 })
    state = act(state, { t: 'tfill', team: 0 })
    expect(state.racers.map((racer) => racer.teamBoosts)).toEqual([1, 0, 0, 0])
    state = act(state, { t: 'retire', seat: 1 })
    state = act(state, { t: 'tfill', team: 1 })
    expect(state.racers.map((racer) => racer.teamBoosts)).toEqual([1, 0, 0, 1])
  })

  it('takes a team boost fired by a kart that holds one, and no other', () => {
    let state = act(teamRace(4), { t: 'tfill', team: 0 })
    const memory = kart.realtime!.memory()
    const fire = encodeItemFrame({ op: 'team', tick: 100 })
    expect(decodeItemFrame(fire)).toEqual({ op: 'team', tick: 100 })
    // Blue holds none: nothing comes of it, and it is never passed on
    const blue = kart.realtime!.frame(state, memory, 1, fire, GO_AT + 5_000)
    expect(blue).toEqual({ relay: null, actions: [] })
    const out = feed(state, memory, 0, fire, GO_AT + 5_000)
    expect(out.actions).toEqual([{ t: 'tfire', seat: 0, at: GO_AT + 5_000 }])
    state = out.state
    expect(state.racers[0]).toMatchObject({
      teamBoosts: 0,
      teamUsed: 1,
      teamUntil: GO_AT + 5_000 + TEAM_BOOST_MS,
    })
    // Its team-mate still has its own
    expect(state.racers[2]!.teamBoosts).toBe(1)
    // None left: a second is not taken
    expect(feed(state, memory, 0, fire, GO_AT + 6_000).actions).toEqual([])
  })

  it('takes none of it from a player, in a race without sides, or once the race is over', () => {
    const state = act(teamRace(2), { t: 'tfill', team: 0 })
    for (const action of [
      { t: 'tgauge', team: 0, gauge: 40 },
      { t: 'tfill', team: 0 },
      { t: 'tfire', seat: 0, at: GO_AT + 1 },
    ]) {
      expect(refused(state, action, 0)).toBe(true)
    }
    expect(refused(state, { t: 'tgauge', team: 2, gauge: 40 })).toBe(true)
    expect(refused(state, { t: 'tgauge', team: 0, gauge: 100 })).toBe(true)
    expect(refused(state, { t: 'tfire', seat: 1, at: GO_AT + 1 })).toBe(true)
    // A race of everyone for themselves knows no team boost
    let solo = kart.init(makeSeats(2), { track: 'riverside', laps: 1, mode: 'race' }, createRng(1))
    for (const seat of [0, 1]) solo = act(solo, { t: 'loaded' }, seat)
    solo = act(act(solo, { t: 'schedule', goAt: GO_AT }), { t: 'go' })
    expect(refused(solo, { t: 'tfill', team: 0 })).toBe(true)
    const memory = kart.realtime!.memory()
    const fire = encodeItemFrame({ op: 'team', tick: 1 })
    expect(kart.realtime!.frame(solo, memory, 0, fire, GO_AT + 1).actions).toEqual([])
    const over = act(state, { t: 'close' })
    expect(refused(over, { t: 'tfill', team: 0 })).toBe(true)
    expect(kart.realtime!.frame(over, memory, 0, fire, GO_AT + 1).actions).toEqual([])
  })

  it('starts the gauge again from the state when the room has forgotten the fraction', () => {
    const track = raceTrack('riverside')!
    let state = act(teamRace(2), { t: 'tgauge', team: 0, gauge: 96 })
    // A room woken from sleep: new memory
    const memory = kart.realtime!.memory()
    const frames = driveFrames(track, 0)
    let now = GO_AT
    let filled = false
    for (let i = 0; i < 12 && !filled; i++) {
      now += 50
      const out = feed(state, memory, 0, bytes({ ...frames.next().value!, drifting: true }), now)
      state = out.state
      filled = out.actions.some((action) => action.t === 'tfill')
    }
    expect(filled).toBe(true)
  })

  it('scores the finish by side and says who won, with everyone their points', () => {
    let state = teamRace(4, 'race', 1)
    state = act(state, { t: 'lap', seat: 1, ms: 30_000 })
    state = act(state, { t: 'lap', seat: 0, ms: 31_000 })
    state = act(state, { t: 'lap', seat: 2, ms: 32_000 })
    expect(teamScore(state).totals).toEqual([14, 10])
    state = act(state, { t: 'close' })
    const result = kart.result(state)
    // Blue: first (10) and not home (0); red: second and third (8 + 6)
    expect(result.summary).toEqual({ key: 'games.kart.result.redWon', params: { red: 14, blue: 10 } })
    expect(result.standings.map((line) => [line.seat, line.rank, line.score])).toEqual([
      [1, 1, 10],
      [0, 2, 8],
      [2, 3, 6],
      [3, 4, 0],
    ])
    expect(result.standings.map((line) => line.note.key)).toEqual([
      'games.kart.note.blueTime',
      'games.kart.note.redTime',
      'games.kart.note.redTime',
      'games.kart.note.blueOut',
    ])
    // Nobody home: neither side wins
    const none = kart.result(act(teamRace(2), { t: 'close' }))
    expect(none.summary).toEqual({ key: 'games.kart.result.teamDraw' })
  })
})

describe('items in a team race pass team-mates by', () => {
  const track = raceTrack('riverside')!
  const NOW = GO_AT + 10_000

  /** The room has seen `seat` just past gate `passed` on lap 1 */
  function place(state: KartState, memory: RealtimeMemory, seat: number, passed: number) {
    const gate = track.gates[passed]!
    const frame = {
      ...driveFrames(track, seat).next().value!,
      tick: 600,
      x: (gate.ax + gate.bx) / 2,
      z: (gate.az + gate.bz) / 2,
      vz: 0,
      crossings: 1,
      nextGate: passed + 1,
    }
    expect(kart.realtime!.frame(state, memory, seat, bytes(frame), NOW).relay).not.toBeNull()
  }

  /** Red 0 at the back, its team-mate 2 just ahead, then blue 1 and blue 3 */
  function field() {
    const state = teamRace(4, 'items')
    const memory = kart.realtime!.memory()
    place(state, memory, 0, 2)
    place(state, memory, 2, 3)
    place(state, memory, 1, 4)
    place(state, memory, 3, 5)
    return { state, memory }
  }

  const use = (state: KartState, memory: RealtimeMemory, item: 'headwind' | 'tow' | 'cloud') => {
    const held: KartState = {
      ...state,
      racers: state.racers.map((racer) => (racer.seat === 0 ? { ...racer, item } : racer)),
    }
    const frame = encodeItemFrame({ op: 'use', item, tick: 600 })
    return kart.realtime!.frame(held, memory, 0, frame, NOW).actions
  }

  it('a headwind slows only the other side', () => {
    const { state, memory } = field()
    expect(use(state, memory, 'headwind')).toMatchObject([{ t: 'use', targets: [3, 1] }])
  })

  it('a tow still pulls towards a team-mate, and a cloud goes for the nearest of the other side', () => {
    const { state, memory } = field()
    expect(use(state, memory, 'tow')).toMatchObject([{ t: 'use', targets: [2] }])
    expect(use(state, memory, 'cloud')).toMatchObject([{ t: 'use', targets: [1] }])
  })

  it('with only team-mates ahead there is nobody for a headwind', () => {
    const state = teamRace(4, 'items')
    const memory = kart.realtime!.memory()
    place(state, memory, 0, 2)
    place(state, memory, 2, 3)
    place(state, memory, 1, 1)
    place(state, memory, 3, 0)
    expect(use(state, memory, 'headwind')).toEqual([])
  })

  it('a shot of a team-mate cannot hit, one of the other side or of the kart itself can', () => {
    const teamOf = (seat: number) => ([0, 1, 0, 1] as const)[seat]
    const shots = [{ by: 0 }, { by: 1 }, { by: 2 }, { by: 3 }]
    expect(foeShots(shots, 0, teamOf).map((shot) => shot.by)).toEqual([0, 1, 3])
    expect(foeShots(shots, 3, teamOf).map((shot) => shot.by)).toEqual([0, 2, 3])
    // A race of everyone for themselves: every shot
    expect(foeShots(shots, 0, () => undefined)).toHaveLength(4)
  })
})

describe('a team race of computer karts in a room run here', () => {
  it('fills the gauges, hands out team boosts that the karts fire, and ends with a side winning', () => {
    let now = 1_000_000
    const track = raceTrack('riverside')!
    const room = createLocalRoom({
      seats: 6,
      options: { track: 'riverside', laps: 3, mode: 'race', teams: 'teams' },
      seed: 7,
      now: () => now,
    })
    const race = createBotRace({
      room,
      track,
      laps: 3,
      bots: botSeats(drawBots(6, 7), 0, 'hard'),
      players: [],
      seed: 7,
      now,
    })
    for (let ms = 0; room.state().phase !== 'finished' && ms < 10 * 60_000; ms += 50) {
      now += 50
      race.advance(now)
    }
    race.stop()
    const state = room.state()
    expect(state.phase).toBe('finished')
    expect(state.racers.map((racer) => racer.team)).toEqual([0, 1, 0, 1, 0, 1])
    expect(state.racers.every((racer) => racer.finishMs !== null)).toBe(true)
    // Both sides drifted their gauge full at least once, and the karts burnt what they got
    expect(state.teams!.fills[0]).toBeGreaterThan(0)
    expect(state.teams!.fills[1]).toBeGreaterThan(0)
    const used = state.racers.reduce((sum, racer) => sum + (racer.teamUsed ?? 0), 0)
    expect(used).toBeGreaterThan(0)
    // Never more held than the room handed out
    for (const racer of state.racers) {
      expect((racer.teamUsed ?? 0) + (racer.teamBoosts ?? 0)).toBeLessThanOrEqual(
        state.teams!.fills[racer.team!],
      )
    }
    const result = kart.result(state)
    expect(result.summary.key).toMatch(/^games\.kart\.result\.(red|blue)Won$/)
    const total = result.standings.reduce((sum, line) => sum + (line.score ?? 0), 0)
    expect(total).toBe(10 + 8 + 6 + 5 + 4 + 3)
  }, 60_000)
})
