import type { SeatId } from '../types.ts'
import type { Face } from './board.ts'
import type { FullFace } from './fullFaces.ts'

export type DiceKind = 'four-sided' | 'six-sided'

/** The simplified ladder of 79 cells (board.ts), or the full board with money (boardFull.ts, C6) */
export type Edition = 'simple' | 'full'

/** The room's options (info.ts) */
export type PromotionOptions = {
  /** The simple edition (the default) or the full one; the other two are the simple edition's */
  edition: Edition
  /** A four-sided top showing the result, or four six-sided dice read through SIX_SIDED_TABLE */
  dice: DiceKind
  /** How many rounds (every seat rolling once) before the game ends on seniority */
  turnLimit: number
  // The full edition's (C8): shown only for it
  /** How long a seat has to answer an offered post or a purchase before the default is taken */
  decisionSeconds: number
  /** Whether a seat sent to a minor post may buy a regular office instead (捐納) */
  buying: boolean
  /** Whether the game ends as soon as someone reaches grand congratulations (大賀) */
  endAtDahe: boolean
}

export type PromotionPlayer = {
  seat: SeatId
  /** The id of the cell this seat stands on */
  cell: string
  /** How many times this seat has rolled */
  rolls: number
  /** How many of those rolls were zang */
  demotions: number
  /** Since 2026-11-13: every roll, for the career route shown at the end. A game from before has none */
  route?: SimpleRouteStep[]
}

/** One roll of a seat's career in the simple edition: the result and the cell it led to */
export type SimpleRouteStep = { round: number; face: Face; to: string }

/** The latest roll, enough to animate it: the top or dice, then the piece from one cell to another */
export type LastRoll = {
  seat: SeatId
  face: Face
  /** The four dice as rolled, or null when the game uses the four-sided top */
  dice: number[] | null
  from: string
  to: string
}

/** Why the game ended: someone reached the end cell, or the round limit ran out */
export type PromotionEnding = 'retired' | 'turnLimit'

/** The full state. Nothing in this game is hidden: chance lives in the Rng, outside the state */
export type PromotionState = {
  /** In seat order */
  players: PromotionPlayer[]
  /** Whose roll it is; null once the game is over */
  turn: SeatId | null
  /** The seat that opens each round */
  first: SeatId
  /** The round being played, from 1. Stays at the last one played when the game ends */
  round: number
  turnLimit: number
  dice: DiceKind
  last: LastRoll | null
  ending: PromotionEnding | null
  /** The seat that reached the end cell; null while playing and in a turn-limit ending */
  winner: SeatId | null
}

export type PromotionAction =
  | { type: 'roll' }
  | { type: 'pass' }
  // The full edition's decisions (C8)
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'skip' }
  | { type: 'buy'; cell: string }

/** What every viewer sees: the whole state, and which seat is theirs */
export type PromotionView = PromotionState & {
  /** The viewer's own seat; null for a spectator */
  you: SeatId | null
}

// ── The full edition (C6, rulesFull.ts) ─────────────────────────────────────────────────────

/** A seat still playing, retired (a retirement cell), or put out (exiled) */
export type FullStatus = 'active' | 'retired' | 'out'

export type FullPlayer = {
  seat: SeatId
  /** The id of the cell this seat stands on (boardFull.ts) */
  cell: string
  /** Seniority for the final comparison: the cell's rank, kept from before on some retirements */
  rank: number
  /** Silver; may go below zero (a debt), which the end settles like any other balance */
  money: number
  /** Examination standing: 0 none, 1 regular route (a tribute student), 2 juren, 3 jinshi */
  degree: 0 | 1 | 2 | 3
  /** A military jinshi, which opens the Imperial Guard to a civilian */
  wu: boolean
  /** A Banner household (旗籍) rather than a civilian one (民籍); decided by the birth roll */
  banner: boolean
  /** The cell the birth roll placed this seat on; null until this seat has rolled for the first time */
  origin: string | null
  status: FullStatus
  /** How many turns this seat has rolled */
  rolls: number
  // ── Since C8 (rulesVersion 2); a game from before has players without them ──
  /** Holds an office bought (捐班): an irregular route (異途), which the regular route's posts refuse */
  bought?: boolean
  /** Concurrent honorary titles held (兼銜), at most MAX_TITLES: each a grade more in the comparison */
  titles?: number
  /**
   * In an event zone (京察, ...) or dismissed (革職): the post held, which the event's outcome or the
   * restoration (開復) is reckoned from
   */
  post?: string | null
  /**
   * Since 2026-11-13: every turn that moved this seat or asked it something, from its birth roll on,
   * for the career route shown at the end. A game from before has none
   */
  route?: FullRouteStep[]
}

/** One turn of a seat's career: what the dice made, where it led, what was answered, the silver */
export type FullRouteStep = {
  round: number
  /** The birth roll, which placed the seat on its origin */
  birth?: true
  /** Each throw that scored, in order: the move's, then an event zone's or a restoration's */
  throws: FullRouteThrow[]
  /** Every cell landed on, in order */
  path: string[]
  /** What the seat answered, when the turn asked */
  decision?: FullDecision
  /** The seat's silver gained (or, negative, lost) in the turn */
  silver: number
}

