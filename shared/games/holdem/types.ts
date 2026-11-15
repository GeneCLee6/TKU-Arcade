import type { Card, HandCategory } from '../../poker/hand.ts'
import type { SeatId } from '../types.ts'

// 德州撲克 (Texas Hold'em, no-limit; owner's request 2026-11-14). The traditional public-domain card
// game, played for chips that only exist inside one game: no money, no buy-in, and the chips reset
// every game. docs/PRD/e24-holdem.md has the rules and every decision.

/** Starting chips per player, in big blinds: the blinds always start at 10 / 20 */
export type HoldemStack = 100 | 200 | 300
/** The blinds go up a level (about ×1.5) every this many hands; 0 is never */
export type HoldemBlindUp = 0 | 15 | 20
/** Seconds a player has to act; 0 is no clock */
export type HoldemTimer = 0 | 20 | 30 | 60

export type HoldemOptions = {
  stack: HoldemStack
  blindUp: HoldemBlindUp
  timer: HoldemTimer
}

export type HoldemStreet = 'preflop' | 'flop' | 'turn' | 'river'

/** A hand's category as the screen names it: a straight flush to the ace is a royal flush */
export type HoldemCategory = HandCategory | 'royalFlush'

export type HoldemPlayer = {
  seat: SeatId
  /** Chips in front of the player, not yet in the pot */
  stack: number
  /** Chips at the start of this hand: who places higher when two bust in the same hand */
  start: number
  /** Two cards while in a hand, known only to this player until shown */
  hole: Card[]
  /** Chips put in on this street */
  bet: number
  /** Chips put in this hand, every street together: the side pots are worked out from these */
  committed: number
  folded: boolean
  allIn: boolean
  /** Has acted on this street since the betting was last opened to them */
  acted: boolean
  /** The bet to match when this player last acted: whether a short all-in reopens the betting */
  actedAt: number
  /** No chips left: watches the rest of the game */
  out: boolean
  /** Sitting out: checks or folds at once when it is their turn, until they come back */
  away: boolean
}

/** One pot as it was won */
export type HoldemPotResult = {
  amount: number
  /** Who shared it and how much each got (odd chips first to the left of the button) */
  winners: { seat: SeatId; amount: number }[]
  /** Null when everyone else folded */
  category: HoldemCategory | null
}

/** A hand shown at the showdown */
export type HoldemShown = {
  seat: SeatId
  hole: Card[]
  category: HoldemCategory
  /** The five cards that make the hand */
  best: Card[]
}

/** How the last hand ended: public */
export type HoldemHandEnd = {
  hand: number
  /** False when everyone but one folded: nothing is shown */
  showdown: boolean
  pots: HoldemPotResult[]
  shown: HoldemShown[]
  /** Seats that showed nothing at the showdown */
  mucked: SeatId[]
}

export type HoldemPhase =
  /** `toAct` must fold, check, call, bet or raise */
  | { kind: 'bet'; toAct: SeatId }
  /** The hand is over: its result shows until the next hand is dealt */
  | { kind: 'handEnd' }
  | { kind: 'over' }

/** One line of the hand log: everything in it is public */
export type HoldemLog =
  | { k: 'hand'; hand: number; button: SeatId; sb: number; bb: number }
  | { k: 'blindsUp'; sb: number; bb: number }
  | { k: 'blind'; seat: SeatId; amount: number; big: boolean }
  | { k: 'fold'; seat: SeatId }
  | { k: 'check'; seat: SeatId }
  | { k: 'call'; seat: SeatId; amount: number; allIn: boolean }
  | { k: 'bet'; seat: SeatId; to: number; allIn: boolean }
  | { k: 'raise'; seat: SeatId; to: number; allIn: boolean }
  | { k: 'street'; street: HoldemStreet; cards: Card[] }
  /** An uncalled bet comes back */
  | { k: 'return'; seat: SeatId; amount: number }
  | { k: 'show'; seat: SeatId; cards: Card[]; category: HoldemCategory }
  | { k: 'muck'; seat: SeatId }
  | { k: 'win'; seat: SeatId; amount: number; category: HoldemCategory | null; pot: number }
  | { k: 'bust'; seat: SeatId }
  | { k: 'away'; seat: SeatId; away: boolean }
  | { k: 'timeout'; seat: SeatId }
  | { k: 'endVote'; seat: SeatId; on: boolean }
  | { k: 'end' }

/** The full state. Never sent as it is: the hole cards and the deck are cut by `view` */
export type HoldemState = {
  options: HoldemOptions
  /** In seat order */
  players: HoldemPlayer[]
  /** The cards not dealt yet: secret */
  deck: Card[]
  board: Card[]
  /** 1 for the first hand */
  hand: number
  button: SeatId
  sbSeat: SeatId
  bbSeat: SeatId
  sb: number
  bb: number
  street: HoldemStreet
  /** The highest bet on this street */
  currentBet: number
  /** The size of the last full bet or raise on this street: the smallest raise allowed */
  minRaise: number
  /** Who bet or raised last on this street: shows first at the showdown */
  aggressor: SeatId | null
  /** Counts every turn and phase change: the timers' ids */
  step: number
  phase: HoldemPhase
  last: HoldemHandEnd | null
  /** Seats that agree to stop the game after this hand */
  endVotes: SeatId[]
  /** Seats in the order they ran out of chips */
  outOrder: SeatId[]
  /** This hand only: a new hand starts a new log, so no card of an earlier hand is ever repeated */
  log: HoldemLog[]
  /** Who won the last hands, newest last: no cards in it */
  history: HoldemHistory[]
}

export type HoldemHistory = {
  hand: number
  winners: { seat: SeatId; amount: number }[]
  /** The best hand that won something; null when everyone else folded */
  category: HoldemCategory | null
}

export type HoldemAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** Bet or raise to `to` chips in front of you on this street: all you have is all-in */
  | { type: 'raise'; to: number }
  /** Sit out (checks or folds for you) or come back */
  | { type: 'away'; away: boolean }
  /** Agree, or stop agreeing, to end the game after this hand */
  | { type: 'endVote'; on: boolean }
  /** From the room only: the turn clock ran out */
  | { type: 'timeout'; step: number }
  /** From the room only: the host skips an absent player */
  | { type: 'skip'; seat: SeatId }
  /** From the room only: the pause after a hand is over */
  | { type: 'next'; hand: number }

/** One seat as everyone sees it */
export type HoldemPublicPlayer = {
  seat: SeatId
  stack: number
  bet: number
  committed: number
  folded: boolean
  allIn: boolean
  out: boolean
  away: boolean
  /** Holds two cards face down in this hand */
  inHand: boolean
  /** Shown at the showdown; empty otherwise */
  shown: Card[]
}

export type HoldemView = {
  you: SeatId | null
  options: HoldemOptions
  players: HoldemPublicPlayer[]
  /** Your own two cards; empty for a spectator or between hands with none */
  hole: Card[]
  board: Card[]
  hand: number
  button: SeatId
  sbSeat: SeatId
  bbSeat: SeatId
  sb: number
  bb: number
  /** The blind level of this hand: 1 at the start */
  level: number
  /** When and to what the blinds next go up; null when they never do */
  nextBlinds: { hand: number; sb: number; bb: number } | null
  street: HoldemStreet
  currentBet: number
  minRaise: number
  /** Every chip in the middle, the bets on this street included */
  pot: number
  step: number
  phase: HoldemPhase
  last: HoldemHandEnd | null
  endVotes: SeatId[]
  log: HoldemLog[]
  history: HoldemHistory[]
}
