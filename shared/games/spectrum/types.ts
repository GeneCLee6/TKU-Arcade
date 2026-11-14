import type { SeatId } from '../types.ts'

/** How the guesser guesses: the largest and the smallest number, or every answer in order */
export type SpectrumMode = 'extremes' | 'order'

export type SpectrumOptions = {
  mode: SpectrumMode
  /** Each answerer draws their own number, so two may hold the same one */
  duplicates: boolean
  /** Everyone is the guesser twice instead of once */
  twoRounds: boolean
  /** 90 seconds to answer and 60 to guess */
  clock: boolean
}

/** One line of the topic bank: category, topic, the 1 end, the 10 end (shared/games/spectrum/topics.ts) */
/** category, topic, scene, the 1 end, the 10 end (scripts/spectrum-topics.mjs) */
export type SpectrumTopicRow = readonly [string, string, string, string, string]

export type SpectrumTopic = {
  /** Stable within the bank: its line in the reviewed CSV, from 1 */
  id: number
  category: string
  topic: string
  /** What 1 means */
  low: string
  /** What 10 means */
  high: string
  /** Since 2026-11-14: a sentence setting the scene, what kind of answer to give; older topics have none */
  scene?: string
}

export type SpectrumAnswerer = {
  seat: SeatId
  /** 1 to 10: only `view` decides who gets to see it */
  number: number
  /** Null until sent. Others see it only once the answers are locked */
  text: string | null
  /** Not in this round's guess: the time ran out before an answer, or the host skipped the seat */
  out: boolean
}

export type SpectrumGuess =
  | { kind: 'extremes'; max: SeatId; min: SeatId }
  /** Lowest number first */
  | { kind: 'order'; seats: SeatId[] }

/** Why a round was scored with no guess */
export type SpectrumMiss =
  /** Fewer than two answers came in, so there was nothing to compare */
  | 'tooFew'
  /** The guesser's time ran out */
  | 'time'
  /** The host skipped the guesser, who was gone */
  | 'skipped'

export type SpectrumReveal = {
  /** Null when nobody guessed: `missed` says why */
  guess: SpectrumGuess | null
  missed: SpectrumMiss | null
  /** The answerers the guess got right: in their very place, or picked as the largest or smallest */
  correct: SeatId[]
  /**
   * Since 2026-11-14 (擁有者: the standings made no sense): the answerers a full order put one place
   * off, worth half. A round from before has none
   */
  close?: SeatId[]
  /** What each seat gained this round, by seat */
  points: number[]
}

/** A finished round, all of it public */
export type SpectrumRound = {
  round: number
  guesser: SeatId
  topic: SpectrumTopic
  answerers: SpectrumAnswerer[]
  reveal: SpectrumReveal
}

export type SpectrumPhase =
  /** The guesser picks this round's topic from a card of four; the numbers are already dealt */
  | 'choosing'
  /** Answerers write; nobody sees anyone else's answer yet */
  | 'answering'
  /** The answers are locked and shown; the guesser guesses */
  | 'guessing'
  /** The numbers are shown, until the guesser moves on */
  | 'reveal'
  /** The last round's reveal stays up */
  | 'over'

export type SpectrumPlayer = {
  seat: SeatId
  score: number
  /** Points won as the guesser */
  guessed: number
  /** Points won as an answerer the guesser read right */
  read: number
}

/** The full state: everyone's number, and answers before they are locked. Never sent as it is */
export type SpectrumState = {
  phase: SpectrumPhase
  mode: SpectrumMode
  duplicates: boolean
  twoRounds: boolean
  clock: boolean
  /** In seat order */
  players: SpectrumPlayer[]
  /** The first round's guesser; the role then moves one seat on each round */
  firstGuesser: SeatId
  /** From 1 */
  round: number
  totalRounds: number
  guesser: SeatId
  /**
   * This round's card: the topics the guesser chooses from (owner, 2026-11-13). Absent in a state
   * saved before cards came in
   */
  card?: SpectrumTopic[]
  /** The topic the guesser chose; null while choosing */
  topic: SpectrumTopic | null
  /** Every topic this room has had on a card, so that none comes twice */
  usedTopics: number[]
  /** Everyone but the guesser, in seat order */
  answerers: SpectrumAnswerer[]
  /** This round's, at `reveal` and `over`; otherwise null */
  reveal: SpectrumReveal | null
  /** The rounds before this one */
  history: SpectrumRound[]
}

export type SpectrumAction =
  /** The guesser, while choosing: one of the card's topics, by id */
  | { type: 'chooseTopic'; id: number }
  /** An answerer's answer, which a later one replaces until the answers are locked */
  | { type: 'submitAnswer'; text: string }
  | { type: 'guessExtremes'; max: SeatId; min: SeatId }
  /** Every answer in the guess, lowest number first */
  | { type: 'guessOrder'; seats: SeatId[] }
  /** The guesser, after the reveal: on to the next round */
  | { type: 'next' }
  /** From the room only (`skipAction`): a seat whose player is gone */
  | { type: 'skip'; seat: SeatId }
  /** From the room only (`timers`): the choosing, the answering or the guessing time is up */
  | { type: 'timeUp' }

export type SpectrumAnswerStatus = 'thinking' | 'answered' | 'out'

export type SpectrumAnswererView = {
  seat: SeatId
  status: SpectrumAnswerStatus
  /** Null for an answer this viewer may not see yet */
  text: string | null
  /** Null for a number this viewer may not see */
  number: number | null
}

/**
 * What one viewer sees: an answerer their own number only, the guesser and spectators none, and
 * nobody another's answer before the answers are locked. The reveal shows everything.
 */
export type SpectrumView = Omit<SpectrumState, 'answerers' | 'usedTopics' | 'firstGuesser' | 'card'> & {
  /** This round's card, which everyone sees (empty in a round from before cards) */
  card: SpectrumTopic[]
  /** The viewer's own seat; null for a spectator */
  you: SeatId | null
  answerers: SpectrumAnswererView[]
}
