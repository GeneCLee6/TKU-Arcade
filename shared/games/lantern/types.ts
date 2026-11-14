import type { SeatId } from '../types.ts'

// 宮燈點點 (working title Lantern Lane; owner's request 2026-11-14). A co-operative real-time game:
// lanterns numbered 1–100 are dealt, level n gives each player n of them, and without a word the
// table lights them all along the avenue in rising order. Anyone may light their lowest lantern at
// any moment. Lighting one while someone still holds a lower one costs a match and burns those
// lower lanterns. docs/PRD/e15-lantern-lane.md has the rules.

/** How many levels a game has, by the number of players */
export type LanternLevelTable = 'standard' | 'short' | 'taster'

export type LanternOptions = {
  /** Matches to start with; 0 is "one per player" (at most `MAX_LIVES`) */
  lives: number
  levelTable: LanternLevelTable
}

export type LanternPlayer = {
  seat: SeatId
  /** Lantern numbers, lowest first. Secret: `view` sends a seat its own and everyone else's count */
  hand: number[]
  /** Hand up for the level to start (the focus moment) */
  ready: boolean
  /** Agrees to call moonlight */
  moonVote: boolean
  /** Lanterns this seat lit in order, all game */
  lit: number
  /** Lanterns this seat lit too early, all game */
  early: number
}

/** How a lantern got onto the avenue */
export type LanternHow =
  /** Lit in order */
  | 'lit'
  /** Lit while someone still held a lower one: a match is gone */
  | 'early'
  /** A lower lantern burned by someone else's early one */
  | 'burned'
  /** Shown by moonlight: each player's lowest */
  | 'moon'

export type LanternPileEntry = { card: number; seat: SeatId; how: LanternHow }

export type LanternReward = 'life' | 'moon'

/** What the last action did that the table should hear about */
export type LanternNews =
  | { kind: 'early'; seat: SeatId; card: number; burned: { seat: SeatId; card: number }[] }
  | { kind: 'moon'; shown: { seat: SeatId; card: number }[] }
  /** `reward` null for a level without one; `capped` when the table already had the most */
  | { kind: 'cleared'; level: number; reward: LanternReward | null; capped: boolean }

export type LanternPhase =
  /** The level is dealt; everyone raises a hand, and it starts once all have */
  | 'focus'
  /** Anyone lights their lowest lantern at any moment */
  | 'play'
  | 'over'

/** The full state. Never sent as it is: the hands are cut by `view` */
export type LanternState = {
  phase: LanternPhase
  levelTable: LanternLevelTable
  /** From 1; a level n deals n lanterns to each player */
  level: number
  totalLevels: number
  lives: number
  startLives: number
  /** Moonlight left */
  moons: number
  players: LanternPlayer[]
  /** This level's avenue, always in rising order (see rules.ts) */
  pile: LanternPileEntry[]
  /** What the last action that changed the table did; empty at the start */
  news: LanternNews[]
  /** Counts up with every `news`, so that a screen can tell a new one from the same one */
  newsId: number
  ending: 'won' | 'lost' | null
}

export type LanternAction =
  /** Hand up: ready for the level to start */
  | { type: 'ready' }
  /** Light this lantern, which must be your lowest: the number guards against a stale tap */
  | { type: 'light'; card: number }
  /** Agree, or stop agreeing, to call moonlight */
  | { type: 'moon'; on: boolean }
  /** From the room only: a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }

/** Everyone's public side of a seat */
export type LanternSeatView = Omit<LanternPlayer, 'hand'> & { count: number }

/** What one viewer sees: their own hand and everyone's counts; every hand once the game is over */
export type LanternView = Omit<LanternState, 'players'> & {
  you: SeatId | null
  /** Your own lanterns, lowest first; null for a spectator */
  hand: number[] | null
  players: LanternSeatView[]
  /** What clearing this level earns */
  reward: LanternReward | null
  /** Whatever was left in the hands, once the game is over; null before */
  leftover: { seat: SeatId; cards: number[] }[] | null
}
