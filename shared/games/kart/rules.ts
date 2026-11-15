// The kart race room (e9-t02, e9-t07, e9-t08; docs/ARCHITECTURE.md §4.14, docs/KART-NETCODE.md).
// Worker only: it judges laps on the tracks themselves.
//
// loading → countdown → racing → finished. Everyone's browser loads the track and says so; when all
// have (or LOAD_WAIT_MS runs out) the countdown starts, and the room's clock sets GO COUNTDOWN_MS
// later (`realtime.clock`): every browser counts down to that same moment on its own clock, synced
// to the server's (net.ts's clock pings). Then each browser races its own kart and sends frames;
// `realtime.frame` judges them (shared/kart/race.ts) and turns every lap the server sees into a
// `lap` action, the last of them a finish. CLOSE_AFTER_FINISH_MS after the first finish, or once
// everyone is done, the race is over; a kart not heard from for RETIRE_AFTER_MS drops out, and
// RACE_CAP_MS per lap closes a race nobody can end.
import { decodeFrame } from '../../kart/net.ts'
import { judgeFrame, startTracking, type Tracked } from '../../kart/race.ts'
import { formatTime } from '../../kart/timeTrial.ts'
import { raceTrack } from '../../kart/tracks/registry.ts'
import {
  gameError,
  type GameModule,
  type GameResult,
  type RealtimeMemory,
  type SeatId,
  type Standing,
  type TimerSpec,
} from '../types.ts'
import { GAME_META } from '../lobby.ts'
import { kartInfo, MAX_LAPS } from './info.ts'
import type { KartAction, KartOptions, KartRacer, KartState, KartView } from './types.ts'

/** How long the room waits for everyone's track to load before it starts anyway */
export const LOAD_WAIT_MS = 25_000
/** From everyone on the grid to GO: a moment to settle, then 3, 2, 1 */
export const COUNTDOWN_MS = 4_000
/** After the first kart finishes, the others have this long */
export const CLOSE_AFTER_FINISH_MS = 30_000
/** A kart not heard from this long during the race drops out */
export const RETIRE_AFTER_MS = 20_000
/** A race closes after this long per lap, whatever happens */
export const RACE_CAP_MS = 4 * 60_000

const PHASE = 'games.kart.error.phase'
const BAD = 'games.kart.error.badAction'

const done = (racer: KartRacer) => racer.finishMs !== null || racer.out

