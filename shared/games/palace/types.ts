import type { SeatId } from '../types.ts'

// 朝堂暗鬥 (working title Palace Bluff; owner's request 2026-11-14). A bluffing elimination game at an
// imperial court: every player has two face-down backers (roles) and some silver; on your turn you
// take one action, and any action that needs a role may be claimed by anyone, truthfully or not.
// Anyone may challenge a claim; the loser of a challenge turns a backer face up. The last player with
// a backer face down wins. docs/PRD/e17-palace-bluff.md has the rules and every decision.

/** The five roles at court, three copies of each in the deck */
export type PalaceRole = 'treasurer' | 'guard' | 'eunuch' | 'strategist' | 'dowager'

/** What a player may do on their turn */
export type PalaceAct =
  /** +1 silver; no role, cannot be blocked */
  | 'stipend'
  /** +2 silver; no role, blocked by the Treasurer */
  | 'grant'
  /** 7 silver: the target loses a backer; cannot be blocked, compulsory from 10 silver */
  | 'storm'
  /** Treasurer: +3 silver */
  | 'levy'
  /** Imperial Guard, 3 silver: the target loses a backer; blocked by the Empress Dowager */
  | 'arrest'
  /** Chief Eunuch: take 2 silver from the target; blocked by the Chief Eunuch or the Strategist */
  | 'extort'
  /** Strategist: draw two from the deck, keep as many as you had face down */
  | 'scheme'

/** The host's choice: seconds each response window stays open */
export type PalaceWindow = 10 | 15 | 20

export type PalaceOptions = {
  window: PalaceWindow
}

/** One physical card: the id is what the tests look for when they check that nothing leaks */
export type PalaceCard = { id: string; role: PalaceRole }

export type PalacePlayer = {
  seat: SeatId
  silver: number
  /** Face down, known only to this player */
  hidden: PalaceCard[]
  /** Face up, lost: public */
  lost: PalaceRole[]
}

/** The action being played out this turn */
export type PalaceTurn = {
  actor: SeatId
  act: PalaceAct
  target: SeatId | null
  /** Who blocked it and with which claimed role, once someone has */
  block: { by: SeatId; role: PalaceRole } | null
}

/** Which question a response window asks */
export type PalaceWindowKind =
  /** Does anyone challenge the actor's claimed role? */
  | 'challenge'
  /** Does anyone (the target, or anyone for a grant) block? */
  | 'block'
  /** Does anyone challenge the blocker's claimed role? */
  | 'challengeBlock'

/** What happens once someone has turned a backer face up */
export type PalaceThen =
  /** The turn is over */
  | 'end'
  /** The actor's claim stood: on to the block window, or straight to the effect */
  | 'block'
  /** The block fell: the action happens */
  | 'resolve'

export type PalacePhase =
  /** The actor picks an action */
  | { kind: 'choose' }
  /** Everyone in `eligible` answers or passes; any challenge or block ends it at once */
  | { kind: 'respond'; window: PalaceWindowKind; eligible: SeatId[]; passed: SeatId[] }
  /** `seat` picks which of their face-down backers to turn up */
  | { kind: 'lose'; seat: SeatId; then: PalaceThen }
  /** The actor, after a scheme, picks which cards to keep from their own and the two drawn */
  | { kind: 'exchange'; drawn: PalaceCard[] }
  | { kind: 'over' }

/** One line of the action log: everything in it is public */
export type PalaceLog =
  | { k: 'start'; seat: SeatId }
  | { k: 'declare'; seat: SeatId; act: PalaceAct; target: SeatId | null }
  | { k: 'challenge'; by: SeatId; of: SeatId; role: PalaceRole }
  /** The claim was true: shown, shuffled back and replaced */
  | { k: 'proved'; seat: SeatId; role: PalaceRole }
  /** The claim was a bluff */
  | { k: 'caught'; seat: SeatId; role: PalaceRole }
  | { k: 'block'; by: SeatId; role: PalaceRole }
  /** Nobody answered in time: the window closed with these seats passing */
  | { k: 'timeout'; seats: SeatId[] }
  | { k: 'lose'; seat: SeatId; role: PalaceRole }
  | { k: 'out'; seat: SeatId }
  | { k: 'gain'; seat: SeatId; silver: number }
  | { k: 'take'; seat: SeatId; from: SeatId; silver: number }
  | { k: 'exchanged'; seat: SeatId }
  | { k: 'blocked'; seat: SeatId }
  /** The action fizzled: its target is already out */
  | { k: 'fizzle'; seat: SeatId }
  | { k: 'refund'; seat: SeatId; silver: number }
  | { k: 'win'; seat: SeatId }

/** The full state. Never sent as it is: the cards are cut by `view` */
export type PalaceState = {
  windowSeconds: PalaceWindow
  /** In seat order */
  players: PalacePlayer[]
  deck: PalaceCard[]
  /** Whose turn it is */
  turn: SeatId
  /** Counts every phase change: the timers' ids, so each window gets a fresh clock */
  step: number
  phase: PalacePhase
  current: PalaceTurn | null
  /** Seats in the order they went out */
  outOrder: SeatId[]
  winner: SeatId | null
  log: PalaceLog[]
}

export type PalaceAction =
  | { type: 'act'; act: PalaceAct; target: SeatId | null }
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'block'; role: PalaceRole }
  /** Which face-down card to turn up, by id */
  | { type: 'lose'; card: string }
  /** Which cards to keep after a scheme, by id */
  | { type: 'keep'; cards: string[] }
  /** From the room only: a response window's clock ran out */
  | { type: 'timeout'; step: number }
  /** From the room only: a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }

/** One seat as everyone sees it */
export type PalacePublicPlayer = {
  seat: SeatId
  silver: number
  /** How many backers are still face down */
  hiddenCount: number
  lost: PalaceRole[]
  out: boolean
}

/** The phase as everyone sees it: the cards drawn by a scheme only go to the schemer */
export type PalacePublicPhase =
  | { kind: 'choose' }
  | { kind: 'respond'; window: PalaceWindowKind; eligible: SeatId[]; passed: SeatId[] }
  | { kind: 'lose'; seat: SeatId }
  | { kind: 'exchange'; keep: number }
  | { kind: 'over' }

export type PalaceView = {
  you: SeatId | null
  windowSeconds: PalaceWindow
  players: PalacePublicPlayer[]
  /** Your own face-down cards; empty for a spectator */
  hand: PalaceCard[]
  /** The two cards your scheme drew; empty unless you are choosing */
  drawn: PalaceCard[]
  deckSize: number
  turn: SeatId
  step: number
  phase: PalacePublicPhase
  current: PalaceTurn | null
  winner: SeatId | null
  log: PalaceLog[]
}
