// 撞詞 (working title Clue Clash; owner's request 2026-11-14). 13 cards, played together. Each card
// one seat is the guesser, round the table, and everyone else sees the mystery word and secretly
// writes one clue (two each with three players). Clues that clash cancel: the room crosses out
// exact matches itself (width, case, punctuation and an English plural folded), and the givers then
// cross out any that mean the same. The guesser sees what is left and guesses once, or passes.
// Right scores a point; a pass loses this card; a wrong guess loses this card and the next.
//
// docs/PRD/e21-clue-clash.md has the rules and every detail decided here.
import { CC_WORDS } from './bank.ts'
import { CC_ERROR, clashKey, clueProblem, guessProblem, isRight, tidyClue } from './clue.ts'
import { CC_CARDS, clueClashInfo } from './info.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type { CcAction, CcClue, CcGuess, CcOptions, CcOutcome, CcState, CcView, CcWord } from './types.ts'

export const CLUE_MS = 90_000
export const REVIEW_MS = 45_000
export const GUESS_MS = 60_000

/** What `legalActions` lists for a clue or a guess: the browser asks for the real one */
export const SAMPLE_CLUES: readonly string[] = ['kiwi', 'oasis', 'zebra', 'quartz']

const ERROR = {
  badAction: 'games.clue-clash.error.badAction',
  over: 'games.clue-clash.error.over',
  notAPlayer: 'games.clue-clash.error.notAPlayer',
  systemOnly: 'games.clue-clash.error.systemOnly',
  notClues: 'games.clue-clash.error.notClues',
  guesserClues: 'games.clue-clash.error.guesserClues',
  out: 'games.clue-clash.error.out',
  count: 'games.clue-clash.error.count',
  redrawn: 'games.clue-clash.error.redrawn',
  notReview: 'games.clue-clash.error.notReview',
  notGiver: 'games.clue-clash.error.notGiver',
  done: 'games.clue-clash.error.done',
  badIndex: 'games.clue-clash.error.badIndex',
  same: 'games.clue-clash.error.same',
  notGuess: 'games.clue-clash.error.notGuess',
  notGuesser: 'games.clue-clash.error.notGuesser',
  notReveal: 'games.clue-clash.error.notReveal',
  notWrong: 'games.clue-clash.error.notWrong',
  nothingToSkip: 'games.clue-clash.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): CcAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, texts, index, on, text, seat } = action as Record<string, unknown>
  if (type === 'redraw' || type === 'ready' || type === 'pass' || type === 'accept' || type === 'next' || type === 'timeUp') {
    return { type }
  }
  if (type === 'clue' && Array.isArray(texts) && texts.every((item) => typeof item === 'string')) {
    return { type, texts: [...(texts as string[])] }
  }
  if (type === 'flag' && Number.isInteger(index) && typeof on === 'boolean') return { type, index: index as number, on }
  if (type === 'guess' && typeof text === 'string') return { type, text }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  return null
}

const wordAt = (id: number): CcWord => {
  const [category, word, alts] = CC_WORDS[id - 1]
  return { id, category, word, alts: alts === '' ? [] : alts.split('/') }
}

/** A word this room has not had; once all have come up, it starts over */
function drawWord(used: readonly number[], rng: Rng): { word: CcWord; used: number[] } {
  const all = CC_WORDS.map((_, index) => index + 1)
  const seen = new Set(used)
  const fresh = all.filter((id) => !seen.has(id))
  const id = rng.pick(fresh.length > 0 ? fresh : all)
  return { word: wordAt(id), used: fresh.length > 0 ? [...used, id] : [id] }
}

export const answersOf = (word: CcWord): string[] => [word.word, ...word.alts]

const giversOf = (state: Pick<CcState, 'players' | 'guesser'>): SeatId[] =>
  state.players.filter((seat) => seat !== state.guesser)

/** How many crosses take a clue out: half the givers, rounded up */
export const crossesNeeded = (givers: number): number => Math.ceil(givers / 2)

function emptyClues(state: Pick<CcState, 'players' | 'guesser' | 'perGiver'>): CcClue[] {
  return giversOf(state).flatMap((seat) =>
    Array.from({ length: state.perGiver }, () => ({
      seat,
      text: null,
      none: false,
      clash: false,
      flags: [],
      cancelled: null,
    })),
  )
}

/** A card dealt: the next guesser round the table, a new word, no clues */
function dealCard(state: CcState, rng: Rng): CcState {
  const guesser = state.players[(state.firstGuesser + state.turnsPlayed) % state.players.length]
  const { word, used } = drawWord(state.usedWords, rng)
  const next = { ...state, guesser }
  return {
    ...next,
    phase: 'clues',
    cardsUsed: state.cardsUsed + 1,
    word,
    usedWords: used,
    redrawn: false,
    clues: emptyClues(next),
    ready: [],
    guess: null,
    accepted: false,
  }
}

