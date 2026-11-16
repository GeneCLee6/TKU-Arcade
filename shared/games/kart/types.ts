// The kart race room (e9-t07, e9-t08): what the room stores and shows of a race. The karts
// themselves are not in here: each browser simulates its own and the frames go round in memory
// (shared/kart/net.ts, the module's `realtime`). Only what has to be agreed and kept is: the track,
// who has loaded, the start time, every lap and finish the server judged, and who dropped out.
import type { ItemId, Warp } from '../../kart/items.ts'
import type { SeatId } from '../types.ts'

/** A plain race, or one with item boxes on the road (e9-t05) */
export type KartMode = 'items' | 'race'

export type KartOptions = {
  /** A track id from shared/kart/tracks/list.ts */
  track: string
  laps: number
  mode: KartMode
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
  /** The item it holds, if any (item race only) */
  item: ItemId | null
  /** Its shield is up until then, by the server's clock (ms since the epoch); 0 for none */
  shieldUntil: number
}

/** An item used (e9-t06a): what everyone's browser reads to show it and to apply it */
export type KartItemEvent = {
  /** Counts up through the race: a browser applies each one once */
  n: number
  item: ItemId
  by: SeatId
  /** The karts it reached, and of those the ones whose shield stopped it */
  targets: SeatId[]
  blocked: SeatId[]
  /** When, by the server's clock */
  at: number
  /** A swap: where each kart goes */
  warps: Warp[]
}

export type KartState = {
  track: string
  laps: number
  phase: KartPhase
  /** When GO is, by the server's clock (ms since the epoch); null until everyone is on the grid */
  goAt: number | null
  racers: KartRacer[]
  mode: KartMode
  /** Seeds the item draws */
  seed: number
  /** Item boxes (shared/kart/items.ts's `itemBoxes`): each is back at this server time; 0 is there now */
  boxes: number[]
  /** Items drawn so far: the next draw's number */
  draws: number
  /** The latest items used, oldest first, at most KEEP_EVENTS */
  events: KartItemEvent[]
  /** Items used so far: the next event's `n` */
  used: number
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
  /** System: `seat` took box `box` at server time `at` and got `item` (e9-t05) */
  | { t: 'got'; seat: SeatId; box: number; item: ItemId; at: number }
  /** System: `seat` used `item`, judged to reach `targets`, of whom `blocked` had shields (e9-t06a) */
  | {
      t: 'use'
      seat: SeatId
      item: ItemId
      at: number
      targets: SeatId[]
      blocked: SeatId[]
      warps: Warp[]
    }

/** Nothing is hidden in a race: every viewer sees the state, and whose seat they are */
export type KartView = KartState & { you: SeatId | null }
