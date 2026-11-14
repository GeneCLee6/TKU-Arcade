// 誰的詞不一樣 (working title Odd Word Out; owner's request 2026-11-14). Each round the site draws a
// pair of similar words: most seats get one, the odd ones out (1 to 3) get the other, and with the
// blank on one of them gets nothing. Nobody is told which they hold. A random first speaker and a
// direction say who describes first on the friends' own voice call; that first speaker runs the
// round (reveal, redeal, next, end). No votes, no scores: the table talks it out.
//
// docs/PRD/e13-odd-word-out.md has the rules and every detail decided here.
import { ODD_PAIRS } from './bank.ts'
import { oddWordInfo } from './info.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  OddDirection,
  OddPair,
  OddUndercoverChoice,
  OddWordAction,
  OddWordOptions,
  OddWordState,
  OddWordView,
} from './types.ts'

/** From this many players the default is two odd ones out */
export const TWO_UNDERCOVERS_FROM = 7

const ERROR = {
  badAction: 'games.odd-word.error.badAction',
  over: 'games.odd-word.error.over',
  notAPlayer: 'games.odd-word.error.notAPlayer',
  systemOnly: 'games.odd-word.error.systemOnly',
  notHost: 'games.odd-word.error.notHost',
  notWords: 'games.odd-word.error.notWords',
  notReveal: 'games.odd-word.error.notReveal',
  nothingToSkip: 'games.odd-word.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): OddWordAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, seat } = action as Record<string, unknown>
  if (type === 'reveal' || type === 'redeal' || type === 'next' || type === 'end') return { type }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  return null
}

/**
 * How many get the other word. The odd ones out stay fewer than half the table, so that the common
 * word is always the majority: at most 1 for 3–4 players, 2 for 5–6, 3 from 7
 */
export function undercoverCount(players: number, choice: OddUndercoverChoice): number {
  const wanted = choice === 0 ? (players >= TWO_UNDERCOVERS_FROM ? 2 : 1) : choice
  return Math.max(1, Math.min(wanted, Math.floor((players - 1) / 2)))
}

/** A pair this room has not had, the words either way round; once all have come up, it starts over */
function drawPair(used: readonly number[], rng: Rng): { pair: OddPair; used: number[] } {
  const all = ODD_PAIRS.map((_, index) => index + 1)
  const seen = new Set(used)
  const fresh = all.filter((id) => !seen.has(id))
  const id = rng.pick(fresh.length > 0 ? fresh : all)
  const [category, first, second] = ODD_PAIRS[id - 1]
  const swap = rng.int(2) === 1
  return {
    pair: { id, category, common: swap ? second : first, odd: swap ? first : second },
    used: fresh.length > 0 ? [...used, id] : [id],
  }
}

type Deal = Pick<OddWordState, 'pair' | 'undercover' | 'blank' | 'usedPairs'>

/** A pair and who gets the other word; the blank, when on, is one of those */
function deal(state: Pick<OddWordState, 'players' | 'undercoverChoice' | 'blankOn' | 'usedPairs'>, rng: Rng): Deal {
  const { pair, used } = drawPair(state.usedPairs, rng)
  const count = undercoverCount(state.players.length, state.undercoverChoice)
  const picked = rng.shuffle(state.players).slice(0, count)
  const blank = state.blankOn ? rng.pick(picked) : null
  return {
    pair,
    undercover: state.players.filter((seat) => picked.includes(seat)),
    blank,
    usedPairs: used,
  }
}

/** Round `round` as it starts: a deal, a first speaker, a direction */
function startRound(
  state: Pick<OddWordState, 'players' | 'undercoverChoice' | 'blankOn' | 'usedPairs'>,
  round: number,
  rng: Rng,
): Pick<OddWordState, 'phase' | 'round' | 'order' | 'direction' | 'host' | 'redeals'> & Deal {
  const { players } = state
  const first = rng.int(players.length)
  const direction: OddDirection = rng.int(2) === 0 ? 'clockwise' : 'counterclockwise'
  const step = direction === 'clockwise' ? 1 : players.length - 1
  const order = players.map((_, index) => players[(first + index * step) % players.length])
  return {
    phase: 'words',
    round,
    order,
    direction,
    host: order[0],
    redeals: 0,
    ...deal(state, rng),
  }
}

