import type { SeatId } from '../types.ts'

// 滬尾商行 (working title Tamsui Traders; owner's request 2026-11-14). An engine-building trading
// game on the Tamsui river harbour of the tea years: take goods from the wharf, buy stalls, shops
// and shipping houses that each give a lasting discount on one good, and win the custom of the big
// patrons. docs/PRD/e22-tamsui-traders.md has the rules.

/** The five goods, by index: tea, camphor, indigo, sugar, pepper. Index 5 in a token count is gold */
export type TradersGood = 0 | 1 | 2 | 3 | 4

/** How many of each good, then gold: six counts */
export type TradersTokens = number[]

/** How many of each good: five counts (a cost, a patron's need, a seat's bonuses) */
export type TradersGoods = number[]

export type TradersTier = 1 | 2 | 3

/** One line of the card set (shared/games/traders/bank.ts, generated from the reviewed CSV) */
export type TradersCardRow = {
  id: string
  tier: number
  bonus: number
  points: number
  cost: TradersGoods
}

export type TradersPatronRow = {
  id: string
  zh: string
  en: string
  need: TradersGoods
}

/** A card as the browser sees it */
export type TradersCard = {
  /** `t1-07`: unmistakable, so that the tests can tell it never leaks */
  id: string
  tier: TradersTier
  /** The good it discounts, by one, for good */
  bonus: TradersGood
  points: number
  cost: TradersGoods
}

export type TradersPatron = TradersPatronRow & { points: number }

export type TradersOptions = {
  /** Points that end the game at the end of the round */
  target: number
}

export type TradersReserved = {
  id: string
  /** Taken face down from a deck: only its owner knows it */
  blind: boolean
}

export type TradersPlayer = {
  seat: SeatId
  tokens: TradersTokens
  /** Card ids bought, in order */
  cards: string[]
  /** At most three */
  reserved: TradersReserved[]
  /** Patron ids that came to this seat */
  patrons: string[]
}

export type TradersMoveKind = 'take' | 'double' | 'reserve' | 'reserveTop' | 'buy' | 'pass' | 'skip'

/** The last finished turn, all of it public (a card reserved face down is only its tier) */
export type TradersMove = {
  seat: SeatId
  kind: TradersMoveKind
  /** Goods taken, one entry per token (`double` lists the good twice) */
  taken: number[]
  /** The card bought or reserved face up; null otherwise */
  card: string | null
  /** The deck reserved from */
  tier: number | null
  /** Tokens put back over the limit, by good and gold; null when none */
  returned: TradersTokens | null
  /** The patron who came this turn */
  patron: string | null
  /** A gold token came with a reservation */
  gold: boolean
}

export type TradersPhase =
  /** The seat in turn does one thing */
  | 'play'
  /** The seat in turn holds more than ten tokens and puts some back */
  | 'return'
  | 'over'

export type TradersEnd = 'target' | 'stalled' | 'cap'

/** The full state. Never sent as it is: the decks and face-down reservations are cut by `view` */
export type TradersState = {
  phase: TradersPhase
  target: number
  /** Seats in play order, from the random first player */
  order: SeatId[]
  /** Index into `order` and `players` */
  turn: number
  /** From 1; a round ends when the last in `order` has played */
  round: number
  /** Someone has reached the target: the game ends with this round */
  finalRound: boolean
  /** Consecutive turns in which nobody could do anything */
  passes: number
  end: TradersEnd | null
  bank: TradersTokens
  /** Card ids still to come, top first, per tier */
  decks: string[][]
  /** Four per tier, face up; null where the deck has run out */
  market: (string | null)[][]
  /** Patron ids still on display */
  patrons: string[]
  /** In play order */
  players: TradersPlayer[]
  /** The turn being finished while the seat returns tokens, else the last finished one */
  last: TradersMove | null
}

export type TradersAction =
  /** Three tokens of different goods (fewer only when fewer goods are left) */
  | { type: 'take'; goods: number[] }
  /** Two of one good, from a pile of four or more */
  | { type: 'double'; good: number }
  /** A face-up card into your hand, with a gold token if any is left */
  | { type: 'reserve'; card: string }
  /** The top card of a deck, face down */
  | { type: 'reserveTop'; tier: number }
  /** A face-up card or one you reserved */
  | { type: 'buy'; card: string }
  /** Over ten tokens: put one back (5 is gold) */
  | { type: 'return'; good: number }
  /** Only when nothing else is possible */
  | { type: 'pass' }
  /** From the room only: a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }

export type TradersReservedView = {
  tier: TradersTier
  /** Null for a card someone else reserved face down */
  card: TradersCard | null
}

export type TradersPlayerView = {
  seat: SeatId
  tokens: TradersTokens
  bonuses: TradersGoods
  points: number
  cardCount: number
  reserved: TradersReservedView[]
  patrons: TradersPatron[]
}

export type TradersMoveView = Omit<TradersMove, 'card' | 'patron'> & {
  card: TradersCard | null
  patron: TradersPatron | null
}

/** What one viewer sees: everything on the table, and only their own face-down reservations */
export type TradersView = {
  phase: TradersPhase
  target: number
  order: SeatId[]
  /** Whose turn it is; null once over */
  turn: SeatId | null
  round: number
  finalRound: boolean
  end: TradersEnd | null
  bank: TradersTokens
  /** Cards left in each deck */
  decks: number[]
  market: (TradersCard | null)[][]
  patrons: TradersPatron[]
  players: TradersPlayerView[]
  you: SeatId | null
  last: TradersMoveView | null
}
