// 真假朗讀 (working title Bluff Reader; e6-t02, e6-t03). Each round one seat is the judge, in turn.
// Everyone sees one odd but real term. Of the others, one secret honest reader gets its true
// explanation and reads it out; the rest bluff an explanation of their own. With four players or
// more one of the bluffers is a secret mole, who also gets mission words to work into the bluff.
// After every reading the judge votes for the one they think was true, and everyone else may give one
// heckle sticker (吐槽貼) to the reader they found worst. The reading itself happens at the table or
// on a voice call: the site deals, times, counts the votes and keeps the score.
//
// Rules and scoring are the owner's (2026-11-13); docs/PRD/e6-bluff-reader.md has them and every
// detail decided here.
import { bluffInfo } from './info.ts'
import { BLUFF_TERMS, BLUFF_WORDS } from './bank.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  BluffAction,
  BluffMiss,
  BluffOptions,
  BluffReveal,
  BluffRole,
  BluffState,
  BluffTerm,
  BluffView,
} from './types.ts'

export const PREPARE_MS = 15_000
export const VOTE_MS = 60_000
/** Mission words the mole gets */
export const MOLE_WORDS = 3
/** A mole needs a judge, the honest reader, and at least one other bluffer */
export const MOLE_MIN_PLAYERS = 4

export const SCORE = {
  /** The judge picks the honest reader: both score */
  judgeRight: 2,
  honestFound: 2,
  /** The judge picks a bluffer or the mole: that reader scores */
  fooledJudge: 3,
  /** A sticker on the honest reader costs its giver */
  stickerOnHonest: -1,
  /** A sticker on the mole earns its giver */
  stickerOnMole: 2,
  /** A mole with no sticker at all got the words in unnoticed */
  moleUnstuck: 2,
} as const

const ERROR = {
  badAction: 'games.bluff.error.badAction',
  over: 'games.bluff.error.over',
  notAPlayer: 'games.bluff.error.notAPlayer',
  systemOnly: 'games.bluff.error.systemOnly',
  notPreparing: 'games.bluff.error.notPreparing',
  notJudge: 'games.bluff.error.notJudge',
  notReading: 'games.bluff.error.notReading',
  notYourReading: 'games.bluff.error.notYourReading',
  notVoting: 'games.bluff.error.notVoting',
  notAReader: 'games.bluff.error.notAReader',
  judgeSticker: 'games.bluff.error.judgeSticker',
  ownSticker: 'games.bluff.error.ownSticker',
  notReveal: 'games.bluff.error.notReveal',
  nothingToSkip: 'games.bluff.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): BluffAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, seat } = action as Record<string, unknown>
  if (type === 'startReading' || type === 'doneReading' || type === 'next' || type === 'timeUp') {
    return { type }
  }
  if (type === 'vote' && isSeat(seat)) return { type, seat }
  if (type === 'sticker' && (seat === null || isSeat(seat))) return { type, seat }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  return null
}

const termAt = (id: number): BluffTerm => {
  const [term, category, decoy1, decoy2, explanation] = BLUFF_TERMS[id - 1]
  return { id, category, term, choices: [category, decoy1, decoy2], explanation }
}

/** A term this room has not had; once all have come up, the bank starts over */
function drawTerm(used: readonly number[], rng: Rng): { term: BluffTerm; used: number[] } {
  const all = BLUFF_TERMS.map((_, index) => index + 1)
  const seen = new Set(used)
  const fresh = all.filter((id) => !seen.has(id))
  const id = rng.pick(fresh.length > 0 ? fresh : all)
  return { term: termAt(id), used: fresh.length > 0 ? [...used, id] : [id] }
}

const judgeOf = (state: Pick<BluffState, 'players' | 'firstJudge'>, round: number): SeatId =>
  state.players[(state.firstJudge + round - 1) % state.players.length].seat

/** Round `round` as it starts: a judge, roles, a term, a reading order */
function dealRound(
  state: Pick<BluffState, 'players' | 'firstJudge' | 'moleOn' | 'usedTerms'>,
  round: number,
  rng: Rng,
): Pick<
  BluffState,
  | 'phase'
  | 'round'
  | 'judge'
  | 'honest'
  | 'mole'
  | 'term'
  | 'words'
  | 'order'
  | 'reader'
  | 'vote'
  | 'judgeAway'
  | 'stickers'
  | 'reveal'
  | 'usedTerms'
