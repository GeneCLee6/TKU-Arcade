import type { SeatId } from '../types.ts'

// 慘度排排站 (working title Misery Line; owner's request 2026-11-14). Every card is a miserable event
// with a misery index from 1 to 100. Each player keeps a line of face-up cards in order; on a turn a
// new card comes up with its index hidden, and the player says where in their own line it goes.
// Right, they keep it; wrong, the next players may try to place it in their own lines. The first to
// the target wins. docs/PRD/e14-misery-line.md has the rules.

/** Seconds per guess; 0 is no clock */
export type MiseryClock = 0 | 30 | 60

export type MiseryOptions = {
  /** Cards in a line to win */
  target: 8 | 10 | 12
  /** Face-up cards each player starts with */
  startCards: number
  /** A wrong guess goes on round the table */
  steals: boolean
  clock: MiseryClock
}

/** One line of the card bank: category, title, misery index */
export type MiseryCardRow = readonly [string, string, number]

export type MiseryCard = {
  /** Its line in the reviewed CSV, from 1 */
  id: number
  category: string
  title: string
  /** 1 (a nuisance) to 100 (the worst) */
  index: number
}

/** The card on the table before its index is shown: no id (the CSV is public) and no index */
export type MiseryFaceDown = {
  category: string
  title: string
}

/** One player's try at the card on the table */
export type MiseryAttempt = {
  seat: SeatId
  /** Where in their line, 0 being before the first card; null when the time ran out or they were skipped */
  gap: number | null
  /** The indexes either side of that gap in their line; null at an end (or with no gap) */
  low: number | null
  high: number | null
  right: boolean
}

/** A card whose turn is over, all of it public */
export type MiseryReveal = {
  turnNo: number
  /** Whose turn it was */
  turn: SeatId
  card: MiseryCard
  /** Every try, in order; only the last can be right */
  attempts: MiseryAttempt[]
  /** Who kept it; null when it was thrown away */
  keptBy: SeatId | null
}

export type MiseryLine = {
  seat: SeatId
  /** Least miserable first */
  cards: MiseryCard[]
}

export type MiseryPhase =
  /** A card is on the table and `guesser` says where it goes */
  | 'guess'
  /** The last card's index is shown until the next player draws */
  | 'reveal'
  | 'over'

/** The full state. Never sent as it is: the card on the table and the deck are cut by `view` */
export type MiseryState = {
  phase: MiseryPhase
  target: number
  steals: boolean
  clock: MiseryClock
  /** Seat order */
  players: SeatId[]
  lines: MiseryLine[]
  /** From 1, one per card drawn */
  turnNo: number
  /** Whose turn it is: who drew the card */
  turn: SeatId
  /** Who places the card now: `turn`, then each stealer in seat order */
  guesser: SeatId
  /** The card on the table; null outside `guess` */
  current: MiseryCard | null
  /** The wrong tries at `current` so far */
  attempts: MiseryAttempt[]
  /** The last card whose turn is over */
  last: MiseryReveal | null
  /** Card ids still to draw, in order: the next card is the first */
  deck: number[]
  /** Cards nobody placed */
  discarded: number
  /** The game ended because the deck ran out */
  deckOut: boolean
}

export type MiseryAction =
  /** The guesser: the card goes in this gap of their own line */
  | { type: 'place'; gap: number }
  /** The next player, at a reveal: the next card */
  | { type: 'next' }
  /** From the room only (`timers`): the time to guess or to look at a reveal is up */
  | { type: 'timeUp' }
  /** From the room only: a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }

/** What one viewer sees: everything but the hidden index and the deck */
export type MiseryView = Omit<MiseryState, 'current' | 'deck'> & {
  you: SeatId | null
  /** The card on the table, face down; null outside `guess` */
  current: MiseryFaceDown | null
  /** The seats still to try the card after the guesser, in order */
  stealers: SeatId[]
  /** Cards left to draw */
  deckLeft: number
  /** Who draws next, at a reveal */
  nextTurn: SeatId
}
