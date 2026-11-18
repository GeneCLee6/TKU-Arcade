// The kart race room (e9-t07, e9-t08): what the room stores and shows of a race. The karts
// themselves are not in here: each browser simulates its own and the frames go round in memory
// (shared/kart/net.ts, the module's `realtime`). Only what has to be agreed and kept is: the track,
// who has loaded, the start time, every lap and finish the server judged, and who dropped out.
import type { ItemId, Warp } from '../../kart/items.ts'
import type { KartShot } from '../../kart/shots.ts'
import type { TeamId } from '../../kart/team.ts'
import type { SeatId } from '../types.ts'

/** A plain race, or one with item boxes on the road (e9-t05) */
export type KartMode = 'items' | 'race'

export type KartOptions = {
  /** A track id from shared/kart/tracks/list.ts, or `custom` for the track in `custom` (e10-t08) */
  track: string
  /** A track made in the editor, as its code (shared/kart/editor/codec.ts); empty for none */
  custom?: string
  laps: number
  mode: KartMode
  /** 2026-11-18: everyone for themselves, or two teams (shared/kart/team.ts); either mode can be either */
  teams?: KartTeams
}

export type KartTeams = 'solo' | 'teams'

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
  /**
   * A team race only (2026-11-18, shared/kart/team.ts): its team, the team boosts it holds, those
   * it has fired so far, and until when (the server's clock) the one it fired last burns
   */
  team?: TeamId
  teamBoosts?: number
  teamUsed?: number
  teamUntil?: number
}

/** A team race's shared state: each team's gauge (in steps, team.ts) and how often it has filled */
export type KartTeamState = {
  gauge: [number, number]
  fills: [number, number]
}

/**
 * An item used (e9-t06a), or a shot that hit (e9-t06b): what everyone's browser reads to show it and
 * to apply it
 */
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
  /**
   * A shot that hit (e9-t06b): `targets` is the kart it hit, `blocked` the same if a shield stopped
   * it, and `by` who threw it. False when the item was used (a cloud's `targets` is whom it chases)
   */
  hit: boolean
}

export type KartState = {
  /** A track id, or `custom:<code>` for a track made in the editor (shared/kart/editor/custom.ts) */
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
  /** Shots on the road (e9-t06b, shared/kart/shots.ts), oldest first */
  shots: KartShot[]
  /** A team race only (2026-11-18): the teams' gauges; a race of everyone for themselves has none */
  teams?: KartTeamState
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
      /** A thrown or dropped item: the shot it put on the road (e9-t06b); null for the others */
      shot: KartShot | null
    }
  /** System: shot `shot` hit `seat` at server time `at`; a shield up then stops it (e9-t06b) */
  | { t: 'hit'; seat: SeatId; shot: number; at: number }
  /** System (a team race): `team`'s gauge stands at `gauge`, as its karts' frames have filled it */
  | { t: 'tgauge'; team: TeamId; gauge: number }
  /** System: `team`'s gauge is full: each of its karts still racing gets a team boost */
  | { t: 'tfill'; team: TeamId }
  /** System: `seat` fired a team boost it held, at server time `at` */
  | { t: 'tfire'; seat: SeatId; at: number }

/** Nothing is hidden in a race: every viewer sees the state, and whose seat they are */
export type KartView = KartState & { you: SeatId | null }
