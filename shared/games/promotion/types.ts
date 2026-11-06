import type { SeatId } from '../types.ts'
import type { Face } from './board.ts'

export type DiceKind = 'four-sided' | 'six-sided'

export type PromotionOptions = {
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
