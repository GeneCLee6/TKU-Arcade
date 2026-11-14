// 慘度排排站 (working title Misery Line; owner's request 2026-11-14). Every card is a miserable event
// with a misery index from 1 to 100. Each player starts with a few face-up cards, kept in order: their
// line. On a turn a card comes up with its index hidden and the player picks the gap in their own
// line where it belongs. Right, they keep it. Wrong, and with steals on, the next players in seat
// order try it in their own lines, once each; nobody gets it, it is thrown away. The index is shown
// when the tries are over. The first to the target wins.
//
// docs/PRD/e14-misery-line.md has the rules and every detail decided here.
import { MISERY_CARDS } from './bank.ts'
import { miseryInfo } from './info.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  MiseryAction,
  MiseryAttempt,
  MiseryCard,
  MiseryClock,
  MiseryLine,
  MiseryOptions,
  MiseryState,
  MiseryView,
} from './types.ts'

const ERROR = {
  badAction: 'games.misery.error.badAction',
  over: 'games.misery.error.over',
  notAPlayer: 'games.misery.error.notAPlayer',
  systemOnly: 'games.misery.error.systemOnly',
  notYourGuess: 'games.misery.error.notYourGuess',
  notYourDraw: 'games.misery.error.notYourDraw',
  notGuess: 'games.misery.error.notGuess',
  notReveal: 'games.misery.error.notReveal',
  badGap: 'games.misery.error.badGap',
  nothingToSkip: 'games.misery.error.nothingToSkip',
} as const

const CLOCKS: readonly MiseryClock[] = [0, 30, 60]

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): MiseryAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, gap, seat } = action as Record<string, unknown>
  if (type === 'place' && Number.isInteger(gap)) return { type, gap: gap as number }
  if (type === 'next' || type === 'timeUp') return { type }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  return null
}

/** A card of the bank, by its id (its CSV line, from 1) */
export function cardOf(id: number): MiseryCard {
  const [category, title, index] = MISERY_CARDS[id - 1]
  return { id, category, title, index }
}

/** Least miserable first; equal indexes by id, so that a line always reads the same */
const byIndex = (a: MiseryCard, b: MiseryCard) => a.index - b.index || a.id - b.id

/**
 * Whether `card` belongs in `gap` of `cards`: between its neighbours' indexes. An equal index is
 * right on either side of its twin
 */
export function fits(cards: readonly MiseryCard[], gap: number, card: MiseryCard): boolean {
  const low = gap > 0 ? cards[gap - 1].index : null
  const high = gap < cards.length ? cards[gap].index : null
  return (low === null || low <= card.index) && (high === null || card.index <= high)
}

const lineOf = (state: Pick<MiseryState, 'lines'>, seat: SeatId): MiseryCard[] =>
  state.lines.find((line) => line.seat === seat)?.cards ?? []

/** The seat after `seat` in seat order */
const after = (players: readonly SeatId[], seat: SeatId): SeatId =>
  players[(players.indexOf(seat) + 1) % players.length]

/** Who may still try the card on the table after the guesser, in seat order from the turn */
export function stealersLeft(state: Pick<MiseryState, 'phase' | 'players' | 'turn' | 'guesser' | 'steals' | 'attempts'>): SeatId[] {
  if (state.phase !== 'guess' || !state.steals) return []
  const at = state.players.indexOf(state.turn)
  const order = [...state.players.slice(at + 1), ...state.players.slice(0, at)]
  const tried = new Set(state.attempts.map((attempt) => attempt.seat))
  return order.filter((seat) => seat !== state.guesser && !tried.has(seat))
}

/** The next card face down on the table for `turn`; with the deck empty the game ends there */
function draw(state: MiseryState, turn: SeatId): MiseryState {
  const [next, ...rest] = state.deck
  if (next === undefined) return { ...state, phase: 'over', deckOut: true, current: null, attempts: [] }
  return {
    ...state,
    phase: 'guess',
    turnNo: state.turnNo + 1,
    turn,
    guesser: turn,
    current: cardOf(next),
    attempts: [],
    deck: rest,
  }
}

/** The tries are over: the index is shown, and a line that reached the target wins */
function finish(state: MiseryState, attempts: MiseryAttempt[], keptBy: SeatId | null, lines: MiseryLine[]): MiseryState {
  const card = state.current as MiseryCard
  const won = keptBy !== null && lineOf({ lines }, keptBy).length >= state.target
  return {
    ...state,
    phase: won ? 'over' : 'reveal',
    lines,
    current: null,
    attempts: [],
    discarded: keptBy === null ? state.discarded + 1 : state.discarded,
    last: { turnNo: state.turnNo, turn: state.turn, card, attempts, keptBy },
  }
}

/** A wrong try (or none, when the time ran out): the next stealer has a go, else the card is gone */
function miss(state: MiseryState, attempt: MiseryAttempt): MiseryState {
  const next = stealersLeft(state)[0]
  const attempts = [...state.attempts, attempt]
  if (next === undefined) return finish(state, attempts, null, state.lines)
  return { ...state, guesser: next, attempts }
}

