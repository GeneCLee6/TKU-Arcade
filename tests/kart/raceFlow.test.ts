import { afterEach, describe, expect, it } from 'vitest'
import { kart, CLOSE_GRACE_MS } from '../../shared/games/kart/rules.ts'
import type { KartAction, KartState } from '../../shared/games/kart/types.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { createRng } from '../../shared/games/rng.ts'
import { isGameError, type Actor, type RealtimeMemory } from '../../shared/games/types.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import {
  CLOSE_AFTER_FINISH_MS,
  closeAt,
  COUNT_MS,
  countdownMs,
  introMs,
  openingStage,
  PRESENT_MS,
} from '../../shared/kart/opening.ts'
import { gridSpot } from '../../shared/kart/race.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import type { Track } from '../../shared/kart/track.ts'
import { openingShot, presentShot, gridShot } from '../../src/kart/director.ts'
import { closeBeep, startBeep, BEEPS } from '../../src/kart/audio/countBeeps.ts'
import {
  cappedPost,
  DEFAULT_SETTINGS,
  forgetSettingsForTest,
  loadSettings,
  parseSettings,
  saveSettings,
} from '../../src/kart/settings.ts'
import {
  isRacePaused,
  pauseRace,
  raceEpochNow,
  raceNow,
  resumeRace,
} from '../../src/kart/race/raceClock.ts'
import { advanceClock } from '../../shared/kart/clock.ts'
import {
  CEREMONY_MS,
  podiumCamera,
  podiumSeats,
  REVEAL_AT,
  revealed,
  PODIUM_GESTURE,
} from '../../src/kart/ceremony/podium.ts'
import { gesturePose } from '../../src/kart/driverGestures.ts'
import { bytes, driveFrames } from './raceDriver.ts'

// 2026-11-22 (owner: "Esc pauses, a ten-second countdown after the first finish, a podium, each
// driver's face at the start, sounds for 3-2-1-GO, a settings menu"; docs/ARCHITECTURE.md §4.68)

const track = raceTrack('riverside') as Track
const GO = 1_000_000

