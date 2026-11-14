import type { SeatId } from '../types.ts'

// 誰的詞不一樣 (working title Odd Word Out; owner's request 2026-11-14). The folk party game: most of
// the table gets one word, the odd ones out get a similar one, and nobody is told which they are.
// The friends talk on their own voice call: the site only deals the words, shows who speaks first,
// and reveals. No votes and no scores. docs/PRD/e13-odd-word-out.md has the rules.

/** 0 is "by the number of players" (1 for 3–6, 2 for 7 or more) */
export type OddUndercoverChoice = 0 | 1 | 2 | 3

export type OddWordOptions = {
  /** How many get the other word */
  undercovers: OddUndercoverChoice
  /** One of them gets no word at all */
  blank: boolean
  rounds: number
}

/** One line of the word bank: category and the two words, in no particular order */
export type OddPairRow = readonly [string, string, string]

export type OddPair = {
  /** Its line in the reviewed CSV, from 1 */
  id: number
  category: string
  /** What most of the table gets */
  common: string
  /** What the odd ones out get */
  odd: string
}

export type OddPhase =
  /** Everyone has their word; the table describes, on their call */
  | 'words'
  /** Every word is shown, until the round's host moves on */
  | 'reveal'
  /** The last reveal stays up */
  | 'over'

export type OddDirection = 'clockwise' | 'counterclockwise'

/** A finished round, all of it public */
export type OddRound = {
  round: number
  pair: OddPair
  undercover: SeatId[]
  blank: SeatId | null
}

/** The full state. Never sent as it is: the pair and who is odd are cut by `view` */
export type OddWordState = {
  phase: OddPhase
  undercoverChoice: OddUndercoverChoice
  blankOn: boolean
  /** Seat order */
  players: SeatId[]
  /** From 1 */
  round: number
  totalRounds: number
  pair: OddPair
  /** Who has the odd word (the blank among them), in seat order */
  undercover: SeatId[]
  /** The one with no word, when the blank is on */
  blank: SeatId | null
  /** Who describes first, then on round the table, in `direction` */
  order: SeatId[]
  direction: OddDirection
  /**
   * Who runs this round: reveal, redeal, next. The first speaker, until the room skips them (gone),
   * which hands it on down `order`
   */
  host: SeatId
  /** Words thrown away this round, so that "redeal" says it happened */
  redeals: number
  /** Ended by the host before the last round */
  endedEarly: boolean
  usedPairs: number[]
  history: OddRound[]
}

export type OddWordAction =
  /** The round's host: show everyone's word */
  | { type: 'reveal' }
  /** The round's host, before the reveal: a new pair (someone knew this one) */
  | { type: 'redeal' }
  /** The round's host, after the reveal: the next round */
  | { type: 'next' }
  /** The round's host, after the reveal: the game ends here */
  | { type: 'end' }
  /** From the room only: a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }

/** What one viewer sees: their own word only, until the reveal */
export type OddWordView = Omit<OddWordState, 'pair' | 'undercover' | 'blank' | 'usedPairs'> & {
  you: SeatId | null
  /** Your own word; null for a spectator, and for the blank (`blankYou`) */
  word: string | null
  /** You got no word this round */
  blankYou: boolean
  /** How many have the other word this round: public, as at a real table */
  undercoverCount: number
  /** Everything, once revealed; null before */
  reveal: {
    pair: OddPair
    undercover: SeatId[]
    blank: SeatId | null
  } | null
}