/** The guesser's call: the card in `gap` of their own line */
function place(state: MiseryState, gap: number): MiseryState {
  const card = state.current as MiseryCard
  const cards = lineOf(state, state.guesser)
  const right = fits(cards, gap, card)
  const attempt: MiseryAttempt = {
    seat: state.guesser,
    gap,
    low: gap > 0 ? cards[gap - 1].index : null,
    high: gap < cards.length ? cards[gap].index : null,
    right,
  }
  if (!right) return miss(state, attempt)
  const lines = state.lines.map((line) =>
    line.seat === state.guesser ? { ...line, cards: [...cards.slice(0, gap), card, ...cards.slice(gap)] } : line,
  )
  return finish(state, [...state.attempts, attempt], state.guesser, lines)
}

/** Nothing placed: the time ran out, or the room skipped a guesser who is gone */
const pass = (state: MiseryState): MiseryState =>
  miss(state, { seat: state.guesser, gap: null, low: null, high: null, right: false })

export const misery: GameModule<MiseryState, MiseryAction, MiseryView, MiseryOptions> = {
  ...miseryInfo,

  init(seats, options, rng: Rng) {
    const players = seats.map((seat) => seat.id)
    const deck = rng.shuffle(MISERY_CARDS.map((_, index) => index + 1))
    const start = Math.max(1, options.startCards)
    const lines = players.map((seat, at) => ({
      seat,
      cards: deck.slice(at * start, (at + 1) * start).map(cardOf).sort(byIndex),
    }))
    const first = players[rng.int(players.length)]
    const base: MiseryState = {
      phase: 'guess',
      target: options.target,
      steals: options.steals,
      clock: CLOCKS.includes(options.clock) ? options.clock : 60,
      players,
      lines,
      turnNo: 0,
      turn: first,
      guesser: first,
      current: null,
      attempts: [],
      last: null,
      deck: deck.slice(players.length * start),
      discarded: 0,
      deckOut: false,
    }
    return draw(base, first)
  },

  reduce(state, rawAction, actor) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip' || action.type === 'timeUp') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (action.type === 'timeUp') return state.phase === 'guess' ? pass(state) : gameError(ERROR.notGuess)
      if (!state.players.includes(action.seat)) return gameError(ERROR.notAPlayer)
      if (state.phase === 'guess' && action.seat === state.guesser) return pass(state)
      if (state.phase === 'reveal' && action.seat === after(state.players, state.turn)) {
        return draw(state, action.seat)
      }
      return gameError(ERROR.nothingToSkip)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (!state.players.includes(actor)) return gameError(ERROR.notAPlayer)

    switch (action.type) {
      case 'place': {
        if (state.phase !== 'guess') return gameError(ERROR.notGuess)
        if (actor !== state.guesser) return gameError(ERROR.notYourGuess)
        if (action.gap < 0 || action.gap > lineOf(state, actor).length) return gameError(ERROR.badGap)
        return place(state, action.gap)
      }
      case 'next': {
        if (state.phase !== 'reveal') return gameError(ERROR.notReveal)
        const next = after(state.players, state.turn)
        if (actor !== next) return gameError(ERROR.notYourDraw)
        return draw(state, next)
      }
    }
  },

  // The only place the hidden index is cut: rule 4 of types.ts. The card on the table goes out as
  // its category and title; the deck not at all. Everything else is on the table for everyone
  view(state, viewer) {
    const seat = viewer !== 'spectator' && state.players.includes(viewer) ? viewer : null
    const { current, deck, ...open } = state
    return {
      ...open,
      you: seat,
      current: current === null ? null : { category: current.category, title: current.title },
      stealers: stealersLeft(state),
      deckLeft: deck.length,
      nextTurn: after(state.players, state.turn),
    }
  },

  legalActions(state, seat) {
    if (state.phase === 'guess' && seat === state.guesser) {
      return Array.from({ length: lineOf(state, seat).length + 1 }, (_, gap) => ({ type: 'place' as const, gap }))
    }
    if (state.phase === 'reveal' && seat === after(state.players, state.turn)) return [{ type: 'next' }]
    return []
  },

  // The table waits for an absent guesser, and for an absent player whose turn is next
  skipAction(state, seat) {
    if (state.phase === 'guess' && seat === state.guesser) return { type: 'skip', seat }
    if (state.phase === 'reveal' && seat === after(state.players, state.turn)) return { type: 'skip', seat }
    return null
  },

  // A fresh clock for every try: the turn and the number of tries so far in the id
  timers(state) {
    if (state.clock === 0 || state.phase !== 'guess') return []
    return [{ id: `guess-${state.turnNo}-${state.attempts.length}`, ms: state.clock * 1000, action: { type: 'timeUp' } }]
  },

  isOver(state) {
    return state.phase === 'over'
  },

  // Most cards first; a game the deck ended can have a tie at the top
  result(state): GameResult {
    const count = (seat: SeatId) => lineOf(state, seat).length
    const ordered = [...state.players].sort((a, b) => count(b) - count(a) || a - b)
    const top = count(ordered[0])
    const winners = ordered.filter((seat) => count(seat) === top).length
    return {
      summary: {
        key: state.deckOut
          ? winners > 1
            ? 'games.misery.result.deckTie'
            : 'games.misery.result.deck'
          : 'games.misery.result.won',
        params: { cards: top, target: state.target, winners, turns: state.turnNo },
      },
      standings: ordered.map((seat) => ({
        seat,
        rank: 1 + ordered.filter((other) => count(other) > count(seat)).length,
        score: count(seat),
        note: { key: 'games.misery.note.cards', params: { cards: count(seat) } },
      })),
    }
  },
}
