import type { SeatId } from '../types.ts'

// 社辦牌陣 (working title Clubroom Tiles; owner's request 2026-11-14). A number-tile rummy: 106
// tiles (1–13 in four suits, two of each, and two wildcards), 14 each; lay down groups and runs,
// rearrange the whole table on your turn, and be the first to empty your rack.
// docs/PRD/e23-clubroom-tiles.md has the rules and every detail decided here.

/**
 * A tile is a number 0–105. 0–103 are the numbered tiles, 26 to a suit (1, 1, 2, 2, ... 13, 13);
 * 104 and 105 are the two wildcards (the "chairs"). The number says everything about the tile, so a
 * tile on the table can be sent as it is; which tiles are in a rack or the pool is the secret.
 */
export type TileId = number

/** Spades, hearts, diamonds, clubs: the bridge club's four suits stand for the four colours */
export type Suit = 0 | 1 | 2 | 3

/** A table: the sets on it, each a list of tiles (order inside a set does not matter to the rules) */
export type TileTable = TileId[][]

/** Seconds a turn may take; 0 is no clock */
export type TilesClock = 0 | 60 | 90 | 120

export type TilesOptions = {
  clock: TilesClock
  rounds: number
}

export type TilesPhase =
  /** Someone's turn */
  | 'play'
  /** A round is over: every rack is shown with the score, until someone goes on (or the clock) */
  | 'scored'
  /** The last round's score stays up */
  | 'over'

/** What just happened, for the line everyone reads */
export type TilesEvent =
  | { kind: 'played'; seat: SeatId; tiles: number; first: boolean }
  /** Drew a tile, by choice, because the clock ran out (`timeUp`) or because the room skipped them */
  | { kind: 'drew'; seat: SeatId; why: TilesDrawReason }
  /** Like `drew`, with the pool empty: nothing to draw */
  | { kind: 'passed'; seat: SeatId; why: TilesDrawReason }

export type TilesDrawReason = 'chose' | 'timeUp' | 'skipped'

/** A finished round, all of it public */
export type TilesRoundResult = {
  round: number
  /** Who won it: the one who went out, or the lowest racks when the pool ran dry */
  winners: SeatId[]
  /** Somebody emptied their rack (false: the pool ran out and nobody could play) */
  out: boolean
  /** Every rack as the round ended, by player (the order of `players`) */
  racks: TileId[][]
  /** What each player's score changed by, by player */
  deltas: number[]
}

/** The full state. Never sent as it is: the racks and the pool are cut by `view` */
export type TilesState = {
  phase: TilesPhase
  clock: TilesClock
  /** Seat order */
  players: SeatId[]
  /** From 1 */
  round: number
  totalRounds: number
  /** Who starts round 1; each later round the next seat starts */
  firstStarter: number
  /** What is left to draw, top first */
  pool: TileId[]
  /** By player */
  racks: TileId[][]
  /** By player: has made the opening meld (30 points from the rack alone) */
  melded: boolean[]
  /** The table as the turn began: what a refused or timed-out turn goes back to */
  table: TileTable
  /** The table as the player on turn has rearranged it so far; null when untouched */
  draft: TileTable | null
  /** Whose turn: an index into `players` */
  turn: number
  /** Turns played this round, from 1: a new turn is a new clock */
  turnNo: number
  /** Turns in a row, since the pool ran out, in which nobody played */
  passes: number
  /** By player, over all rounds */
  scores: number[]
  last: TilesEvent | null
  history: TilesRoundResult[]
}

export type TilesAction =
  /** The player on turn: the table as they have it now (the draft). Checked only for tiles */
  | { type: 'arrange'; sets: TileTable }
  /** The player on turn: back to the table as the turn began */
  | { type: 'reset' }
  /** The player on turn: end the turn with the draft (or `sets`, then that is the draft) */
  | { type: 'commit'; sets?: TileTable }
  /** The player on turn: the table goes back, and they draw (or pass, with the pool empty) */
  | { type: 'draw' }
  /** From the room only: the turn's clock ran out; as `draw` */
  | { type: 'timeUp' }
  /** From the room only: the player on turn is gone; as `draw` */
  | { type: 'skip'; seat: SeatId }
  /** Anyone at the table (or the room's clock), after a round: the next round */
  | { type: 'next' }

export type TilesSeatView = {
  seat: SeatId
  /** How many tiles in their rack */
  tiles: number
  melded: boolean
  score: number
}

/** What one viewer sees: the table (with the draft as it happens), their own rack, counts */
export type TilesView = {
  phase: TilesPhase
  clock: TilesClock
  players: SeatId[]
  round: number
  totalRounds: number
  table: TileTable
  draft: TileTable | null
  /** Whose turn it is */
  turn: SeatId
  turnNo: number
  pool: number
  passes: number
  seats: TilesSeatView[]
  you: SeatId | null
  /** Your rack, the tiles you have put in the draft included; null for a spectator */
  rack: TileId[] | null
  last: TilesEvent | null
  history: TilesRoundResult[]
}
