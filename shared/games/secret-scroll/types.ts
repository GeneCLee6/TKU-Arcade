import type { SeatId } from '../types.ts'

// 奪祕笈 (working title Secret Scroll; owner's request 2026-11-14). A small-deck deduction game in a
// jianghu world: every player holds one character card, draws one on their turn and plays one of
// the two. Knock the others out, or hold the highest card when the deck runs dry.
// docs/PRD/e18-secret-scroll.md has the rules.

/** Card values: 1–8 are the deck, 0 is the optional Beggar for big tables */
export type ScrollCard = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type ScrollLength = 'standard' | 'short'

export type ScrollOptions = {
  /** How many renown tokens win: standard 7/5/4/3 by players, short 4/3/3/2 */
  length: ScrollLength
  /** Two Beggars (value 0) join the deck: meant for 5–6 players */
  beggars: boolean
}

export type ScrollPlayer = {
  seat: SeatId
  /** One card between turns, two on your own turn. Secret: cut by `view` */
  hand: ScrollCard[]
  /** Played and knocked-away cards, face up, in order */
  discards: ScrollCard[]
  /** Out of this round */
  out: boolean
  /** Played the Monk: no card can pick them until their next turn */
  shielded: boolean
  /** Renown tokens: rounds won */
  tokens: number
}

/** Something one seat now knows: a hand, or the top of the deck */
export type ScrollSeen = { seat: SeatId; of: SeatId | 'deck'; card: ScrollCard }

export type ScrollOutcome =
  /** No one could be picked, or a card with no effect (the Strategist) */
  | 'none'
  /** Constable: the guess was right */
  | 'hit'
  | 'miss'
  /** Spy: looked at a hand */
  | 'peek'
  /** Duelist: the player won, lost or tied */
  | 'won'
  | 'lost'
  | 'tie'
  /** Monk */
  | 'shield'
  /** Drunkard: the target threw their card away and drew */
  | 'redraw'
  /** Mask Maker */
  | 'swap'
  /** The Scroll was thrown away: its holder is out */
  | 'scroll'
  /** Beggar: looked at the top of the deck */
  | 'peekDeck'
  /** The room skipped a gone player: they fold */
  | 'fold'

/** One play, with what it showed. Public but for `seen`, which `view` cuts to each viewer */
export type ScrollEvent = {
  seat: SeatId
  /** The card played; null for a fold */
  card: ScrollCard | null
  target: SeatId | null
  /** Constable's guess */
  guess: ScrollCard | null
  outcome: ScrollOutcome
  /** Who went out with this play */
  out: SeatId[]
  /** Cards that went face up: a knocked-out hand, the Drunkard's victim's card */
  shown: { seat: SeatId; card: ScrollCard }[]
  /** Private: who learned what */
  seen: ScrollSeen[]
}

export type ScrollRoundEnd = {
  round: number
  /** Everyone else was out, or the deck ran dry and the cards were compared */
  reason: 'last' | 'deck'
  winners: SeatId[]
  /** The hands still in at the end, face up */
  hands: { seat: SeatId; card: ScrollCard }[]
}

export type ScrollPhase = 'turn' | 'roundEnd' | 'over'

/** The full state. Never sent as it is: hands, the deck and the face-down card are cut by `view` */
export type ScrollState = {
  phase: ScrollPhase
  players: ScrollPlayer[]
  /** Whose turn; they hold two cards */
  current: SeatId
  round: number
  /** Tokens that win the game */
  goal: number
  length: ScrollLength
  beggars: boolean
  /** Top first. Secret */
  deck: ScrollCard[]
  /** The card set aside face down at the start of the round; the Drunkard draws it if the deck is dry */
  hidden: ScrollCard | null
  /** With two players, three more set aside face up */
  faceUp: ScrollCard[]
  /** This round's plays, oldest first */
  events: ScrollEvent[]
  /** The round just finished; null in round 1 */
  lastRound: ScrollRoundEnd | null
}

export type ScrollAction =
  | { type: 'play'; card: ScrollCard; target: SeatId | null; guess: ScrollCard | null }
  /** Anyone at the table, or the room's clock: the next round, after a round ends */
  | { type: 'next' }
  /** From the room only: a gone player folds this round */
  | { type: 'skip'; seat: SeatId }

export type ScrollPlayerView = Omit<ScrollPlayer, 'hand'> & {
  /** Only your own; null for anyone else's */
  hand: ScrollCard[] | null
  handCount: number
}

export type ScrollEventView = Omit<ScrollEvent, 'seen'> & {
  /** Only what this viewer learned */
  seen: ScrollSeen[]
}

/** What one viewer sees */
export type ScrollView = Omit<ScrollState, 'players' | 'deck' | 'hidden' | 'events'> & {
  you: SeatId | null
  players: ScrollPlayerView[]
  deckCount: number
  hiddenCount: number
  events: ScrollEventView[]
}
