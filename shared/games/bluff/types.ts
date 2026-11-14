import type { SeatId } from '../types.ts'

// 真假朗讀 (working title Bluff Reader, e6). Owner's rules, 2026-11-13: a judge, one honest reader
// with the true explanation, bluffers who make one up, and (four players or more) a mole (暗樁) who
// bluffs too but must work secret mission words in. Everyone but the judge may give one "吐槽貼"
// (heckle sticker) to the reader they found worst. docs/PRD/e6-bluff-reader.md has the scoring.

export type BluffOptions = {
  /** Each player is the judge twice instead of once */
  twoRounds: boolean
  /** Seconds each reader gets, with the clock on */
  readSeconds: number
  /** A mole among the bluffers, where there are enough players */
  mole: boolean
  /** Everyone sees the term's three categories, one of them the true one (2026-11-14; before, a hint for bluffers) */
  hints: boolean
  /** Countdowns for preparing, reading and voting */
  clock: boolean
}

/** One line of the term bank: term, its true category, two decoy categories, the true explanation */
export type BluffTermRow = readonly [string, string, string, string, string]

export type BluffTerm = {
  /** Its line in the reviewed CSV, from 1 */
  id: number
  /** The true category: one of `choices` */
  category: string
  term: string
  /**
   * Since 2026-11-14 (擁有者): the three categories everyone sees, in this round's order; the true
   * one among them. A round from before has none, and a `hint` for the bluffers instead
   */
  choices?: string[]
  hint?: string
  explanation: string
}

export type BluffRole = 'judge' | 'honest' | 'bluffer' | 'mole'

export type BluffPhase =
  /** Everyone reads their own card */
  | 'prepare'
  /** The readers speak one after another, in `order` */
  | 'reading'
  /** The judge picks the honest reader; the others may give a heckle sticker */
  | 'voting'
  /** Everything is shown, until the judge moves on */
  | 'reveal'
  /** The last round's reveal stays up */
  | 'over'

export type BluffPlayer = {
  seat: SeatId
  score: number
}

/** Why the judge's vote counted for nothing */
export type BluffMiss = 'time' | 'skipped'

export type BluffReveal = {
  /** Null when the judge did not vote: `missed` says why */
  vote: SeatId | null
  missed: BluffMiss | null
  /** Who gave a sticker to whom; a seat that gave none is absent */
  stickers: Record<string, SeatId>
  /** What each seat gained or lost this round, in the order of `players` */
  points: number[]
}

/** A finished round, all of it public */
export type BluffRound = {
  round: number
  judge: SeatId
  honest: SeatId
  mole: SeatId | null
  term: BluffTerm
  words: string[]
  reveal: BluffReveal
}

/** The full state. Never sent as it is: roles, the explanation and the votes are cut by `view` */
export type BluffState = {
  phase: BluffPhase
  twoRounds: boolean
  readSeconds: number
  moleOn: boolean
  hints: boolean
  clock: boolean
  players: BluffPlayer[]
  firstJudge: SeatId
  /** From 1 */
  round: number
  totalRounds: number
  judge: SeatId
  honest: SeatId
  mole: SeatId | null
  term: BluffTerm
  /** The mole's mission words; empty without a mole */
  words: string[]
  /** Everyone but the judge, in the order they read */
  order: SeatId[]
  /** Who reads now, an index into `order`, while reading */
  reader: number
  /** The judge's pick so far: nobody else may know it before the reveal */
  vote: SeatId | null
  /** The judge was skipped at the vote (gone): the vote counts for nothing this round */
  judgeAway: boolean
  /** Heckle stickers so far, by the giver's seat; a giver who passed has null */
  stickers: Record<string, SeatId | null>
  reveal: BluffReveal | null
  usedTerms: number[]
  history: BluffRound[]
}

export type BluffAction =
  /** The judge, while preparing: everyone has read their card */
  | { type: 'startReading' }
  /** The reader, or the judge: this reading is over */
  | { type: 'doneReading' }
  /** The judge: who they think read the true explanation */
  | { type: 'vote'; seat: SeatId }
  /** Anyone but the judge: a heckle sticker for this reader, or none (`seat: null`) */
  | { type: 'sticker'; seat: SeatId | null }
  /** The judge, after the reveal */
  | { type: 'next' }
  /** From the room only: a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }
  /** From the room only: the countdown of this phase ran out */
  | { type: 'timeUp' }

/** What one viewer sees. The roles, the explanation and the words stay with their owners */
export type BluffView = Omit<
  BluffState,
  'honest' | 'mole' | 'words' | 'vote' | 'stickers' | 'usedTerms' | 'firstJudge' | 'term'
> & {
  you: SeatId | null
  /** Your own role this round; null for a spectator */
  role: BluffRole | null
  /**
   * The term and its three categories (none when the room turned them off). Which one is true stays
   * hidden until the reveal: `category` is null before it
   */
  term: { id: number; term: string; choices: string[]; category: string | null }
  /** The honest reader's, and everyone's at the reveal */
  explanation: string | null
  /** The mole's own, and everyone's at the reveal */
  words: string[]
  /** Shown at the reveal */
  honest: SeatId | null
  mole: SeatId | null
  /** The judge's own pick before the reveal; everyone's at it (also in `reveal`) */
  vote: SeatId | null
  /** Your own sticker so far: a seat, null for "none", undefined before you chose */
  sticker?: SeatId | null
  /** Who has finished voting or chosen a sticker, not what */
  decided: SeatId[]
}