/** The clues are compared: clashing ones crossed out, then the givers' review (none if nothing came) */
function lock(state: CcState): CcState {
  const clues = state.clues.map((clue) => (clue.text === null ? { ...clue, none: true } : clue))
  const counts = new Map<string, number>()
  for (const clue of clues) {
    if (clue.text !== null) counts.set(clashKey(clue.text), (counts.get(clashKey(clue.text)) ?? 0) + 1)
  }
  const marked = clues.map((clue) => ({
    ...clue,
    clash: clue.text !== null && (counts.get(clashKey(clue.text)) ?? 0) > 1,
  }))
  const next = { ...state, clues: marked }
  return marked.some((clue) => clue.text !== null && !clue.clash) ? { ...next, phase: 'review' } : settle(next)
}

const lockIfAllIn = (state: CcState): CcState =>
  state.clues.every((clue) => clue.none || clue.text !== null) ? lock(state) : state

/** The review ends: a clue is out if it clashed or enough givers crossed it */
function settle(state: CcState): CcState {
  const need = crossesNeeded(giversOf(state).length)
  return {
    ...state,
    phase: 'guess',
    clues: state.clues.map((clue) => ({
      ...clue,
      cancelled: clue.text === null || clue.clash || clue.flags.length >= need,
    })),
  }
}

const settleIfAllReady = (state: CcState): CcState =>
  giversOf(state).every((seat) => state.ready.includes(seat)) ? settle(state) : state

const reveal = (state: CcState, guess: CcGuess): CcState => ({ ...state, phase: 'reveal', guess })

/** What this card came to: right, a pass, or wrong */
export function outcomeOf(state: Pick<CcState, 'guess' | 'accepted'>): Exclude<CcOutcome, 'lost'> {
  const guess = state.guess
  if (guess === null || guess.kind !== 'guess') return 'pass'
  return guess.correct || state.accepted ? 'right' : 'wrong'
}

/** The card is scored and filed; a wrong guess throws the next card away; then the next card or the end */
function nextCard(state: CcState, rng: Rng): CcState {
  const outcome = outcomeOf(state)
  const filed = {
    guesser: state.guesser,
    word: state.word,
    clues: state.clues.flatMap((clue) =>
      clue.text === null ? [] : [{ seat: clue.seat, text: clue.text, cancelled: clue.cancelled === true }],
    ),
    guess: state.guess,
    outcome,
    accepted: state.accepted,
  }
  let next: CcState = {
    ...state,
    history: [...state.history, filed],
    score: state.score + (outcome === 'right' ? 1 : 0),
    turnsPlayed: state.turnsPlayed + 1,
  }
  if (outcome === 'wrong') {
    if (next.cardsUsed < next.totalCards) {
      const { word, used } = drawWord(next.usedWords, rng)
      const lost = { guesser: state.guesser, word, clues: [], guess: null, outcome: 'lost' as const, accepted: false }
      next = { ...next, cardsUsed: next.cardsUsed + 1, usedWords: used, history: [...next.history, lost] }
    } else if (next.score > 0) {
      // No next card to lose: a point instead
      next = { ...next, score: next.score - 1, penalty: next.penalty + 1 }
    }
  }
  if (next.cardsUsed >= next.totalCards) return { ...next, phase: 'over' }
  return dealCard(next, rng)
}

/** What the room does for a seat whose player is gone */
function skip(state: CcState, seat: SeatId, rng: Rng): CcState | null {
  if (state.phase === 'clues') {
    const theirs = state.clues.filter((clue) => clue.seat === seat)
    if (theirs.length === 0 || theirs.every((clue) => clue.text !== null || clue.none)) return null
    return lockIfAllIn({
      ...state,
      clues: state.clues.map((clue) => (clue.seat === seat && clue.text === null ? { ...clue, none: true } : clue)),
    })
  }
  if (state.phase === 'review') {
    if (seat === state.guesser || state.ready.includes(seat)) return null
    return settleIfAllReady({ ...state, ready: [...state.ready, seat] })
  }
  if (seat !== state.guesser) return null
  if (state.phase === 'guess') return reveal(state, { kind: 'time' })
  if (state.phase === 'reveal') return nextCard(state, rng)
  return null
}

/** The givers still to send a clue */
const waitingOn = (state: CcState, seat: SeatId): boolean =>
  state.clues.some((clue) => clue.seat === seat && !clue.none)

