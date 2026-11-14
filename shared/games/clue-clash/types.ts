import type { SeatId } from '../types.ts'

// 撞詞 (working title Clue Clash; owner's request 2026-11-14). A co-operative word game: one
// guesser, a mystery word everyone else sees, a one-word clue from each of them, and clues that
// clash cancel out before the guesser sees what is left. docs/PRD/e21-clue-clash.md has the rules.

export type CcOptions = {
  /** 90 seconds for clues, 45 to cross out, 60 to guess */
  clock: boolean
}

/** One line of the bank: category, word, other answers that count (`/` between them, or empty) */
export type CcWordRow = readonly [string, string, string]

export type CcWord = {
  /** Its line in the reviewed CSV, from 1 */
  id: number
  category: string
  word: string
  /** Other answers that count as right: another name for the same thing */
  alts: string[]
}

export type CcPhase =
  /** Everyone but the guesser writes a clue, unseen by the others */
  | 'clues'
  /** The clue-givers see every clue and cross out the ones that mean the same */
  | 'review'
  /** The guesser sees what survived and guesses once, or passes */
  | 'guess'
  /** Everything shown, until the guesser moves on */
  | 'reveal'
  | 'over'

/** One clue slot: with three players each giver writes two */
export type CcClue = {
  seat: SeatId
  /** Null until sent, and for a giver who never sent one */
  text: string | null
  /** No clue came: the time ran out or the room skipped the seat */
  none: boolean
  /** Clashed with another clue, found by the room itself */
  clash: boolean
  /** Who crossed it out in the review */
  flags: SeatId[]
  /** Settled once the review ends: hidden from the guesser */
  cancelled: boolean | null
}

export type CcGuess =
  | { kind: 'guess'; text: string; correct: boolean }
  | { kind: 'pass' }
  /** The guesser's time ran out, or the room skipped them: counted as a pass */
  | { kind: 'time' }

/** What a card came to */
export type CcOutcome =
  | 'right'
  | 'wrong'
  | 'pass'
  /** Thrown away for the wrong guess before it */
  | 'lost'

export type CcCardResult = {
  guesser: SeatId
  word: CcWord
  clues: { seat: SeatId; text: string; cancelled: boolean }[]
  guess: CcGuess | null
  outcome: CcOutcome
  /** The clue-givers counted a wrong-looking guess as right */
  accepted: boolean
}

/** The full state. Never sent as it is: the word and unrevealed clues are cut by `view` */
export type CcState = {
  phase: CcPhase
  clock: boolean
  /** Seat order */
  players: SeatId[]
  totalCards: number
  /** Clues per giver: 2 with three players, else 1 */
  perGiver: number
  /** Cards used so far, the current one included (lost ones too) */
  cardsUsed: number
  /** Turns played as guesser, which picks the next guesser round the table */
  turnsPlayed: number
  firstGuesser: number
  guesser: SeatId
  word: CcWord
  /** Already redrawn this card: once per card */
  redrawn: boolean
  usedWords: number[]
  clues: CcClue[]
  /** Givers done crossing out */
  ready: SeatId[]
  guess: CcGuess | null
  accepted: boolean
  score: number
  /** Taken off for a wrong guess on the last card, when there was no next card to lose */
  penalty: number
  history: CcCardResult[]
}

export type CcAction =
  /** A giver's clue (two with three players), replaced by a later one until all are in */
  | { type: 'clue'; texts: string[] }
  /** A giver, before the clues are compared: a new word, once per card */
  | { type: 'redraw' }
  /** A giver in the review: cross a clue out, or take that back */
  | { type: 'flag'; index: number; on: boolean }
  /** A giver in the review: done */
  | { type: 'ready' }
  | { type: 'guess'; text: string }
  | { type: 'pass' }
  /** A giver at the reveal: the guess is right after all (another name for the same thing) */
  | { type: 'accept' }
  /** The guesser at the reveal: the next card */
  | { type: 'next' }
  /** From the room only: a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }
  /** From the room only: the clock ran out */
  | { type: 'timeUp' }

export type CcRole = 'guesser' | 'giver' | 'spectator'

export type CcClueView = {
  seat: SeatId
  status: 'thinking' | 'sent' | 'none'
  /** Null where this viewer may not read it */
  text: string | null
  clash: boolean
  flags: SeatId[]
  cancelled: boolean | null
}

export type CcView = Omit<CcState, 'word' | 'usedWords' | 'clues' | 'firstGuesser'> & {
  you: SeatId | null
  role: CcRole
  /** The word: for the clue-givers, and for everyone at the reveal */
  word: CcWord | null
  clues: CcClueView[]
  /** Cards still to come after this one */
  cardsLeft: number
}