> {
  const judge = judgeOf(state, round)
  const order = rng.shuffle(state.players.map((player) => player.seat).filter((seat) => seat !== judge))
  const honest = rng.pick(order)
  const withMole = state.moleOn && state.players.length >= MOLE_MIN_PLAYERS
  const mole = withMole ? rng.pick(order.filter((seat) => seat !== honest)) : null
  const drawn = drawTerm(state.usedTerms, rng)
  const used = drawn.used
  // The three categories in a fresh order each time, so that the true one has no place of its own
  const term = { ...drawn.term, choices: rng.shuffle(drawn.term.choices ?? [drawn.term.category]) }
  return {
    phase: 'prepare',
    round,
    judge,
    honest,
    mole,
    term,
    words: mole === null ? [] : rng.shuffle(BLUFF_WORDS).slice(0, MOLE_WORDS),
    order,
    reader: 0,
    vote: null,
    judgeAway: false,
    stickers: {},
    reveal: null,
    usedTerms: used,
  }
}

/** The judge has voted, or was skipped, and everyone else has chosen a sticker or none */
const decidedAll = (state: BluffState): boolean =>
  (state.vote !== null || state.judgeAway) &&
  state.order.every((seat) => String(seat) in state.stickers)

/** What each seat gains this round, by seat */
export function roundPoints(state: BluffState, vote: SeatId | null): Map<SeatId, number> {
  const points = new Map<SeatId, number>(state.players.map((player) => [player.seat, 0]))
  const add = (seat: SeatId, value: number) => points.set(seat, (points.get(seat) ?? 0) + value)
  if (vote !== null) {
    if (vote === state.honest) {
      add(state.judge, SCORE.judgeRight)
      add(state.honest, SCORE.honestFound)
    } else {
      add(vote, SCORE.fooledJudge)
    }
  }
  let moleStuck = false
  for (const [giver, target] of Object.entries(state.stickers)) {
    if (target === null) continue
    if (target === state.honest) add(Number(giver), SCORE.stickerOnHonest)
    if (target === state.mole) {
      add(Number(giver), SCORE.stickerOnMole)
      moleStuck = true
    }
  }
  if (state.mole !== null && !moleStuck) add(state.mole, SCORE.moleUnstuck)
  return points
}

/** Everything is shown and the round is scored; after the last round, the game ends here */
function reveal(state: BluffState, missed: BluffMiss | null): BluffState {
  const vote = missed === null ? state.vote : null
  const points = roundPoints(state, vote)
  const stickers: Record<string, SeatId> = {}
  for (const [giver, target] of Object.entries(state.stickers)) if (target !== null) stickers[giver] = target
  const result: BluffReveal = {
    vote,
    missed,
    stickers,
    points: state.players.map((player) => points.get(player.seat) ?? 0),
  }
  return {
    ...state,
    phase: state.round >= state.totalRounds ? 'over' : 'reveal',
    reveal: result,
    players: state.players.map((player) => ({
      ...player,
      score: player.score + (points.get(player.seat) ?? 0),
    })),
  }
}

/** Voting ends once everyone has decided; a skipped judge's vote is missing */
const revealIfDone = (state: BluffState): BluffState =>
  decidedAll(state) ? reveal(state, state.vote === null ? 'skipped' : null) : state

/** The next reader, or the vote after the last one */
function nextReader(state: BluffState): BluffState {
  if (state.reader + 1 < state.order.length) return { ...state, reader: state.reader + 1 }
  return { ...state, phase: 'voting', reader: state.order.length }
}

function nextRound(state: BluffState, rng: Rng): BluffState {
  const finished = {
    round: state.round,
    judge: state.judge,
    honest: state.honest,
    mole: state.mole,
    term: state.term,
    words: state.words,
    reveal: state.reveal as BluffReveal,
  }
  return { ...state, history: [...state.history, finished], ...dealRound(state, state.round + 1, rng) }
}

