// A race room in this browser, for a race against computer opponents (docs/ARCHITECTURE.md §4.19).
// It runs the race room's own module (shared/games/kart/rules.ts: `init`, `reduce`, `timers` and the
// `realtime` half) the way the Worker's room host does, so that every lap, every item box, every item
// used and every shot that hits is judged by the very same functions as online; nothing about the
// rules is copied here. The player's race screen (RaceView) talks to it through a `RoomRealtime` like
// a real room's, clock pings included; the bots hand their frames straight in. Time is given, not
// read: the page passes the clock, the tests a counter.
import { kart } from '../../../shared/games/kart/rules.ts'
import type {
  KartAction,
  KartOptions,
  KartState,
  KartView,
} from '../../../shared/games/kart/types.ts'
import { createRng } from '../../../shared/games/rng.ts'
import {
  isGameError,
  type Actor,
  type RealtimeMemory,
  type SeatId,
} from '../../../shared/games/types.ts'
import { relayFrame } from '../../../shared/kart/net.ts'
import { CLOCK_ANSWER_BYTES, CLOCK_FRAME, CLOCK_PING_BYTES } from '../../../shared/protocol.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'

/** The room host stops asking the clock after this many rounds (as worker/room-host.ts does) */
const CLOCK_ROUNDS = 4

export interface LocalRoom {
  /** The room's state now */
  state(): KartState
  view(seat: SeatId): KartView
  /** An action from a seat (the race screen's `loaded`) or from the room itself */
  act(action: KartAction, actor: Actor): void
  /** A frame from a seat (a kart's, or an item frame), judged at `now` */
  frame(seat: SeatId, data: Uint8Array, now: number): void
  /** Fires the timers that are due by `now` */
  tick(now: number): void
  /** The channel the player's race screen uses: frames in, everyone else's frames and clock answers out */
  realtimeFor(seat: SeatId): RoomRealtime
  /** Called after every change of state */
  onChange(listener: () => void): () => void
}

export interface LocalRoomOptions {
  readonly seats: number
  readonly options: KartOptions
  readonly seed: number
  /** The room's clock, ms since the epoch */
  readonly now: () => number
}

export function createLocalRoom({ seats, options, seed, now }: LocalRoomOptions): LocalRoom {
  const rng = createRng(seed)
  let state = kart.init(
    Array.from({ length: seats }, (_, id) => ({ id })),
    options,
    rng,
  )
  const memory: RealtimeMemory = kart.realtime!.memory()
  /** Running timers by id: when each fires and what it does */
  const timers = new Map<string, { due: number; action: KartAction }>()
  const changeListeners = new Set<() => void>()
  const channels = new Map<SeatId, Set<(data: Uint8Array) => void>>()

  const syncTimers = (at: number) => {
    const wanted = kart.timers?.(state) ?? []
    const ids = new Set(wanted.map((one) => one.id))
    for (const id of [...timers.keys()]) if (!ids.has(id)) timers.delete(id)
    for (const spec of wanted) {
      if (!timers.has(spec.id)) timers.set(spec.id, { due: at + spec.ms, action: spec.action })
    }
  }

  const apply = (action: KartAction, actor: Actor, at: number): boolean => {
    const next = kart.reduce(state, action, actor, rng)
    if (isGameError(next)) return false
    state = next
    syncTimers(at)
    return true
  }

  /** After a change: what the clock asks for (the start time), then the listeners */
  const settle = (at: number) => {
    for (let round = 0; round < CLOCK_ROUNDS; round++) {
      const asked = kart.realtime!.clock?.(state, at) ?? []
      if (asked.length === 0) break
      for (const action of asked) apply(action, 'system', at)
    }
    for (const listener of changeListeners) listener()
  }

  const send = (to: SeatId | 'all', from: SeatId, data: Uint8Array) => {
    for (const [seat, listeners] of channels) {
      if (seat === from || (to !== 'all' && seat !== to)) continue
      for (const listener of listeners) listener(data)
    }
  }

  const room: LocalRoom = {
    state: () => state,
    view: (seat) => kart.view(state, seat),
    act(action, actor) {
      const at = now()
      if (apply(action, actor, at)) settle(at)
    },
    frame(seat, data, at) {
      const answer = kart.realtime!.frame(state, memory, seat, data, at)
      if (answer.relay) send('all', seat, relayFrame(seat, answer.relay))
      let changed = false
      for (const action of answer.actions) changed = apply(action, 'system', at) || changed
      if (changed) settle(at)
    },
    tick(at) {
      let changed = false
      // Oldest first; a timer that fires can start or stop others, so look again after each
      for (let guard = 0; guard < 16; guard++) {
        let first: [string, { due: number; action: KartAction }] | null = null
        for (const entry of timers)
          if (entry[1].due <= at && (!first || entry[1].due < first[1].due)) first = entry
        if (!first) break
        timers.delete(first[0])
        changed = apply(first[1].action, 'system', first[1].due) || changed
      }
      if (changed) settle(at)
    },
    realtimeFor(seat) {
      return {
        send(data) {
          if (data.byteLength === CLOCK_PING_BYTES && data[0] === CLOCK_FRAME) {
            const answer = new Uint8Array(CLOCK_ANSWER_BYTES)
            answer.set(data)
            new DataView(answer.buffer).setFloat64(CLOCK_PING_BYTES, now(), true)
            // As from a socket: later, never inside the send
            queueMicrotask(() => send(seat, -1, answer))
            return true
          }
          room.frame(seat, data, now())
          return true
        },
        listen(listener) {
          const listeners = channels.get(seat) ?? new Set()
          listeners.add(listener)
          channels.set(seat, listeners)
          return () => listeners.delete(listener)
        },
      }
    },
    onChange(listener) {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
  }
  syncTimers(now())
  return room
}