/** Over once nobody is still out on the track */
function settle(state: KartState): KartState {
  return state.racers.every(done) ? { ...state, phase: 'finished' } : state
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Memory = { tracked: Map<SeatId, Tracked> }

const memoryOf = (memory: RealtimeMemory): Memory => {
  if (!(memory.tracked instanceof Map)) memory.tracked = new Map<SeatId, Tracked>()
  return memory as unknown as Memory
}

function standings(state: KartState): Standing[] {
  const finished = state.racers
    .filter((racer) => racer.finishMs !== null)
    .sort((a, b) => (a.finishMs as number) - (b.finishMs as number) || a.seat - b.seat)
  const rest = state.racers
    .filter((racer) => racer.finishMs === null)
    .sort((a, b) => b.lapMs.length - a.lapMs.length || a.seat - b.seat)
  const lines: Standing[] = finished.map((racer, index) => ({
    seat: racer.seat,
    // Two karts can only tie to the millisecond in theory, and then they share the place
    rank:
      index > 0 && finished[index - 1]!.finishMs === racer.finishMs
        ? finished.findIndex((other) => other.finishMs === racer.finishMs) + 1
        : index + 1,
    score: null,
    note: {
      key: 'games.kart.note.time',
      params: { time: formatTime((racer.finishMs as number) / 1000) },
    },
  }))
  // Those who did not finish share a place by laps done
  rest.forEach((racer, index) => {
    const first = rest.findIndex((other) => other.lapMs.length === racer.lapMs.length)
    lines.push({
      seat: racer.seat,
      rank: finished.length + (first === index ? index : first) + 1,
      score: null,
      note: { key: 'games.kart.note.out', params: { laps: racer.lapMs.length } },
    })
  })
  return lines
}

export const kart: GameModule<KartState, KartAction, KartView, KartOptions> = {
  ...kartInfo,
  meta: GAME_META.kart,

  init(seats, options) {
    const track = raceTrack(options.track) ? options.track : kartInfo.options.track.default
    const laps = Math.max(1, Math.min(MAX_LAPS, Math.round(options.laps)))
    return {
      track,
      laps,
      phase: 'loading',
      goAt: null,
      racers: seats.map((seat) => ({
        seat: seat.id,
        loaded: false,
        lapMs: [],
        finishMs: null,
        out: false,
      })),
    }
  },

  reduce(state, action, actor) {
    if (!isObject(action) || typeof action.t !== 'string') return gameError(BAD)
    const a = action as Record<string, unknown>
    if (action.t === 'loaded') {
      const racer = state.racers.find((one) => one.seat === actor)
      if (actor === 'system' || !racer) return gameError(BAD)
      if (state.phase !== 'loading' || racer.loaded) return gameError(PHASE)
      const racers = state.racers.map((one) => (one === racer ? { ...one, loaded: true } : one))
      const all = racers.every((one) => one.loaded)
      return { ...state, racers, phase: all ? 'countdown' : 'loading' }
    }
    // Everything else is the room's own doing: a timer, the clock or a judged frame
    if (actor !== 'system') return gameError(BAD)
    switch (action.t) {
      case 'start':
        return state.phase === 'loading' ? { ...state, phase: 'countdown' } : gameError(PHASE)
      case 'schedule':
        if (state.phase !== 'countdown' || state.goAt !== null) return gameError(PHASE)
        return typeof a.goAt === 'number' && Number.isFinite(a.goAt)
          ? { ...state, goAt: a.goAt }
          : gameError(BAD)
      case 'go':
        return state.phase === 'countdown' ? { ...state, phase: 'racing' } : gameError(PHASE)
      case 'lap': {
        if (state.phase !== 'racing') return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        const ms = a.ms
        if (!racer || done(racer) || typeof ms !== 'number' || !Number.isFinite(ms)) {
          return gameError(BAD)
        }
        const sofar = racer.lapMs.reduce((sum, lap) => sum + lap, 0)
        if (ms < sofar) return gameError(BAD)
        const lapMs = [...racer.lapMs, Math.round(ms - sofar)]
        const finishMs = lapMs.length >= state.laps ? Math.round(ms) : null
        const racers = state.racers.map((one) =>
          one === racer ? { ...one, lapMs, finishMs } : one,
        )
        return settle({ ...state, racers })
      }
      case 'retire': {
        if (state.phase !== 'racing') return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        if (!racer || done(racer)) return gameError(BAD)
        const racers = state.racers.map((one) => (one === racer ? { ...one, out: true } : one))
        return settle({ ...state, racers })
      }
      case 'close':
        if (state.phase === 'finished') return gameError(PHASE)
        return {
          ...state,
          phase: 'finished',
          racers: state.racers.map((one) => (done(one) ? one : { ...one, out: true })),
        }
      default:
        return gameError(BAD)
    }
  },

  view(state, viewer) {
    return { ...state, you: viewer === 'spectator' ? null : viewer }
  },

  legalActions(state, seat) {
    const racer = state.racers.find((one) => one.seat === seat)
    return state.phase === 'loading' && racer && !racer.loaded ? [{ t: 'loaded' }] : []
  },

  isOver: (state) => state.phase === 'finished',

  result(state): GameResult {
    return { summary: { key: 'games.kart.result.won' }, standings: standings(state) }
  },

  timers(state): TimerSpec<KartAction>[] {
    switch (state.phase) {
      case 'loading':
        return [{ id: 'load', ms: LOAD_WAIT_MS, action: { t: 'start' } }]
      case 'countdown':
        // Started with the countdown, at the very moment `realtime.clock` sets goAt by
        return [{ id: 'go', ms: COUNTDOWN_MS, action: { t: 'go' } }]
      case 'racing': {
        const timers: TimerSpec<KartAction>[] = [
          { id: 'cap', ms: RACE_CAP_MS * state.laps, action: { t: 'close' } },
        ]
        if (state.racers.some((racer) => racer.finishMs !== null)) {
          timers.push({ id: 'close', ms: CLOSE_AFTER_FINISH_MS, action: { t: 'close' } })
        }
        return timers
      }
      default:
        return []
    }
  },

  realtime: {
    memory: () => ({ tracked: new Map<SeatId, Tracked>() }),

    clock(state, now) {
      return state.phase === 'countdown' && state.goAt === null
        ? [{ t: 'schedule', goAt: now + COUNTDOWN_MS }]
        : []
    },

    frame(state, memory, seat, data, now) {
      const frame = decodeFrame(data)
      const racer = state.racers.find((one) => one.seat === seat)
      const track = raceTrack(state.track)
      if (!frame || !racer || !track || state.phase === 'finished') {
        return { relay: null, actions: [] }
      }
      // On the grid, and once a kart is done, its frames only go round to be drawn
      if (state.phase === 'loading' || done(racer)) return { relay: data, actions: [] }
      const { tracked } = memoryOf(memory)
      const slot = state.racers.indexOf(racer)
      const verdict = judgeFrame(tracked.get(seat) ?? startTracking(track, slot), frame, {
        track,
        slot,
        now,
        goAt: state.goAt,
        laps: racer.lapMs.length,
      })
      tracked.set(seat, verdict.tracked)
      if (verdict.kind === 'refused') return { relay: null, actions: [] }
      const actions: KartAction[] = []
      if (verdict.lapAt !== null && state.phase === 'racing') {
        actions.push({ t: 'lap', seat, ms: Math.max(0, verdict.lapAt) })
      }
      // Anyone gone quiet too long drops out; judged whenever someone else's frame comes in
      if (state.phase === 'racing' && state.goAt !== null) {
        for (const other of state.racers) {
          if (other.seat === seat || done(other)) continue
          const heard = tracked.get(other.seat)?.lastAt ?? 0
          if (now - Math.max(heard, state.goAt) > RETIRE_AFTER_MS) {
            actions.push({ t: 'retire', seat: other.seat })
          }
        }
      }
      return { relay: data, actions }
    },
  },
}
