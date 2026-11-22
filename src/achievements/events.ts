// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.81): what the games tell the achievements. Only types:
// every screen that reports something imports `trackAchievement` (track.ts), which loads the engine
// (engine.ts) when it is first needed. No game's rules change: each event is derived from what a screen
// already has (a race's steps, a room's result, the kart's stores).
import type { RoomView } from '../../shared/protocol.ts'

/** A race this browser drove to the finish (any mode), from its physics steps (kartRun.ts) */
export interface KartRunEvent {
  readonly type: 'kart.run'
  /** The track's id (not `recordKey`'s revision): a race track, a challenge track, `custom-…` */
  readonly track: string
  readonly kart: string
  /** From GO to the finish, ms; the best lap, ms */
  readonly ms: number
  readonly bestLapMs: number | null
  readonly perfectStart: boolean
  /** The highest boost combo of the race */
  readonly maxCombo: number
  /** The share of the race spent boosting, 0 to 1 */
  readonly cover: number
  /** Ms spent boosting */
  readonly boostMs: number
  readonly driftJumps: number
  /** High platforms reached, wall gaps driven through, real branches taken */
  readonly platforms: number
  readonly gaps: number
  readonly forks: number
  /** High Tides (a team race's blue boost) fired */
  readonly highTides: number
}

/** Where a race against others ended for this player: against the computer, a cup's race, a room */
export interface KartRaceEvent {
  readonly type: 'kart.race'
  readonly mode: 'bots' | 'cup' | 'room'
  /** Null when not finished */
  readonly place: number | null
  readonly racers: number
  /** The hardest computer kart in it, if any */
  readonly level: string | null
  /** A team race: whether this player's side won */
  readonly team: 'won' | 'lost' | 'draw' | null
  /** People in it, this player included (computer karts left out) */
  readonly humans: number
}

/** A board game this player sat in ended */
export interface BoardResultEvent {
  readonly type: 'board.result'
  readonly game: string
  /** Won outright; lost; a game everyone shares the outcome of (co-operative), won or not */
  readonly outcome: 'won' | 'lost' | 'coopWon' | 'coopLost' | 'shared'
  readonly humans: number
  /** The hardest computer player at the table, if any */
  readonly level: string | null
  /** Co-operative games: how far the table got (kite: score and most; silent table: levels) */
  readonly score?: number
  readonly most?: number
  readonly levels?: number
}

/**
 * The kart's progress as its own stores keep it (challenge medals and missions, school stars, cup
 * bests, records): read by sync.ts, so that what was earned before achievements existed counts too
 */
export interface KartProgressEvent {
  readonly type: 'kart.progress'
  readonly gold: number
  readonly platinum: number
  /** Lessons with three stars */
  readonly school: readonly string[]
  /** Challenge chapters with every mission passed */
  readonly chapters: readonly string[]
  /** Cups won */
  readonly cups: readonly string[]
  /** Tracks and karts with a kept best run (a race finished there, in it) */
  readonly tracks: readonly string[]
  readonly karts: readonly string[]
}

export type AchievementEvent =
  | KartRunEvent
  | KartRaceEvent
  | BoardResultEvent
  | KartProgressEvent
  /** Something the kart keeps changed (a medal, stars, a cup): the engine reads the stores again */
  | { readonly type: 'kart.sync' }
  /**
   * A place on a track's leaderboard (feat/kart-leaderboard reports it when it is merged; until
   * then nothing sends it). `rank` is 1-based
   */
  | { readonly type: 'kart.leaderboard'; readonly track: string; readonly rank: number }
  /** A room's game ended with this person in it: the engine works out what it was (room.ts) */
  | { readonly type: 'room.result'; readonly view: RoomView; readonly you: string }
  /** Opened as the installed app, or just installed */
  | { readonly type: 'platform.app' }
