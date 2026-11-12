import type { SeatId } from '../types.ts'
import type { Face } from './board.ts'
import type { FullFace } from './boardFull.ts'

export type DiceKind = 'four-sided' | 'six-sided'

/** The simplified ladder of 79 cells (board.ts), or the full board with money (boardFull.ts, C6) */
export type Edition = 'simple' | 'full'

/** The room's options (info.ts) */
export type PromotionOptions = {
  /** The simple edition (the default) or the full one; the other two are the simple edition's */
  edition: Edition
  /** A four-sided top showing the result, or four six-sided dice read through SIX_SIDED_TABLE */
  dice: DiceKind
  /** How many rounds (every seat rolling once) before the game ends on seniority */
  turnLimit: number
}

export type PromotionPlayer = {
  seat: SeatId
  /** The id of the cell this seat stands on */
  cell: string
  /** How many times this seat has rolled */
  rolls: number
  /** How many of those rolls were zang */
  demotions: number
}

/** The latest roll, enough to animate it: the top or dice, then the piece from one cell to another */
export type LastRoll = {
  seat: SeatId
  face: Face
  /** The four dice as rolled, or null when the game uses the four-sided top */
  dice: number[] | null
  from: string
  to: string
}

/** Why the game ended: someone reached the end cell, or the round limit ran out */
export type PromotionEnding = 'retired' | 'turnLimit'

/** The full state. Nothing in this game is hidden: chance lives in the Rng, outside the state */
export type PromotionState = {
  /** In seat order */
  players: PromotionPlayer[]
  /** Whose roll it is; null once the game is over */
  turn: SeatId | null
  /** The seat that opens each round */
  first: SeatId
  /** The round being played, from 1. Stays at the last one played when the game ends */
  round: number
  turnLimit: number
  dice: DiceKind
  last: LastRoll | null
  ending: PromotionEnding | null
  /** The seat that reached the end cell; null while playing and in a turn-limit ending */
  winner: SeatId | null
}

export type PromotionAction = { type: 'roll' } | { type: 'pass' }

/** What every viewer sees: the whole state, and which seat is theirs */
export type PromotionView = PromotionState & {
  /** The viewer's own seat; null for a spectator */
  you: SeatId | null
}

// ── The full edition (C6, rulesFull.ts) ─────────────────────────────────────────────────────

/** A seat still playing, retired (a retirement cell), or put out (exiled) */
export type FullStatus = 'active' | 'retired' | 'out'

export type FullPlayer = {
  seat: SeatId
  /** The id of the cell this seat stands on (boardFull.ts) */
  cell: string
  /** Seniority for the final comparison: the cell's rank, kept from before on some retirements */
  rank: number
  /** Silver; may go below zero (a debt), which the end settles like any other balance */
  money: number
  /** Examination standing: 0 none, 1 regular route (a tribute student), 2 juren, 3 jinshi */
  degree: 0 | 1 | 2 | 3
  /** A military jinshi, which opens the Imperial Guard to a civilian */
  wu: boolean
  /** A Banner household (旗籍) rather than a civilian one (民籍); decided by the birth roll */
  banner: boolean
  /** The cell the birth roll placed this seat on; null until this seat has rolled for the first time */
  origin: string | null
  status: FullStatus
  /** How many turns this seat has rolled */
  rolls: number
}

/** How four dice read (rulesFull.ts `readThrow`) */
export type ComboKind =
  | 'four'
  | 'allGraft'
  | 'run'
  | 'redPairs'
  | 'pairs'
  | 'three'
  | 'pair'
  | 'cancel'
  | 'none'

/** A step of a move: one of the six results, four of a kind's ennoblement, or four graft's dismissal */
export type FullStep = FullFace | 'fengjue' | 'dismiss'

export type FullThrow = {
  dice: number[]
  combo: ComboKind
  /** The steps it moves, in order; empty for a throw that scores nothing */
  steps: FullStep[]
}

/** Why silver changed hands */
export type TransferReason =
  | 'courtesy'
  | 'reward'
  | 'fee'
  | 'congrats'
  | 'run'
  | 'rank'
  | 'share'

export type Transfer = {
  /** A seat, or null for the bank */
  from: SeatId | null
  to: SeatId | null
  amount: number
  why: TransferReason
}

/** The latest turn, enough to animate it: the throws, each cell landed on, the silver that moved */
export type FullLastTurn = {
  seat: SeatId
  /** The first roll of a seat, which decides its origin and household instead of moving */
  birth: boolean
  throws: FullThrow[]
  from: string
  /** Every cell landed on, in order (after a redirect for a missing requirement) */
  path: string[]
  transfers: Transfer[]
}

/** One seat's line in the final settlement */
export type FullSettlementLine = {
  seat: SeatId
  /** The grade compared (boardFull.ts `gradeOf`); 0 for a seat that was put out */
  grade: number
  /** Silver before the settlement */
  before: number
  /** What rank comparison (對品) gave or took */
  duipin: number
  /** The bank's share (分注), with the remainder for the poorest */
  share: number
  after: number
}

export type FullSettlement = {
  lines: FullSettlementLine[]
  /** The seat that got the bank's remainder, and how much; null when it split evenly */
  remainder: { seat: SeatId; amount: number } | null
}

/** Why the full edition ended: one seat left playing, or the round limit */
export type FullEnding = 'oneLeft' | 'turnLimit'

export type PromotionFullState = {
  edition: 'full'
  /** In seat order */
  players: FullPlayer[]
  /** Whose roll it is; null once the game is over */
  turn: SeatId | null
  /** The seat that rolled first */
  first: SeatId
  /** The round being played, from 1 */
  round: number
  turnLimit: number
  /** The common pot (公注) */
  bank: number
  last: FullLastTurn | null
  ending: FullEnding | null
  /** Null until the game is over */
  settlement: FullSettlement | null
}

/** Nothing in the full edition is hidden either */
export type PromotionFullView = PromotionFullState & { you: SeatId | null }

/** Either edition's state: the simple one has no `edition` field (its states predate it) */
export type PromotionAnyState = PromotionState | PromotionFullState
export type PromotionAnyView = PromotionView | PromotionFullView