export const clueClash: GameModule<CcState, CcAction, CcView, CcOptions> = {
  ...clueClashInfo,

  init(seats, options, rng) {
    const players = seats.map((seat) => seat.id)
    const base: CcState = {
      phase: 'clues',
      clock: options.clock,
      players,
      totalCards: CC_CARDS,
      perGiver: players.length === 3 ? 2 : 1,
      cardsUsed: 0,
      turnsPlayed: 0,
      firstGuesser: rng.int(players.length),
      guesser: players[0],
      word: wordAt(1),
      redrawn: false,
      usedWords: [],
      clues: [],
      ready: [],
      guess: null,
      accepted: false,
      score: 0,
      penalty: 0,
      history: [],
    }
    return dealCard(base, rng)
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip' || action.type === 'timeUp') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (action.type === 'skip') {
        if (!state.players.includes(action.seat)) return gameError(ERROR.notAPlayer)
        return skip(state, action.seat, rng) ?? gameError(ERROR.nothingToSkip)
      }
      if (!state.clock) return gameError(ERROR.nothingToSkip)
      if (state.phase === 'clues') return lock(state)
      if (state.phase === 'review') return settle(state)
      if (state.phase === 'guess') return reveal(state, { kind: 'time' })
      return gameError(ERROR.nothingToSkip)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (!state.players.includes(actor)) return gameError(ERROR.notAPlayer)
    const giver = actor !== state.guesser

    switch (action.type) {
      case 'clue': {
        if (state.phase !== 'clues') return gameError(ERROR.notClues)
        if (!giver) return gameError(ERROR.guesserClues)
        if (!waitingOn(state, actor)) return gameError(ERROR.out)
        if (action.texts.length !== state.perGiver) return gameError(ERROR.count, { count: state.perGiver })
        const texts = action.texts.map(tidyClue)
        for (const text of texts) {
          const problem = clueProblem(text, answersOf(state.word))
          if (problem !== null) return gameError(problem.key, problem.params)
        }
        if (new Set(texts.map(clashKey)).size !== texts.length) return gameError(CC_ERROR.twice)
        let slot = 0
        const clues = state.clues.map((clue) => (clue.seat === actor ? { ...clue, text: texts[slot++] } : clue))
        return lockIfAllIn({ ...state, clues })
      }
      case 'redraw': {
        if (state.phase !== 'clues') return gameError(ERROR.notClues)
        if (!giver) return gameError(ERROR.notGiver)
        if (state.redrawn) return gameError(ERROR.redrawn)
        const { word, used } = drawWord(state.usedWords, rng)
        return { ...state, word, usedWords: used, redrawn: true, clues: emptyClues(state) }
      }
      case 'flag': {
        if (state.phase !== 'review') return gameError(ERROR.notReview)
        if (!giver) return gameError(ERROR.notGiver)
        if (state.ready.includes(actor)) return gameError(ERROR.done)
        const clue = state.clues[action.index]
        if (clue === undefined || clue.text === null || clue.clash) return gameError(ERROR.badIndex)
        if (clue.flags.includes(actor) === action.on) return gameError(ERROR.same)
        const flags = action.on ? [...clue.flags, actor].sort((a, b) => a - b) : clue.flags.filter((seat) => seat !== actor)
        return { ...state, clues: state.clues.map((other, at) => (at === action.index ? { ...other, flags } : other)) }
      }
      case 'ready': {
        if (state.phase !== 'review') return gameError(ERROR.notReview)
        if (!giver) return gameError(ERROR.notGiver)
        if (state.ready.includes(actor)) return gameError(ERROR.done)
        return settleIfAllReady({ ...state, ready: [...state.ready, actor] })
      }
      case 'guess':
      case 'pass': {
        if (state.phase !== 'guess') return gameError(ERROR.notGuess)
        if (giver) return gameError(ERROR.notGuesser)
        if (action.type === 'pass') return reveal(state, { kind: 'pass' })
        const text = tidyClue(action.text)
        const problem = guessProblem(text)
        if (problem !== null) return gameError(problem.key, problem.params)
        return reveal(state, { kind: 'guess', text, correct: isRight(text, answersOf(state.word)) })
      }
      case 'accept': {
        if (state.phase !== 'reveal') return gameError(ERROR.notReveal)
        if (!giver) return gameError(ERROR.notGiver)
        if (outcomeOf(state) !== 'wrong') return gameError(ERROR.notWrong)
        return { ...state, accepted: true }
      }
      case 'next': {
        if (state.phase !== 'reveal') return gameError(ERROR.notReveal)
        if (giver) return gameError(ERROR.notGuesser)
        return nextCard(state, rng)
      }
    }
  },

  // The only place the word and the clues are cut: rule 4 of types.ts
  view(state, viewer) {
    const seat = viewer !== 'spectator' && state.players.includes(viewer) ? viewer : null
    const role = seat === null ? 'spectator' : seat === state.guesser ? 'guesser' : 'giver'
    const open = state.phase === 'reveal' || state.phase === 'over'
    const { word, usedWords: _used, clues, firstGuesser: _first, ...rest } = state
    const readable = (clue: CcClue): boolean => {
      if (open) return true
      if (role === 'giver') return state.phase !== 'clues' || clue.seat === seat
      // The guesser and spectators: only what survived, once the review is over
      return state.phase === 'guess' && clue.cancelled === false
    }
    return {
      ...rest,
      you: seat,
      role,
      word: open || role === 'giver' ? word : null,
      clues: clues.map((clue) => ({
        seat: clue.seat,
        status: clue.none ? 'none' : clue.text === null ? 'thinking' : 'sent',
        text: readable(clue) ? clue.text : null,
        clash: role === 'giver' || open || state.phase === 'guess' ? clue.clash : false,
        flags: role === 'giver' || open ? clue.flags : [],
        cancelled: clue.cancelled,
      })),
      cardsLeft: state.totalCards - state.cardsUsed,
    }
  },

  legalActions(state, seat) {
    if (!state.players.includes(seat)) return []
    const giver = seat !== state.guesser
    switch (state.phase) {
      case 'clues': {
        if (!giver || !waitingOn(state, seat)) return []
        const samples = SAMPLE_CLUES.filter((text) => clueProblem(text, answersOf(state.word)) === null)
        const actions: CcAction[] = [{ type: 'clue', texts: samples.slice(0, state.perGiver) }]
        if (!state.redrawn) actions.push({ type: 'redraw' })
        return actions
      }
      case 'review': {
        if (!giver || state.ready.includes(seat)) return []
        const flags = state.clues.flatMap((clue, index): CcAction[] =>
          clue.text === null || clue.clash ? [] : [{ type: 'flag', index, on: !clue.flags.includes(seat) }],
        )
        return [...flags, { type: 'ready' }]
      }
      case 'guess':
        return giver ? [] : [{ type: 'guess', text: SAMPLE_CLUES[0] }, { type: 'pass' }]
      case 'reveal':
        if (!giver) return [{ type: 'next' }]
        return outcomeOf(state) === 'wrong' ? [{ type: 'accept' }] : []
      default:
        return []
    }
  },

  // The table waits for a giver who has not written or crossed out, and for the guesser
  skipAction(state, seat) {
    const waiting =
      state.phase === 'clues'
        ? state.clues.some((clue) => clue.seat === seat && clue.text === null && !clue.none)
        : state.phase === 'review'
          ? seat !== state.guesser && !state.ready.includes(seat)
          : state.phase !== 'over' && seat === state.guesser
    return waiting ? { type: 'skip', seat } : null
  },

  // The card in the id, so that every card gets a fresh clock; none at the reveal
  timers(state) {
    if (!state.clock) return []
    const id = `${state.cardsUsed}-${state.redrawn ? 'b' : 'a'}`
    if (state.phase === 'clues') return [{ id: `clues-${id}`, ms: CLUE_MS, action: { type: 'timeUp' } }]
    if (state.phase === 'review') return [{ id: `review-${id}`, ms: REVIEW_MS, action: { type: 'timeUp' } }]
    if (state.phase === 'guess') return [{ id: `guess-${id}`, ms: GUESS_MS, action: { type: 'timeUp' } }]
    return []
  },

  // A clue typed in the chat would reach the guesser: closed until the reveal
  chatLocked(state) {
    return state.phase === 'clues' || state.phase === 'review' || state.phase === 'guess'
  },

  isOver(state) {
    return state.phase === 'over'
  },

  // Played together: everyone shares the table's score
  result(state): GameResult {
    return {
      summary: { key: `games.clue-clash.result.${tierOf(state.score)}`, params: { score: state.score, total: state.totalCards } },
      standings: state.players.map((seat) => {
        const turns = state.history.filter((card) => card.guesser === seat && card.outcome !== 'lost')
        return {
          seat,
          rank: 1,
          score: state.score,
          note: {
            key: 'games.clue-clash.note.guessed',
            params: { right: turns.filter((card) => card.outcome === 'right').length, turns: turns.length },
          },
        }
      }),
    }
  },
}

/** The verdict on a score out of 13 */
export function tierOf(score: number): string {
  if (score >= 13) return 'perfect'
  if (score >= 11) return 'great'
  if (score >= 9) return 'good'
  if (score >= 7) return 'fair'
  if (score >= 4) return 'warm'
  return 'cold'
}