/** What the room does for a seat whose player is gone */
function skip(state: BluffState, seat: SeatId, rng: Rng): BluffState | null {
  switch (state.phase) {
    case 'prepare':
      return seat === state.judge ? { ...state, phase: 'reading' } : null
    case 'reading':
      return state.order[state.reader] === seat ? nextReader(state) : null
    case 'voting':
      if (seat === state.judge) {
        return state.vote !== null || state.judgeAway ? null : revealIfDone({ ...state, judgeAway: true })
      }
      if (!state.order.includes(seat) || String(seat) in state.stickers) return null
      return revealIfDone({ ...state, stickers: { ...state.stickers, [seat]: null } })
    case 'reveal':
      return seat === state.judge ? nextRound(state, rng) : null
    default:
      return null
  }
}

export const bluff: GameModule<BluffState, BluffAction, BluffView, BluffOptions> = {
  ...bluffInfo,

  init(seats, options, rng) {
    const players = seats.map((seat) => ({ seat: seat.id, score: 0 }))
    const base = {
      twoRounds: options.twoRounds,
      readSeconds: options.readSeconds,
      moleOn: options.mole,
      hints: options.hints,
      clock: options.clock,
      players,
      firstJudge: rng.int(players.length),
      totalRounds: players.length * (options.twoRounds ? 2 : 1),
      usedTerms: [],
      history: [],
    }
    return { ...base, ...dealRound(base, 1, rng) }
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip' || action.type === 'timeUp') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (action.type === 'skip') {
        if (!state.players.some((player) => player.seat === action.seat)) return gameError(ERROR.notAPlayer)
        return skip(state, action.seat, rng) ?? gameError(ERROR.nothingToSkip)
      }
      if (state.phase === 'prepare') return { ...state, phase: 'reading' }
      if (state.phase === 'reading') return nextReader(state)
      if (state.phase === 'voting') {
        return reveal(state, state.vote !== null ? null : state.judgeAway ? 'skipped' : 'time')
      }
      return gameError(ERROR.nothingToSkip)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (!state.players.some((player) => player.seat === actor)) return gameError(ERROR.notAPlayer)

    switch (action.type) {
      case 'startReading':
        if (state.phase !== 'prepare') return gameError(ERROR.notPreparing)
        if (actor !== state.judge) return gameError(ERROR.notJudge)
        return { ...state, phase: 'reading' }
      case 'doneReading':
        if (state.phase !== 'reading') return gameError(ERROR.notReading)
        if (actor !== state.judge && actor !== state.order[state.reader]) {
          return gameError(ERROR.notYourReading)
        }
        return nextReader(state)
      case 'vote':
        if (state.phase !== 'voting') return gameError(ERROR.notVoting)
        if (actor !== state.judge || state.vote !== null || state.judgeAway) return gameError(ERROR.notJudge)
        if (!state.order.includes(action.seat)) return gameError(ERROR.notAReader)
        return revealIfDone({ ...state, vote: action.seat })
      case 'sticker': {
        if (state.phase !== 'voting') return gameError(ERROR.notVoting)
        if (actor === state.judge) return gameError(ERROR.judgeSticker)
        if (String(actor) in state.stickers) return gameError(ERROR.notVoting)
        if (action.seat === actor) return gameError(ERROR.ownSticker)
        if (action.seat !== null && !state.order.includes(action.seat)) return gameError(ERROR.notAReader)
        return revealIfDone({ ...state, stickers: { ...state.stickers, [actor]: action.seat } })
      }
      case 'next':
        if (state.phase !== 'reveal') return gameError(ERROR.notReveal)
        if (actor !== state.judge) return gameError(ERROR.notJudge)
        return nextRound(state, rng)
    }
  },

  // The only place roles, the explanation, the words and the votes are cut: rule 4 of types.ts
  view(state, viewer) {
    const shown = state.phase === 'reveal' || state.phase === 'over'
    const seat = viewer === 'spectator' ? null : viewer
    const role: BluffRole | null =
      seat === null || !state.players.some((player) => player.seat === seat)
        ? null
        : seat === state.judge
          ? 'judge'
          : seat === state.honest
            ? 'honest'
            : seat === state.mole
              ? 'mole'
              : 'bluffer'
    const {
      honest,
      mole,
      words,
      vote,
      stickers,
      usedTerms: _used,
      firstJudge: _first,
      term,
      ...open
    } = state
    const decided = [
      ...(vote !== null ? [state.judge] : []),
      ...state.order.filter((reader) => String(reader) in stickers),
    ]
    const own = seat === null ? undefined : stickers[String(seat)]
    return {
      ...open,
      you: seat,
      role,
      term: {
        id: term.id,
        term: term.term,
        // A round dealt before 2026-11-14 had one category, shown to all, and a hint for bluffers
        choices: state.hints ? (term.choices ?? [term.category]) : [],
        category: shown || term.choices === undefined ? term.category : null,
      },
      explanation: shown || role === 'honest' ? term.explanation : null,
      words: shown || role === 'mole' ? words : [],
      honest: shown ? honest : null,
      mole: shown ? mole : null,
      vote: shown || role === 'judge' ? vote : null,
      ...(own !== undefined ? { sticker: own } : {}),
      decided,
    }
  },

  legalActions(state, seat) {
    switch (state.phase) {
      case 'prepare':
        return seat === state.judge ? [{ type: 'startReading' }] : []
      case 'reading':
        return seat === state.judge || seat === state.order[state.reader] ? [{ type: 'doneReading' }] : []
      case 'voting':
        if (seat === state.judge) {
          return state.vote === null && !state.judgeAway
            ? state.order.map((reader) => ({ type: 'vote', seat: reader }))
            : []
        }
        if (!state.order.includes(seat) || String(seat) in state.stickers) return []
        return [
          ...state.order.filter((reader) => reader !== seat).map((reader) => ({ type: 'sticker' as const, seat: reader })),
          { type: 'sticker', seat: null },
        ]
      case 'reveal':
        return seat === state.judge ? [{ type: 'next' }] : []
      default:
        return []
    }
  },

  // The table waits for a gone judge to start, a gone reader, a gone voter, a gone judge to move on
  skipAction(state, seat) {
    switch (state.phase) {
      case 'prepare':
        return seat === state.judge ? { type: 'skip', seat } : null
      case 'reading':
        return state.order[state.reader] === seat ? { type: 'skip', seat } : null
      case 'voting':
        if (seat === state.judge) return state.vote === null && !state.judgeAway ? { type: 'skip', seat } : null
        return state.order.includes(seat) && !(String(seat) in state.stickers) ? { type: 'skip', seat } : null
      case 'reveal':
        return seat === state.judge ? { type: 'skip', seat } : null
      default:
        return null
    }
  },

  // The phase and the reader in the id, so that each gets a fresh countdown
  timers(state) {
    if (!state.clock) return []
    if (state.phase === 'prepare') return [{ id: `prepare-${state.round}`, ms: PREPARE_MS, action: { type: 'timeUp' } }]
    if (state.phase === 'reading') {
      return [{ id: `read-${state.round}-${state.reader}`, ms: state.readSeconds * 1000, action: { type: 'timeUp' } }]
    }
    if (state.phase === 'voting') return [{ id: `vote-${state.round}`, ms: VOTE_MS, action: { type: 'timeUp' } }]
    return []
  },

  // Typing "I have the real one" would end the game: closed until the reveal
  chatLocked(state) {
    return state.phase === 'prepare' || state.phase === 'reading' || state.phase === 'voting'
  },

  isOver(state) {
    return state.phase === 'over'
  },

  result(state): GameResult {
    // Every round as finished: the history and the last one, still in the state
    const rounds = [
      ...state.history,
      { honest: state.honest, reveal: state.reveal as BluffReveal },
    ]
    const fooled = (seat: SeatId) =>
      rounds.filter((round) => round.reveal.vote === seat && seat !== round.honest).length
    const found = (seat: SeatId) =>
      rounds.filter((round) => round.reveal.vote === seat && seat === round.honest).length
    const ordered = [...state.players].sort((a, b) => b.score - a.score || a.seat - b.seat)
    const top = ordered[0].score
    const winners = ordered.filter((player) => player.score === top).length
    return {
      summary: {
        key: winners > 1 ? 'games.bluff.result.tie' : 'games.bluff.result.won',
        params: { score: top, rounds: state.totalRounds, winners },
      },
      standings: ordered.map((player) => ({
        seat: player.seat,
        rank: 1 + ordered.filter((other) => other.score > player.score).length,
        score: player.score,
        note: {
          key: 'games.bluff.note.points',
          params: { fooled: fooled(player.seat), found: found(player.seat) },
        },
      })),
    }
  },
}