/** The round just revealed, into the history, and the next one dealt */
function nextRound(state: OddWordState, rng: Rng): OddWordState {
  const finished = { round: state.round, pair: state.pair, undercover: state.undercover, blank: state.blank }
  return { ...state, history: [...state.history, finished], ...startRound(state, state.round + 1, rng) }
}

/** Everyone's word is shown; after the last round the game ends there */
const reveal = (state: OddWordState): OddWordState => ({
  ...state,
  phase: state.round >= state.totalRounds ? 'over' : 'reveal',
})

/** The seat after `seat` in this round's speaking order */
const after = (state: OddWordState, seat: SeatId): SeatId =>
  state.order[(state.order.indexOf(seat) + 1) % state.order.length]

/** What a seat holds this round: the word, or null for the blank */
export function wordOf(state: Pick<OddWordState, 'pair' | 'undercover' | 'blank'>, seat: SeatId): string | null {
  if (seat === state.blank) return null
  return state.undercover.includes(seat) ? state.pair.odd : state.pair.common
}

export const oddWord: GameModule<OddWordState, OddWordAction, OddWordView, OddWordOptions> = {
  ...oddWordInfo,

  init(seats, options, rng) {
    const base = {
      undercoverChoice: options.undercovers,
      blankOn: options.blank,
      players: seats.map((seat) => seat.id),
      totalRounds: options.rounds,
      endedEarly: false,
      usedPairs: [],
      history: [],
    }
    return { ...base, ...startRound(base, 1, rng) }
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (!state.players.includes(action.seat)) return gameError(ERROR.notAPlayer)
      if (action.seat !== state.host) return gameError(ERROR.nothingToSkip)
      // A gone host: before the reveal the next speaker takes the round over; after it, the next
      // round starts (with a new host of its own)
      return state.phase === 'words' ? { ...state, host: after(state, state.host) } : nextRound(state, rng)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (!state.players.includes(actor)) return gameError(ERROR.notAPlayer)
    if (actor !== state.host) return gameError(ERROR.notHost)

    switch (action.type) {
      case 'reveal':
        if (state.phase !== 'words') return gameError(ERROR.notWords)
        return reveal(state)
      case 'redeal':
        if (state.phase !== 'words') return gameError(ERROR.notWords)
        return { ...state, ...deal(state, rng), redeals: state.redeals + 1 }
      case 'next':
        if (state.phase !== 'reveal') return gameError(ERROR.notReveal)
        return nextRound(state, rng)
      case 'end':
        if (state.phase !== 'reveal') return gameError(ERROR.notReveal)
        return { ...state, phase: 'over', endedEarly: true }
    }
  },

  // The only place the words are cut: rule 4 of types.ts. Before the reveal a seat sees its own word
  // and nothing else (not even whether it is the odd one); a spectator sees none
  view(state, viewer) {
    const shown = state.phase !== 'words'
    const seat = viewer !== 'spectator' && state.players.includes(viewer) ? viewer : null
    const { pair, undercover, blank, usedPairs: _used, ...open } = state
    return {
      ...open,
      you: seat,
      word: seat === null ? null : wordOf(state, seat),
      blankYou: seat !== null && seat === blank,
      undercoverCount: undercover.length,
      reveal: shown ? { pair, undercover, blank } : null,
    }
  },

  legalActions(state, seat) {
    if (seat !== state.host) return []
    if (state.phase === 'words') return [{ type: 'reveal' }, { type: 'redeal' }]
    if (state.phase === 'reveal') return [{ type: 'next' }, { type: 'end' }]
    return []
  },

  // Only the round's host holds the table up
  skipAction(state, seat) {
    return seat === state.host && state.phase !== 'over' ? { type: 'skip', seat } : null
  },

  // Typing your word in the chat would give the round away: closed until the reveal
  chatLocked(state) {
    return state.phase === 'words'
  },

  isOver(state) {
    return state.phase === 'over'
  },

  // No scores: everyone shares one place, with how often they had the other word
  result(state): GameResult {
    const rounds = [...state.history, { undercover: state.undercover }]
    return {
      summary: {
        key: state.endedEarly ? 'games.odd-word.result.ended' : 'games.odd-word.result.done',
        params: { rounds: rounds.length },
      },
      standings: state.players.map((seat) => ({
        seat,
        rank: 1,
        score: null,
        note: {
          key: 'games.odd-word.note.odd',
          params: { times: rounds.filter((round) => round.undercover.includes(seat)).length },
        },
      })),
    }
  },
}
