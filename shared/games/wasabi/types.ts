import type { SeatId } from '../types.ts'

// 芥末餃子 (working title Wasabi Dumplings; owner's brief 2026-11-14). A bluffing and bidding game at
// a dumpling stall: every player has four dumplings, three plain and one full of wasabi. Hide them
// in your steamer, bid how many you can eat without biting the wasabi, then eat.
// docs/PRD/e19-wasabi-dumplings.md has the rules.

export type WasabiDisc = 'plain' | 'wasabi'

export type WasabiOptions = {
  /** Gold chopsticks that win: 2 by the standard rule */
  goal: number
}

export type WasabiPlayer = {
  seat: SeatId
  /** Dumplings still owned (not lost): plain ones and the wasabi one (0 once lost) */
  plain: number
  wasabi: number
  /** Placed this round, bottom first; the top is the last. Secret until eaten */
  stack: WasabiDisc[]
  /** How many from the top have been eaten (turned face up) */
  eaten: number
  /** Gold chopsticks: bids won */
  points: number
  /** Lost every dumpling */
  out: boolean
  /** Passed in this bidding */
  passed: boolean
  /** Placed their first dumpling this round (the opening, everyone at once) */
  placed: boolean
}

export type WasabiPhase =
  /** Everyone puts one dumpling in their steamer at once */
  | 'opening'
  /** In turn: add a dumpling, or start the bidding */
  | 'adding'
  /** In turn: raise or pass */
  | 'bidding'
  /** The highest bidder eats, their own steamer first */
  | 'eating'
  /** The bidder bit wasabi: a dumpling is taken from them */
  | 'losing'
  | 'roundEnd'
  | 'over'

export type WasabiBite = { seat: SeatId; disc: WasabiDisc }

export type WasabiRoundEnd = {
  round: number
  bidder: SeatId
  bid: number
  /** Ate them all */
  success: boolean
  /** Whose wasabi was bitten */
  wasabiOf: SeatId | null
  /** Out with the dumpling just lost */
  eliminated: boolean
  /** What the bidder lost; secret but to the bidder, cut by `view` */
  lost: WasabiDisc | null
}

/** The full state. Never sent as it is: stacks and what was lost are cut by `view` */
export type WasabiState = {
  phase: WasabiPhase
  players: WasabiPlayer[]
  round: number
  /** Who opened the turns this round */
  starter: SeatId
  /** Whose turn: in turn order while adding and bidding; the bidder eating; the one taking a dumpling */
  current: SeatId
  /** The highest bid so far; 0 before any */
  bid: number
  bidder: SeatId | null
  /** This round's bites, in order */
  bites: WasabiBite[]
  /** Whose wasabi stopped the eating */
  wasabiOf: SeatId | null
  lastRound: WasabiRoundEnd | null
  /** Points that win */
  goal: number
  /** Set when the game ends */
  winner: SeatId | null
}

export type WasabiAction =
  | { type: 'place'; disc: WasabiDisc }
  | { type: 'bid'; count: number }
  | { type: 'pass' }
  | { type: 'eat'; seat: SeatId }
  /** The wasabi's owner takes one of the bidder's dumplings, face down: `index` in a shuffled row */
  | { type: 'take'; index: number }
  /** The bidder bit their own wasabi: they choose what to lose */
  | { type: 'discard'; disc: WasabiDisc }
  /** Anyone still in, or the room's clock: the next round */
  | { type: 'next' }
  /** From the room only: a gone player's default move */
  | { type: 'skip'; seat: SeatId }

export type WasabiPlayerView = Omit<WasabiPlayer, 'plain' | 'wasabi' | 'stack'> & {
  /** How many dumplings they own: public */
  owned: number
  /** Your own counts; null for anyone else */
  plain: number | null
  wasabi: number | null
  /** Bottom first: the kind where you may see it (yours, or eaten), null where you may not */
  stack: (WasabiDisc | null)[]
}

/** What one viewer sees */
export type WasabiView = Omit<WasabiState, 'players' | 'lastRound'> & {
  you: SeatId | null
  players: WasabiPlayerView[]
  /** Dumplings in all the steamers: the highest bid possible */
  total: number
  lastRound: WasabiRoundEnd | null
}
