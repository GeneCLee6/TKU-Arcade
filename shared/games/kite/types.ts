import type { SeatId } from '../types.ts'

// 放風箏 (working title Kite Day; owner's request 2026-11-14). A co-operative card game: on the
// Tamsui riverside the table sends up five kite trains (many kites on one line), each
// colour in order from 1 to 5. Nobody sees their own kites, only everyone else's; notes passed
// along the riverbank (hints) are the only way to tell a friend what they hold.
// docs/PRD/e16-kite-day.md has the rules.

/** The five colours, and the sixth (rainbow) when the host turns it on */
export type KiteSuit = 'red' | 'gold' | 'jade' | 'blue' | 'white' | 'rainbow'

export type KiteRank = 1 | 2 | 3 | 4 | 5

export type KiteOptions = {
  /** A sixth string of rainbow kites, which every colour note points at */
  rainbow: boolean
  /** Seconds a turn may take; 0 for no clock */
  turnSeconds: number
}

/**
 * What a seat can still rule in for one of its cards, from the notes it was given and nothing else:
 * a note pointing at the card narrows it to that colour or number, a note passing it by rules that
 * colour or number out. Public: everyone saw the notes.
 */
export type KiteKnowledge = {
  suits: KiteSuit[]
  ranks: KiteRank[]
}

/** One kite in a hand. `id` is its place in the shuffled deck, so it tells nothing of the card */
export type KiteCard = {
  id: number
  suit: KiteSuit
  rank: KiteRank
  knows: KiteKnowledge
}

/** A card face, once it is public (played or thrown away) */
export type KiteFace = { suit: KiteSuit; rank: KiteRank }

export type KiteHint = { kind: 'suit'; suit: KiteSuit } | { kind: 'rank'; rank: KiteRank }

/** One line of the table's log; all of it public */
export type KiteLogEntry =
  | {
      kind: 'hint'
      turn: number
      seat: SeatId
      to: SeatId
      hint: KiteHint
      /** The card ids the note pointed at */
      cards: number[]
      /** Their places in that hand, from 0 (the newest card is at 0) */
      slots: number[]
    }
  | { kind: 'play'; turn: number; seat: SeatId; card: KiteFace; slot: number; ok: boolean }
  | { kind: 'discard'; turn: number; seat: SeatId; card: KiteFace; slot: number }
  /** The turn went by: the clock ran out, or the room skipped a player who is away */
  | { kind: 'pass'; turn: number; seat: SeatId; reason: 'timeUp' | 'skip' }

/** How it ended: every string full, the third burn, or the last round after the deck ran out */
export type KiteEnding = 'perfect' | 'burned' | 'deck'

export type KiteStacks = Partial<Record<KiteSuit, number>>

/** The full state. Never sent as it is: the deck and each seat's own hand are cut by `view` */
export type KiteState = {
  /** Seat order, which is turn order */
  players: SeatId[]
  /** The colours in play, five or six */
  suits: KiteSuit[]
  /** Each player's hand, in `players` order; the newest card first */
  hands: KiteCard[][]
  /** What is left to draw; the next card is at 0 */
  deck: KiteCard[]
  /** The highest number flying on each colour's train, 0 for none */
  stacks: KiteStacks
  /** Set aside and snapped, in order */
  discards: KiteFace[]
  /** Notes left to pass */
  notes: number
  /** Lines snapped by a wrong play */
  burns: number
  /** Index into `players` of whose turn it is */
  turn: number
  /** From 1 */
  turnNumber: number
  /** Turns left once the deck has run out; null before */
  finalTurns: number | null
  /** How many kites each seat flew, in `players` order */
  hung: number[]
  log: KiteLogEntry[]
  turnSeconds: number
  ending: KiteEnding | null
}

export type KiteAction =
  | { type: 'hintSuit'; to: SeatId; suit: KiteSuit }
  | { type: 'hintRank'; to: SeatId; rank: KiteRank }
  | { type: 'play'; card: number }
  | { type: 'discard'; card: number }
  /** From the room only: the turn's clock ran out */
  | { type: 'timeUp'; turn: number }
  /** From the room only: the player whose turn it is is away */
  | { type: 'skip'; seat: SeatId }

/** A card as one viewer sees it: the face is null where they may not know it */
export type KiteViewCard = {
  id: number
  suit: KiteSuit | null
  rank: KiteRank | null
  knows: KiteKnowledge
}

export type KiteViewHand = { seat: SeatId; cards: KiteViewCard[] }

/** What one viewer sees: everyone's cards but their own, and the deck only as a count */
export type KiteView = Omit<KiteState, 'hands' | 'deck' | 'turn'> & {
  you: SeatId | null
  hands: KiteViewHand[]
  /** Whose turn it is */
  current: SeatId
  deckCount: number
  score: number
  maxScore: number
}
