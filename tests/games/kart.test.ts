import { describe, expect, it } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import {
  CLOSE_AFTER_FINISH_MS,
  COUNTDOWN_MS,
  kart,
  LOAD_WAIT_MS,
  RETIRE_AFTER_MS,
} from '../../shared/games/kart/rules.ts'
import type { KartAction, KartState } from '../../shared/games/kart/types.ts'
import { isGameError, type Actor, type RealtimeMemory } from '../../shared/games/types.ts'
import type { KartFrame } from '../../shared/kart/net.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { bytes, driveFrames } from '../kart/raceDriver.ts'
import { playRandom } from './harness.ts'

const start = (seats: number, laps = 3, track = 'riverside') =>
  kart.init(makeSeats(seats), { track, laps, mode: 'race' }, createRng(1))

function act(state: KartState, action: KartAction, actor: Actor = 'system'): KartState {
  const next = kart.reduce(state, action, actor, createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refused = (state: KartState, action: unknown, actor: Actor = 'system') =>
  isGameError(kart.reduce(state, action as KartAction, actor, createRng(7)))

/** Everyone loaded, GO set and passed */
function racing(seats: number, laps = 3, goAt = 1_000_000): KartState {
  let state = start(seats, laps)
  for (let seat = 0; seat < seats; seat++) state = act(state, { t: 'loaded' }, seat)
  state = act(state, { t: 'schedule', goAt })
  return act(state, { t: 'go' })
}

describe('the race room in the lobby (e9-t07)', () => {
  it('is listed, for one to eight, with a track for every track in the registry', () => {
    const info = LOBBY_GAMES.find((game) => game.id === 'kart')
    expect(info?.meta).toMatchObject({ minPlayers: 1, maxPlayers: 8, tryAlone: '/kart' })
    const track = kart.options.track
    if (track.kind !== 'select') throw new Error('the track is chosen from a list')
    // e10-t08: and a track made in the editor
    expect(track.choices.map((choice) => choice.value)).toEqual([...RACE_TRACK_IDS, 'custom'])
    for (const id of RACE_TRACK_IDS) {
      expect(GAME_MESSAGES.en[`games.kart.track.${id}`]).toBeTruthy()
      expect(GAME_MESSAGES['zh-TW'][`games.kart.track.${id}`]).toBeTruthy()
    }
    expect(getGame('kart')).toBe(kart)
    expect(GAME_MESSAGES.en['games.kart.name']).toBe('Kart')
  })

  it('has its screen strings in both languages', () => {
    const keys = Object.keys(SCREEN_MESSAGES.en).filter((key) => key.startsWith('games.kart.'))
    expect(keys.length).toBeGreaterThan(5)
    for (const key of keys) expect(SCREEN_MESSAGES['zh-TW'][key]).toBeTruthy()
  })

  it('falls back to the first track for one it does not know, and keeps the laps in range', () => {
    const state = kart.init(makeSeats(2), { track: 'nope', laps: 99, mode: 'race' }, createRng(1))
    expect(state.track).toBe(RACE_TRACK_IDS[0])
    expect(state.laps).toBe(9)
  })
})

describe('the race (e9-t07, e9-t08)', () => {
  it('plays out at random to a result', () => {
    for (const seats of [1, 2, 8]) {
      for (const seed of [1, 2, 3]) playRandom(kart, { seed, seats })
    }
  })

  it('counts down once everyone is on the grid, from the room clock', () => {
    let state = start(2)
    expect(kart.timers?.(state)).toEqual([{ id: 'load', ms: LOAD_WAIT_MS, action: { t: 'start' } }])
    expect(kart.legalActions(state, 0)).toEqual([{ t: 'loaded' }])
    state = act(state, { t: 'loaded' }, 0)
    expect(state.phase).toBe('loading')
    expect(kart.legalActions(state, 0)).toEqual([])
    expect(refused(state, { t: 'loaded' }, 0)).toBe(true)
    state = act(state, { t: 'loaded' }, 1)
    expect(state.phase).toBe('countdown')
    expect(kart.timers?.(state)).toEqual([{ id: 'go', ms: COUNTDOWN_MS, action: { t: 'go' } }])
    // The clock sets GO, once
    expect(kart.realtime?.clock?.(state, 5000)).toEqual([
      { t: 'schedule', goAt: 5000 + COUNTDOWN_MS },
    ])
    state = act(state, { t: 'schedule', goAt: 9000 })
    expect(kart.realtime?.clock?.(state, 5000)).toEqual([])
    expect(refused(state, { t: 'schedule', goAt: 1 })).toBe(true)
    state = act(state, { t: 'go' })
    expect(state.phase).toBe('racing')
  })

  it('starts without whoever has not loaded when the wait runs out', () => {
    const state = act(act(start(3), { t: 'loaded' }, 0), { t: 'start' })
    expect(state.phase).toBe('countdown')
  })

  it('takes only its own actions from a player', () => {
    const state = start(2)
    for (const action of [
      { t: 'start' },
      { t: 'go' },
      { t: 'lap', seat: 0, ms: 1 },
      { t: 'close' },
    ]) {
      expect(refused(state, action, 0)).toBe(true)
    }
    expect(refused(state, { t: 'loaded' }, 'system')).toBe(true)
    expect(refused(state, { t: 'loaded' }, 5)).toBe(true)
  })

  it('counts laps, finishes, ranks by time and closes once everyone is done', () => {
    let state = racing(3, 2)
    state = act(state, { t: 'lap', seat: 1, ms: 40_000 })
    state = act(state, { t: 'lap', seat: 0, ms: 41_000 })
    expect(state.racers[1]!.lapMs).toEqual([40_000])
    // A lap time before the last is a bug, refused
    expect(refused(state, { t: 'lap', seat: 1, ms: 30_000 })).toBe(true)
    state = act(state, { t: 'lap', seat: 0, ms: 80_000 })
    expect(state.racers[0]).toMatchObject({ lapMs: [41_000, 39_000], finishMs: 80_000 })
    expect(kart.timers?.(state).map((timer) => timer.id)).toEqual(['cap', 'close'])
    expect(kart.timers?.(state)[1]).toMatchObject({ ms: CLOSE_AFTER_FINISH_MS })
    // A finished kart counts no more laps
    expect(refused(state, { t: 'lap', seat: 0, ms: 90_000 })).toBe(true)
    state = act(state, { t: 'lap', seat: 1, ms: 81_500 })
    state = act(state, { t: 'retire', seat: 2 })
    expect(kart.isOver(state)).toBe(true)
    const result = kart.result(state)
    expect(result.standings.map((line) => [line.seat, line.rank])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    expect(result.standings[0]!.note).toEqual({
      key: 'games.kart.note.time',
      params: { time: '1:20.000' },
    })
    expect(result.standings[2]!.note).toEqual({ key: 'games.kart.note.out', params: { laps: 0 } })
  })

  it('closes on time, everyone still out on the track dropping out, ranked by laps', () => {
    let state = racing(3, 3)
    state = act(state, { t: 'lap', seat: 2, ms: 40_000 })
    state = act(state, { t: 'close' })
    expect(state.phase).toBe('finished')
    const result = kart.result(state)
    expect(result.standings.map((line) => [line.seat, line.rank])).toEqual([
      [2, 1],
      [0, 2],
      [1, 2],
    ])
  })
})

describe('the race judged from frames (e9-t02)', () => {
  const GO = 1_000_000
  const track = raceTrack('riverside')!

  function raceFrames(state: KartState, seats: number, frames: number) {
    const memory: RealtimeMemory = kart.realtime!.memory()
    const sources = Array.from({ length: seats }, (_, seat) => driveFrames(track, seat, 2.5))
    let current = state
    const relayed: number[] = []
    for (let i = 0; i < frames && current.phase === 'racing'; i++) {
      for (let seat = 0; seat < seats; seat++) {
        const frame = sources[seat]!.next().value as KartFrame
        const now = GO + (frame.tick / 60) * 1000
        const answer = kart.realtime!.frame(current, memory, seat, bytes(frame), now)
        if (answer.relay) relayed.push(seat)
        for (const action of answer.actions) current = act(current, action)
      }
    }
    return { state: current, relayed }
  }

  it('turns the laps the server sees into lap actions, and a finish', () => {
    const { state, relayed } = raceFrames(racing(2, 1, GO), 2, 3000)
    expect(relayed.length).toBeGreaterThan(0)
    expect(state.phase).toBe('finished')
    for (const racer of state.racers) {
      expect(racer.finishMs).not.toBeNull()
      expect(racer.finishMs! / 1000).toBeGreaterThan(30)
    }
  })

  it('passes a frame on and judges nothing while karts load', () => {
    const state = start(2)
    const memory = kart.realtime!.memory()
    const frame = driveFrames(track, 0).next().value as KartFrame
    const answer = kart.realtime!.frame(state, memory, 0, bytes({ ...frame, tick: -240 }), GO)
    expect(answer.relay).not.toBeNull()
    expect(answer.actions).toEqual([])
  })

  it('drops what is not a frame, and frames from a seat not racing', () => {
    const state = racing(2, 3, GO)
    const memory = kart.realtime!.memory()
    expect(kart.realtime!.frame(state, memory, 0, new Uint8Array(5), GO).relay).toBeNull()
    const frame = driveFrames(track, 0).next().value as KartFrame
    expect(kart.realtime!.frame(state, memory, 7, bytes(frame), GO).relay).toBeNull()
  })

  it('drops out a kart not heard from for too long', () => {
    const state = racing(2, 3, GO)
    const memory = kart.realtime!.memory()
    const source = driveFrames(track, 0)
    const frame = source.next().value as KartFrame
    const early = kart.realtime!.frame(state, memory, 0, bytes(frame), GO + 1000)
    expect(early.actions).toEqual([])
    const later = source.next().value as KartFrame
    const late = kart.realtime!.frame(
      state,
      memory,
      0,
      bytes({ ...later, tick: (RETIRE_AFTER_MS / 1000) * 60 + 60 }),
      GO + RETIRE_AFTER_MS + 2000,
    )
    expect(late.actions).toContainEqual({ t: 'retire', seat: 1 })
  })
})
