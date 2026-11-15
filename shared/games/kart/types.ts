// The kart race room (e9-t07, e9-t08): what the room stores and shows of a race. The karts
// themselves are not in here: each browser simulates its own and the frames go round in memory
// (shared/kart/net.ts, the module's `realtime`). Only what has to be agreed and kept is: the track,
// who has loaded, the start time, every lap and finish the server judged, and who dropped out.
import type { SeatId } from '../types.ts'

export type KartOptions = {
  /** A track id from shared/kart/tracks/list.ts */
  track: string
  laps: number
}

export type KartPhase = 'loading' | 'countdown' | 'racing' | 'finished'

export type KartRacer = {
  seat: SeatId
  /** Its browser has drawn the track and is on the grid */
  loaded: boolean
  /** Each finished lap's time, ms */
  lapMs: number[]
  /** Race time at the finish, ms; null until then */
  finishMs: number | null
  /** Dropped out: gone too long, or still out on the track when the race closed */
  out: boolean
}

export type KartState = {
  track: string
  laps: number
  phase: KartPhase
  /** When GO is, by the server's clock (ms since the epoch); null until everyone is on the grid */
  goAt: number | null
  racers: KartRacer[]
}

export type KartAction =
  /** A seat's browser is ready on the grid */
  | { t: 'loaded' }
  /** System: everyone loaded (or the wait ran out): the countdown, from the room's clock */
  | { t: 'schedule'; goAt: number }
  /** System: the wait for loading ran out */
  | { t: 'start' }
  /** System: GO */
  | { t: 'go' }
  /** System: the server judged that `seat` finished a lap at race time `ms` */
  | { t: 'lap'; seat: SeatId; ms: number }
  /** System: `seat` has not been heard from for too long */
  | { t: 'retire'; seat: SeatId }
  /** System: time is up for those still out on the track */
  | { t: 'close' }

/** Nothing is hidden in a race: every viewer sees the state, and whose seat they are */
export type KartView = KartState & { you: SeatId | null }