function act(state: KartState, action: KartAction, actor: Actor = 'system'): KartState {
  const next = kart.reduce(state, action, actor, createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

function racing(seats: number, laps = 1): KartState {
  let state = kart.init(makeSeats(seats), { track: 'riverside', laps, mode: 'race' }, createRng(1))
  for (let seat = 0; seat < seats; seat++) state = act(state, { t: 'loaded' }, seat)
  state = act(state, { t: 'schedule', goAt: GO })
  return act(state, { t: 'go' })
}

describe('the opening: each driver, then 3, 2, 1', () => {
  it('keeps the whole opening of a full grid within ten seconds, the drivers within six', () => {
    expect(countdownMs(8)).toBeLessThanOrEqual(10_000)
    expect(8 * PRESENT_MS).toBeLessThanOrEqual(6_000)
    expect(PRESENT_MS).toBeGreaterThanOrEqual(600)
    expect(PRESENT_MS).toBeLessThanOrEqual(1_000)
    // A smaller field waits less, and never past eight
    expect(countdownMs(2)).toBeLessThan(countdownMs(8))
    expect(countdownMs(12)).toBe(countdownMs(8))
    expect(countdownMs(4)).toBe(introMs(4) + COUNT_MS)
  })

  it('presents every driver in grid order, pole first, then settles, then counts', () => {
    const racers = 5
    const seen: number[] = []
    for (let left = countdownMs(racers) / 1000 - 1e-6; left > 0; left -= 1 / 60) {
      const stage = openingStage(left, racers)!
      if (stage.kind === 'present' && seen.at(-1) !== stage.index) seen.push(stage.index)
      if (left <= COUNT_MS / 1000) expect(stage.kind).toBe('count')
    }
    expect(seen).toEqual([0, 1, 2, 3, 4])
    expect(openingStage(3.5, racers)).toMatchObject({ kind: 'settle' })
    expect(openingStage(null, racers)).toBeNull()
  })

  it('stands in front of each driver, and glides to the grid shot before the 3', () => {
    const spots = Array.from({ length: 4 }, (_, slot) => gridSpot(track, slot))
    const look = { drivers: true, flyby: true }
    const first = openingShot(spots, countdownMs(4) / 1000 - 0.01, look)!
    const pole = spots[0]!
    const ahead = { x: Math.sin(pole.heading), z: -Math.cos(pole.heading) }
    // In front of the pole sitter, looking back at them
    expect((first.eye.x - pole.x) * ahead.x + (first.eye.z - pole.z) * ahead.z).toBeGreaterThan(2)
    expect(Math.hypot(first.target.x - pole.x, first.target.z - pole.z)).toBeLessThan(0.01)
    // The end of the glide is the grid shot
    const grid = gridShot(spots)!
    const settled = openingShot(spots, COUNT_MS / 1000 + 1e-4, look)!
    expect(Math.hypot(settled.eye.x - grid.eye.x, settled.eye.z - grid.eye.z)).toBeLessThan(0.05)
    // From the 3 on, the countdown's own shot
    expect(openingShot(spots, 2.5, look)).toBeNull()
    // Turned off, the fly round; both off, nothing of its own
    expect(openingShot(spots, 5, { drivers: false, flyby: true })).not.toBeNull()
    expect(openingShot(spots, 5, { drivers: false, flyby: false })).toBeNull()
    // Less motion asked for: a still shot of each driver
    expect(presentShot(pole, 0, 0, true)).toEqual(presentShot(pole, 1, 0, true))
  })

  it('beeps at 3, 2, 1 and a brighter GO, once each', () => {
    const beeps: string[] = []
    let before: number | null = 9.6
    for (let left = 9.6; left > -0.5; left -= 1 / 60) {
      const beep = startBeep(before, left)
      if (beep) beeps.push(beep)
      before = left
    }
    expect(beeps).toEqual(['count', 'count', 'count', 'go'])
    // GO is higher and rings longer than a count
    expect(BEEPS.go.notes[0]!.hz).toBeGreaterThan(BEEPS.count.notes[0]!.hz)
    expect(BEEPS.go.decay).toBeGreaterThan(BEEPS.count.decay)
  })
})

describe('the ten seconds after the first finish', () => {
  it('ticks each second from ten, higher for the last three, then time up', () => {
    const beeps: string[] = []
    let before: number | null = 10.5
    for (let left = 10.5; left > -0.3; left -= 0.1) {
      const beep = closeBeep(before, left)
      if (beep) beeps.push(beep)
      before = left
    }
    expect(beeps).toEqual([...Array(7).fill('close'), 'closeLast', 'closeLast', 'closeLast', 'timeUp'])
  })

  it('closes ten seconds after the first finish', () => {
    expect(CLOSE_AFTER_FINISH_MS).toBe(10_000)
    let state = racing(3)
    expect(closeAt(state)).toBeNull()
    state = act(state, { t: 'lap', seat: 1, ms: 50_000 })
    expect(closeAt(state)).toBe(GO + 50_000 + CLOSE_AFTER_FINISH_MS)
    // The room's own timer is only the backstop, a little after
    const close = kart.timers?.(state).find((timer) => timer.id === 'close')
    expect(close?.ms).toBe(CLOSE_AFTER_FINISH_MS + CLOSE_GRACE_MS)
  })

  it('is closed by the first frame after the moment, placing those still out by how far round they came', () => {
    let state = racing(3)
    const memory: RealtimeMemory = kart.realtime!.memory()
    // A fast kart, a middling one and a slow one
    const sources = [driveFrames(track, 0, 4), driveFrames(track, 1, 2.5), driveFrames(track, 2, 1.5)]
    let closedAt: number | null = null
    let closing: KartAction | undefined
    for (let i = 0; i < 6000 && state.phase === 'racing'; i++) {
      for (let seat = 0; seat < 3 && state.phase === 'racing'; seat++) {
        const frame = sources[seat]!.next().value as KartFrame
        const now = GO + (frame.tick / 60) * 1000
        const answer = kart.realtime!.frame(state, memory, seat, bytes(frame), now)
        for (const action of answer.actions) {
          if (action.t === 'close') {
            closedAt = now
            closing = action
          }
          state = act(state, action)
        }
      }
    }
    expect(state.phase).toBe('finished')
    const first = state.racers[0]!.finishMs!
    expect(first).not.toBeNull()
    // Within a frame of the moment
    expect(closedAt! - (GO + first + CLOSE_AFTER_FINISH_MS)).toBeGreaterThanOrEqual(0)
    expect(closedAt! - (GO + first + CLOSE_AFTER_FINISH_MS)).toBeLessThan(200)
    expect(closing).toMatchObject({ t: 'close' })
    const [, middling, slow] = state.racers
    expect(middling!.out && slow!.out).toBe(true)
    expect(middling!.progress!).toBeGreaterThan(slow!.progress!)
    expect(middling!.progress!).toBeLessThan(1)
    const { standings } = kart.result(state)
    expect(standings.map((line) => [line.seat, line.rank])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    expect(standings[1]!.note.key).toBe('games.kart.note.out')
  })

  it('places those not seen when it closed by laps, and refuses a progress list that is not one', () => {
    let state = racing(4, 2)
    state = act(state, { t: 'lap', seat: 0, ms: 40_000 })
    state = act(state, { t: 'lap', seat: 0, ms: 80_000 })
    state = act(state, { t: 'lap', seat: 3, ms: 45_000 })
    for (const bad of [{ t: 'close', progress: 'far' }, { t: 'close', progress: [{ seat: 1, at: -1 }] }]) {
      expect(isGameError(kart.reduce(state, bad as KartAction, 'system', createRng(1)))).toBe(true)
    }
    state = act(state, { t: 'close', progress: [{ seat: 1, at: 0.4 }, { seat: 2, at: 0.9 }] })
    const ranks = kart.result(state).standings.map((line) => [line.seat, line.rank])
    // Seat 3 has a lap done (1), ahead of 2 (0.9) and 1 (0.4)
    expect(ranks).toEqual([
      [0, 1],
      [3, 2],
      [2, 3],
      [1, 4],
    ])
    // No player may close a race
    expect(isGameError(kart.reduce(racing(2), { t: 'close' }, 0, createRng(1)))).toBe(true)
  })

  it('scores a team race and its DNFs as before: those home in order, nothing for the rest', () => {
    let state = kart.init(
      makeSeats(4),
      { track: 'riverside', laps: 1, mode: 'race', teams: 'teams' },
      createRng(1),
    )
    for (let seat = 0; seat < 4; seat++) state = act(state, { t: 'loaded' }, seat)
    state = act(act(state, { t: 'schedule', goAt: GO }), { t: 'go' })
    state = act(state, { t: 'lap', seat: 2, ms: 50_000 })
    state = act(state, { t: 'close', progress: [{ seat: 0, at: 0.8 }, { seat: 1, at: 0.7 }, { seat: 3, at: 0.2 }] })
    const result = kart.result(state)
    const scored = result.standings.filter((line) => (line.score ?? 0) > 0)
    expect(scored.map((line) => line.seat)).toEqual([2])
    expect(result.standings.map((line) => line.seat)).toEqual([2, 0, 1, 3])
  })
})

describe('the pause', () => {
  afterEach(() => resumeRace())

  it('stops the race clock and the room clock together, and starts them again where they were', async () => {
    const before = raceNow()
    const epoch = raceEpochNow()
    pauseRace()
    expect(isRacePaused()).toBe(true)
    const held = raceNow()
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(raceNow()).toBe(held)
    expect(Math.abs(raceEpochNow() - (epoch + (held - before)))).toBeLessThan(5)
    resumeRace()
    expect(isRacePaused()).toBe(false)
    // Picked up where it stopped: the 40 ms paused are not counted
    expect(raceNow() - held).toBeLessThan(20)
  })

  it('takes no physics step while paused (a frame of no time)', () => {
    expect(advanceClock(0, 0).steps).toBe(0)
    expect(advanceClock(0, 1 / 30).steps).toBeGreaterThan(0)
  })
})

describe('the settings', () => {
  afterEach(() => forgetSettingsForTest())

  it('has sensible defaults and reads back field by field', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('{"effects":"ultra","shake":false,"driverIntro":1}')).toEqual({
      ...DEFAULT_SETTINGS,
      shake: false,
    })
    saveSettings({ ...DEFAULT_SETTINGS, effects: 'low', driverIntro: false })
    forgetSettingsForTest()
    expect(loadSettings()).toMatchObject({ effects: 'low', driverIntro: false })
  })

  it('caps the developing of the picture by the effects level', () => {
    expect(cappedPost('full', 'low')).toBe('off')
    expect(cappedPost('full', 'medium')).toBe('bloom')
    expect(cappedPost('bloom', 'high')).toBe('bloom')
    expect(cappedPost('off', 'high')).toBe('off')
  })
})

describe('the podium', () => {
  it('puts the first three home on the steps, never one who did not finish', () => {
    expect(
      podiumSeats([
        { seat: 4, rank: 3 },
        { seat: 1, rank: 1 },
        { seat: 2, rank: 4, out: true },
        { seat: 0, rank: 2 },
        { seat: 5, rank: 5 },
      ]),
    ).toEqual([
      { seat: 1, place: 1 },
      { seat: 0, place: 2 },
      { seat: 4, place: 3 },
    ])
    expect(podiumSeats([{ seat: 0, rank: 1 }, { seat: 1, rank: 2, out: true }])).toEqual([
      { seat: 0, place: 1 },
    ])
  })

  it('reveals third, second, then the winner within the show, and the camera glides in', () => {
    expect(CEREMONY_MS).toBeGreaterThanOrEqual(5_000)
    expect(CEREMONY_MS).toBeLessThanOrEqual(8_000)
    expect(REVEAL_AT[3]).toBeLessThan(REVEAL_AT[2])
    expect(REVEAL_AT[2]).toBeLessThan(REVEAL_AT[1])
    expect(REVEAL_AT[1] * 1000).toBeLessThan(CEREMONY_MS / 2)
    expect(revealed(1, 0)).toBe(false)
    expect(revealed(1, 0, true)).toBe(true)
    const start = podiumCamera(0)
    const end = podiumCamera(3)
    expect(start.eye.z).toBeGreaterThan(end.eye.z)
    expect(podiumCamera(0, true)).toEqual(podiumCamera(5, true))
    // The winner lifts the trophy: both hands high and close together
    expect(PODIUM_GESTURE[1]).toBe('trophy')
    const pose = gesturePose('trophy', 1)
    expect(pose.leftUp).toBeGreaterThan(2.5)
    expect(pose.leftOut).toBeLessThan(0.3)
  })
})