/**
 * A throw of a career route: its combination, the face of its first move (a pair's, three of a
 * kind's, two pairs' better one), and for a throw that decided an event zone or a restoration, the
 * zone and the face that decided it
 */
export type FullRouteThrow = { combo: ComboKind; face?: FullFace; zone?: string }

/** How four dice read (rulesFull.ts `readThrow`) */
export type ComboKind =
  | 'four'
  | 'allGraft'
  | 'run'
  | 'redPairs'
  | 'pairs'
  | 'three'
  | 'pair'
  | 'cancel'
  | 'none'

/** A step of a move: one of the six results, four of a kind's ennoblement, or four graft's dismissal */
export type FullStep = FullFace | 'fengjue' | 'dismiss'

export type FullThrow = {
  dice: number[]
  combo: ComboKind
  /** The steps it moves, in order; empty for a throw that scores nothing */
  steps: FullStep[]
  /**
   * A throw for an event zone (C8) rather than a move: the zone, and the face that decided it; null
   * when the throw scored nothing and the seat waits for its next turn
   */
  event?: { cell: string; face: FullFace | null }
}

/** Why silver changed hands */
export type TransferReason =
  | 'courtesy'
  | 'reward'
  | 'fee'
  | 'congrats'
  | 'run'
  | 'rank'
  | 'share'
  | 'fine'
  | 'buy'

export type Transfer = {
  /** A seat, or null for the bank */
  from: SeatId | null
  to: SeatId | null
  amount: number
  why: TransferReason
}

/** The latest turn, enough to animate it: the throws, each cell landed on, the silver that moved */
export type FullLastTurn = {
  seat: SeatId
  /** The first roll of a seat, which decides its origin and household instead of moving */
  birth: boolean
  throws: FullThrow[]
  from: string
  /** Every cell landed on, in order (after a redirect for a missing requirement) */
  path: string[]
  transfers: Transfer[]
  /** A decision this turn ended with (C8): what was answered, for which cell, at what price */
  decision?: FullDecision
}

/** What a seat answered: took or turned down an offered post, took the minor post, or bought */
export type FullDecisionKind = 'accept' | 'decline' | 'skip' | 'buy'

export type FullDecision = {
  kind: FullDecisionKind
  /** The cell offered, or the minor post, or the office bought */
  cell: string
  price: number
  /** Nobody answered: the room took the default when the time ran out, or for an absent seat */
  timedOut: boolean
}

/**
 * A decision the game waits for (C8): an offered post to accept or decline, or a minor post to take
 * or buy a regular office instead of. The turn stays with `seat` until it is answered.
 */
export type FullPending =
  | { kind: 'offer'; seat: SeatId; cell: string; from: string }
  | {
      kind: 'buy'
      seat: SeatId
      cell: string
      from: string
      choices: { cell: string; price: number }[]
    }

/** The full edition's room options, as a game since C8 keeps them */
export type FullRules = {
  decisionMs: number
  buying: boolean
  endAtDahe: boolean
  /**
   * Since 2026-11-13 (擁有者): a throw that scores nothing is thrown again until one does, so every
   * turn has a result. A game from before has none and throws once a turn
   */
  rethrow?: boolean
}

/** One seat's line in the final settlement */
export type FullSettlementLine = {
  seat: SeatId
  /** The grade compared (boardFull.ts `gradeOf`); 0 for a seat that was put out */
  grade: number
  /** Silver before the settlement */
  before: number
  /** What rank comparison (對品) gave or took */
  duipin: number
  /** The bank's share (分注), with the remainder for the poorest */
  share: number
  after: number
}

export type FullSettlement = {
  lines: FullSettlementLine[]
  /** The seat that got the bank's remainder, and how much; null when it split evenly */
  remainder: { seat: SeatId; amount: number } | null
}

/** Why the full edition ended: one seat left playing, the round limit, or (C8) the first 大賀 */
export type FullEnding = 'oneLeft' | 'turnLimit' | 'dahe'

export type PromotionFullState = {
  edition: 'full'
  /** In seat order */
  players: FullPlayer[]
  /** Whose roll it is; null once the game is over */
  turn: SeatId | null
  /** The seat that rolled first */
  first: SeatId
  /** The round being played, from 1 */
  round: number
  turnLimit: number
  /** The common pot (公注) */
  bank: number
  last: FullLastTurn | null
  ending: FullEnding | null
  /** Null until the game is over */
  settlement: FullSettlement | null
  // ── Since C8. A game from before has none of these and plays on under the first rules ──
  /** Which rules and board (boardFull.ts `fullBoard`); missing is 1 */
  rulesVersion?: 2
  rules?: FullRules
  pending?: FullPending | null
  /** How many decisions have been asked: the timer's id, so that each gets a fresh countdown */
  decisions?: number
  /** Every roll and every answer so far: what the screen counts to know a new turn has come */
  acts?: number
}

/** Nothing in the full edition is hidden either */
export type PromotionFullView = PromotionFullState & { you: SeatId | null }

/** Either edition's state: the simple one has no `edition` field (its states predate it) */
export type PromotionAnyState = PromotionState | PromotionFullState
export type PromotionAnyView = PromotionView | PromotionFullView
