import type { Card, HandCategory } from '../../poker/hand.ts'
import type { SeatId } from '../types.ts'

export type SilentTableOptions = {
  /** How many levels in a row the table must clear to win */
  levelsToWin: number
  /** How many failed levels, over the whole game, lose it */
  failureLimit: number
  /** Whether a seat may take a chip from another seat, or only from the table */
  allowTakeFromPlayers: boolean
  /** Whether spectators see every hole card during a level, not just at the reveal */
  spectatorsSeeAll: boolean
}

export type SilentTablePlayer = {
  seat: SeatId
  /** Two cards: only `view` decides who gets to see them */
  hole: Card[]
  /** The rank chip this seat holds (1 weakest ... n strongest); null when it must take one */
  chip: number | null
  /** This seat accepts the chips as they are now */
  ready: boolean
  /** The chip moves left this round. Only taking from the table empty-handed does not use one */
  movesLeft: number
  /** The chip this seat ended each finished round of this level with */
  history: number[]
  /** How many finished levels this seat's final chip was right */
  correctReads: number
}

/** One seat at the reveal: what they held against what they claimed */
export type RevealedSeat = {
  seat: SeatId
  hand: HandCategory
  /** The five cards of the hand */
  best: Card[]
  chip: number
  /** The chips that would have been right: more than one when this hand ties with others */
  lowestCorrectChip: number
  highestCorrectChip: number
  correct: boolean
}

export type Reveal = {
  passed: boolean
  /** In seat order */
  seats: RevealedSeat[]
}

export type SilentTablePhase =
  /** Chips are taken and `round` of the shared cards is showing */
  | 'round'
  /** The level is finished and every hole card is shown, until every seat says ready */
  | 'reveal'
  /** The last reveal stays up */
  | 'over'

export type SilentTableEnding = 'won' | 'lost'

/** The full state: hole cards and the shared cards still to come. Never sent as it is */
export type SilentTableState = {
  /** In seat order */
  players: SilentTablePlayer[]
  /** All five shared cards of this level, dealt in advance: `view` shows those already turned */
  community: Card[]
  phase: SilentTablePhase
  /** 1, 2 or 3: how many times shared cards have been turned this level */
  round: number
  /** Which level is being played, counting failed ones, from 1 */
  level: number
  /** Levels cleared since the last failure */
  streak: number
  /** Failed levels so far */
  failures: number
  levelsToWin: number
  failureLimit: number
  allowTakeFromPlayers: boolean
  spectatorsSeeAll: boolean
  /** The latest reveal while `phase` is `reveal` or `over`; otherwise null */
  reveal: Reveal | null
  ending: SilentTableEnding | null
}

export type SilentTableAction =
  /** Take a chip lying on the table; any chip this seat held goes back there */
  | { type: 'takeChip'; chip: number }
  /** Take the chip another seat holds, which then has none; any chip this seat held goes back */
  | { type: 'takeFrom'; seat: SeatId }
  /** Accept the chips as they are, or, at a reveal, ask for the next level */
  | { type: 'ready' }
  /** From the room only (`skipAction`): decide for a seat whose player is gone */
  | { type: 'pass'; seat: SeatId }

export type SilentTablePlayerView = Omit<SilentTablePlayer, 'hole'> & {
  /** Null for a card this viewer may not see */
  hole: Card[] | null
}

/** What one viewer sees: never another seat's hole cards before the reveal, or cards still to come */
export type SilentTableView = Omit<SilentTableState, 'players' | 'community'> & {
  /** The viewer's own seat; null for a spectator */
  you: SeatId | null
  players: SilentTablePlayerView[]
  /** The shared cards turned so far */
  community: Card[]
  /** The chips nobody holds, lowest first */
  tableChips: number[]
}
