import type { SeatId } from '../types.ts'

// 搭橋 (working title Word Bridge; owner's request 2026-11-14). A 5×5 grid of words. In the team
// game two partnerships, North–South and East–West, each have a caller who sees the secret key and
// bids a one-word clue with a number; their partners pick words that clue bridges to. In the
// co-op game two key holders take turns giving clues against a turn limit.
// docs/PRD/e20-word-bridge.md has the rules.

/** How the room plays: by the player count, or chosen */
export type WbModeChoice = 'auto' | 'teams' | 'duo'

export type WbOptions = {
  mode: WbModeChoice
  /** Minutes for a clue and again for the picks; 0 is no clock */
  clock: number
  /** Co-op only: how many clues the pair gets before the last stand */
  turns: number
}

/** The two partnerships, named as at a bridge table */
export type WbTeam = 'ns' | 'ew'

/** One word's colour on the team game's key */
export type WbCard = WbTeam | 'neutral' | 'mine'

/** One word's colour on one side of the co-op key */
export type WbDuoCard = 'target' | 'neutral' | 'mine'

export type WbClue = {
  text: string
  /** How many words it bridges to; 0 is "any number" */
  count: number
}

/** What happened, in order: public in both modes */
export type WbLogEntry =
  | { kind: 'clue'; seat: SeatId; text: string; count: number }
  /** `card`: what the word turned out to be, by the clue-giver's key */
  | { kind: 'pick'; seat: SeatId; index: number; card: WbCard | WbDuoCard }
  /** The turn ended without a miss: the pickers stopped, the clock ran out, or the room skipped */
  | { kind: 'end'; reason: 'stop' | 'time' | 'skipped' }
  /** Co-op: the clues are spent and the last stand begins */
  | { kind: 'final' }

export type WbPhase =
  /** Teams and roles are chosen; no words yet */
  | 'setup'
  /** The clue-giver bids */
  | 'clue'
  /** The pickers pick */
  | 'guess'
  /** Co-op only: the clues are spent, each key holder picks the partner's words, a miss loses */
  | 'final'
  | 'over'

export type WbEndReason =
  /** Every word of one side (or, co-op, all 15) found */
  | 'allFound'
  /** Someone picked an instant-loss word */
  | 'mine'
  /** Co-op: a wrong pick in the last stand */
  | 'finalMiss'
  /** Co-op: the room skipped a key holder in the last stand */
  | 'skipped'

export type WbEnding = { reason: WbEndReason; seat: SeatId | null }

type WbBase = {
  phase: WbPhase
  /** Seat order */
  players: SeatId[]
  clockMs: number
  /** The 25 words, row by row; empty in setup */
  words: string[]
  /** From 1 once play starts; timers and the screen key on it */
  turn: number
  clue: WbClue | null
  /** Picks so far this turn */
  picks: number
  log: WbLogEntry[]
  ending: WbEnding | null
}

export type WbTeamsState = WbBase & {
  mode: 'teams'
  teams: Record<WbTeam, SeatId[]>
  /** Each partnership's clue-giver */
  givers: Record<WbTeam, SeatId | null>
  /** Who went first, with 9 words */
  starting: WbTeam
  /** Whose turn it is */
  active: WbTeam
  /** The secret key, one card per word; empty in setup. Only `view` decides who sees it */
  key: WbCard[]
  revealed: boolean[]
  winner: WbTeam | null
}

export type WbDuoState = WbBase & {
  mode: 'duo'
  /** Who holds side 0 and side 1 of the key */
  holders: [SeatId, SeatId]
  /** Each side's key; empty in setup */
  keys: [WbDuoCard[], WbDuoCard[]]
  /** Words found: a target on the side whose clue it was */
  found: boolean[]
  /** misses[side][i]: picked on that side's clue and a bystander there; it may still be the other side's */
  misses: [boolean[], boolean[]]
  /** Whose clue it is */
  giverSide: 0 | 1
  turnsLeft: number
  totalTurns: number
  won: boolean
}

export type WbState = WbTeamsState | WbDuoState

export type WbAction =
  /** Setup, team game: move to that partnership */
  | { type: 'join'; team: WbTeam }
  /** Setup, team game: be your partnership's clue-giver */
  | { type: 'give' }
  /** Setup, co-op with three or more: hold that side of the key */
  | { type: 'hold'; side: 0 | 1 }
  /** Setup, team game: random partnerships and givers */
  | { type: 'shuffle' }
  /** Setup: deal the words and start */
  | { type: 'begin' }
  | { type: 'clue'; text: string; count: number }
  | { type: 'pick'; index: number }
  /** The pickers end their turn, after at least one pick */
  | { type: 'stop' }
  /** From the room only: a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }
  /** From the room only: the clock ran out */
  | { type: 'timeUp' }

/** A team-game viewer's role */
export type WbRole = 'giver' | 'picker' | 'spectator'

export type WbTeamsView = Omit<WbTeamsState, 'key'> & {
  you: SeatId | null
  role: WbRole
  yourTeam: WbTeam | null
  /** The key as this viewer may see it: a giver and everyone at the end all of it, others the revealed words */
  key: (WbCard | null)[]
  /** How many words each side still has to find: public, as the board shows it */
  left: Record<WbTeam, number>
}

export type WbDuoView = Omit<WbDuoState, 'keys'> & {
  you: SeatId | null
  /** Which side of the key you hold; null for a picker without one and a spectator */
  yourSide: 0 | 1 | null
  /** Each side as this viewer may see it: your own side, and both at the end */
  keys: [(WbDuoCard | null)[], (WbDuoCard | null)[]]
  /** Words still to find, of 15 */
  left: number
}

export type WbView = WbTeamsView | WbDuoView
