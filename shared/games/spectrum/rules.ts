// Spectrum (e5-t02, e5-t03): each round one seat is the guesser and everyone else gets a secret
// number from 1 to 10. The guesser is dealt a card of four topics with two ends each and picks one
// to ask (owner, 2026-11-13; "late-night snacks": 1 = least wanted, 10 = most wanted), and each answerer sends one answer that says where their number sits between
// the two ends, without saying the number. Once every answer is in they are shown, and the guesser
// puts every answer in order (or, as a rule option, picks only the largest and the smallest). In a
// full order an answer in its very place scores two for the guesser and two for that answerer, one
// place off scores one each (2026-11-14: scoring only the very place let one early slip zero out
// the whole line); a right largest or smallest scores one each. The guesser moves one seat on
// each round; everyone guesses once (or twice), and the highest total wins.
//
// The decisions the epic left open are recorded in docs/PRD/e5-spectrum-guess.md, "H1 定案的規則細節".
import { answerProblem, MAX_ANSWER_LENGTH, normaliseAnswer } from './answer.ts'
import { spectrumInfo } from './info.ts'
import { SPECTRUM_TOPICS } from './topics.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  SpectrumAction,
  SpectrumAnswerer,
  SpectrumGuess,
  SpectrumMiss,
  SpectrumOptions,
  SpectrumReveal,
  SpectrumState,
  SpectrumTopic,
  SpectrumView,
} from './types.ts'

export const LOWEST = 1
export const HIGHEST = 10
export { MAX_ANSWER_LENGTH, normaliseAnswer }
/** Fewer answers than this leave nothing to compare, and the round scores nothing */
export const MIN_ANSWERS = 2
export const ANSWER_MS = 90_000
/** Topics on a round's card, each from a different category where the bank allows */
export const CARD_SIZE = 4
export const CHOOSE_MS = 30_000
export const GUESS_MS = 60_000

/** What `legalActions` lists for an answer: the browser asks for the real one */
export const SAMPLE_ANSWERS: readonly string[] = ['滷肉飯', '一杯珍奶', 'a bowl of noodles']

const ERROR = {
  badAction: 'games.spectrum.error.badAction',
  over: 'games.spectrum.error.over',
  notAPlayer: 'games.spectrum.error.notAPlayer',
  systemOnly: 'games.spectrum.error.systemOnly',
  notAnswering: 'games.spectrum.error.notAnswering',
  guesserAnswers: 'games.spectrum.error.guesserAnswers',
  out: 'games.spectrum.error.out',
  empty: 'games.spectrum.error.empty',
  tooLong: 'games.spectrum.error.tooLong',
  digits: 'games.spectrum.error.digits',
  notGuessing: 'games.spectrum.error.notGuessing',
  notGuesser: 'games.spectrum.error.notGuesser',
  wrongMode: 'games.spectrum.error.wrongMode',
  notInGuess: 'games.spectrum.error.notInGuess',
  sameSeat: 'games.spectrum.error.sameSeat',
  badOrder: 'games.spectrum.error.badOrder',
  notReveal: 'games.spectrum.error.notReveal',
  notChoosing: 'games.spectrum.error.notChoosing',
  notOnCard: 'games.spectrum.error.notOnCard',
  nothingToSkip: 'games.spectrum.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): SpectrumAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, text, max, min, seats, seat, id } = action as Record<string, unknown>
  if (type === 'next' || type === 'timeUp') return { type }
  if (type === 'chooseTopic' && Number.isInteger(id)) return { type, id: id as number }
  if (type === 'submitAnswer' && typeof text === 'string') return { type, text }
  if (type === 'guessExtremes' && isSeat(max) && isSeat(min)) return { type, max, min }
  if (type === 'guessOrder' && Array.isArray(seats) && seats.every(isSeat)) {
    return { type, seats: [...seats] }
  }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  return null
}

const topicAt = (id: number): SpectrumTopic => {
  const [category, topic, scene, low, high] = SPECTRUM_TOPICS[id - 1]
  return { id, category, topic, scene, low, high }
}

/**
 * A card of CARD_SIZE topics this room has not had yet, each from a different category while the
 * fresh ones span enough categories. Once the bank runs short, it starts over
 */
function drawCard(used: readonly number[], rng: Rng): { card: SpectrumTopic[]; used: number[] } {
  const all = SPECTRUM_TOPICS.map((_, index) => index + 1)
  const seen = new Set(used)
  let fresh = all.filter((id) => !seen.has(id))
  let start = [...used]
  if (fresh.length < CARD_SIZE) {
    fresh = all
    start = []
  }
  const shuffled = rng.shuffle(fresh)
  const picked: number[] = []
  const categories = new Set<string>()
  for (const id of shuffled) {
    if (picked.length === CARD_SIZE) break
    const category = SPECTRUM_TOPICS[id - 1][0]
    if (categories.has(category)) continue
    categories.add(category)
    picked.push(id)
  }
  // Fewer categories left than places on the card: the rest from any category
  for (const id of shuffled) {
    if (picked.length === CARD_SIZE) break
    if (!picked.includes(id)) picked.push(id)
  }
  return { card: picked.map(topicAt), used: [...start, ...picked] }
}

/** One number for each answerer: all different, unless the room allows repeats */
function dealNumbers(count: number, duplicates: boolean, rng: Rng): number[] {
  if (duplicates) return Array.from({ length: count }, () => LOWEST + rng.int(HIGHEST - LOWEST + 1))
  const all = Array.from({ length: HIGHEST - LOWEST + 1 }, (_, index) => LOWEST + index)
  return rng.shuffle(all).slice(0, count)
}

const guesserOf = (state: Pick<SpectrumState, 'players' | 'firstGuesser'>, round: number): SeatId =>
  state.players[(state.firstGuesser + round - 1) % state.players.length].seat

/** The round `round` as it starts: a guesser, a topic, numbers, and no answers yet */
function dealRound(
  state: Pick<SpectrumState, 'players' | 'firstGuesser' | 'duplicates' | 'usedTopics'>,
  round: number,
  rng: Rng,
): Pick<
  SpectrumState,
  'phase' | 'round' | 'guesser' | 'card' | 'topic' | 'usedTopics' | 'answerers' | 'reveal'
> {
  const guesser = guesserOf(state, round)
  const { card, used } = drawCard(state.usedTopics, rng)
  const seats = state.players.map((player) => player.seat).filter((seat) => seat !== guesser)
  const numbers = dealNumbers(seats.length, state.duplicates, rng)
  return {
    phase: 'choosing',
    round,
    guesser,
    card,
    topic: null,
    usedTopics: used,
    answerers: seats.map((seat, index) => ({
      seat,
      number: numbers[index],
      text: null,
      out: false,
    })),
    reveal: null,
  }
}

/** The answerers whose answers are in the guess */
const inPlay = (answerers: readonly SpectrumAnswerer[]): SpectrumAnswerer[] =>
  answerers.filter((answerer) => !answerer.out && answerer.text !== null)

/** What an answer in its very place of a full order scores, for the guesser and for its answerer */
export const EXACT_POINTS = 2
/** What an answer one place off scores, each */
export const CLOSE_POINTS = 1

/**
 * How many places off a full order put each answerer: 0 in its place, where equal numbers share the
 * places they could take between them
 */
export function placeErrors(answerers: readonly SpectrumAnswerer[], seats: readonly SeatId[]): Map<SeatId, number> {
  const playing = inPlay(answerers)
  const numberOf = new Map(playing.map((answerer) => [answerer.seat, answerer.number]))
  const numbers = playing.map((answerer) => answerer.number).sort((a, b) => a - b)
  const errors = new Map<SeatId, number>()
  seats.forEach((seat, index) => {
    const number = numberOf.get(seat)
    if (number === undefined) return
    const first = numbers.indexOf(number)
    const last = numbers.lastIndexOf(number)
    errors.set(seat, index < first ? first - index : index > last ? index - last : 0)
  })
  return errors
}

/** Which answerers this guess got right. Equal numbers are interchangeable, so a tie counts either way */
export function rightPicks(answerers: readonly SpectrumAnswerer[], guess: SpectrumGuess): SeatId[] {
  const playing = inPlay(answerers)
  const numberOf = new Map(playing.map((answerer) => [answerer.seat, answerer.number]))
  const numbers = playing.map((answerer) => answerer.number).sort((a, b) => a - b)
  if (guess.kind === 'extremes') {
    const right: SeatId[] = []
    if (numberOf.get(guess.max) === numbers[numbers.length - 1]) right.push(guess.max)
    if (numberOf.get(guess.min) === numbers[0]) right.push(guess.min)
    return right
  }
  return guess.seats.filter((seat, index) => numberOf.get(seat) === numbers[index])
}

/** The answerers a full order put one place off; none for the largest and smallest */
export function closePicks(answerers: readonly SpectrumAnswerer[], guess: SpectrumGuess): SeatId[] {
  if (guess.kind !== 'order') return []
  const errors = placeErrors(answerers, guess.seats)
  return guess.seats.filter((seat) => errors.get(seat) === 1)
}

/** The numbers are shown and this round is scored; after the last round, the game ends here */
function reveal(
  state: SpectrumState,
  guess: SpectrumGuess | null,
  missed: SpectrumMiss | null,
): SpectrumState {
  const correct = guess === null ? [] : rightPicks(state.answerers, guess)
  const close = guess === null ? [] : closePicks(state.answerers, guess)
  const order = guess?.kind === 'order'
  const pointsOf = (seat: SeatId): number =>
    correct.includes(seat) ? (order ? EXACT_POINTS : 1) : close.includes(seat) ? CLOSE_POINTS : 0
  const answerPoints = state.answerers.map((answerer) => pointsOf(answerer.seat))
  const points = state.players.map((player) => {
    if (player.seat === state.guesser) return answerPoints.reduce((sum, value) => sum + value, 0)
    return pointsOf(player.seat)
  })
  const result: SpectrumReveal = { guess, missed, correct, close, points }
  return {
    ...state,
    phase: state.round >= state.totalRounds ? 'over' : 'reveal',
    reveal: result,
    players: state.players.map((player, index) => {
      const gained = points[index]
      const asGuesser = player.seat === state.guesser
      return {
        ...player,
        score: player.score + gained,
        guessed: player.guessed + (asGuesser ? gained : 0),
        read: player.read + (asGuesser ? 0 : gained),
      }
    }),
  }
}

/**
 * The answers lock: whoever has not answered is out of this round, and the guesser gets to guess,
 * unless fewer than two answers came in, when there is nothing to guess and the round scores nothing.
 */
function lock(state: SpectrumState): SpectrumState {
  const locked = {
    ...state,
    answerers: state.answerers.map((answerer) =>
      answerer.text === null ? { ...answerer, out: true } : answerer,
    ),
  }
  if (inPlay(locked.answerers).length < MIN_ANSWERS) return reveal(locked, null, 'tooFew')
  return { ...locked, phase: 'guessing' }
}

/** Locks the answers once nobody is still thinking */
const lockIfAllIn = (state: SpectrumState): SpectrumState =>
  state.answerers.every((answerer) => answerer.out || answerer.text !== null) ? lock(state) : state

/** The topic is set and the answerers start writing */
const choose = (state: SpectrumState, topic: SpectrumTopic): SpectrumState => ({
  ...state,
  phase: 'answering',
  topic,
})

/** The room's pick for a guesser who is gone or out of time */
const randomChoice = (state: SpectrumState, rng: Rng): SpectrumState =>
  choose(state, rng.pick(state.card ?? []))

function nextRound(state: SpectrumState, rng: Rng): SpectrumState {
  const finished = {
    round: state.round,
    guesser: state.guesser,
    topic: state.topic as SpectrumTopic,
    answerers: state.answerers,
    reveal: state.reveal as SpectrumReveal,
  }
  return {
    ...state,
    history: [...state.history, finished],
    ...dealRound(state, state.round + 1, rng),
  }
}

function checkGuess(state: SpectrumState, guess: SpectrumGuess): string | null {
  if (guess.kind !== (state.mode === 'order' ? 'order' : 'extremes')) return ERROR.wrongMode
  const playing = new Set(inPlay(state.answerers).map((answerer) => answerer.seat))
  if (guess.kind === 'extremes') {
    if (!playing.has(guess.max) || !playing.has(guess.min)) return ERROR.notInGuess
    return guess.max === guess.min ? ERROR.sameSeat : null
  }
  const once = new Set(guess.seats)
  const everyone = guess.seats.length === playing.size && once.size === playing.size
  return everyone && guess.seats.every((seat) => playing.has(seat)) ? null : ERROR.badOrder
}

/** What the room does for a seat whose player is gone */
function skip(state: SpectrumState, seat: SeatId, rng: Rng): SpectrumState | null {
  if (state.phase === 'answering') {
    const answerer = state.answerers.find((other) => other.seat === seat)
    if (!answerer || answerer.out || answerer.text !== null) return null
    return lockIfAllIn({
      ...state,
      answerers: state.answerers.map((other) =>
        other.seat === seat ? { ...other, out: true } : other,
      ),
    })
  }
  if (seat !== state.guesser) return null
  if (state.phase === 'choosing') return randomChoice(state, rng)
  if (state.phase === 'guessing') return reveal(state, null, 'skipped')
  return nextRound(state, rng)
}

export const spectrum: GameModule<SpectrumState, SpectrumAction, SpectrumView, SpectrumOptions> = {
  ...spectrumInfo,

  init(seats, options, rng) {
    const players = seats.map((seat) => ({ seat: seat.id, score: 0, guessed: 0, read: 0 }))
    const firstGuesser = rng.int(players.length)
    const base = {
      mode: options.mode,
      duplicates: options.duplicates,
      twoRounds: options.twoRounds,
      clock: options.clock,
      players,
      firstGuesser,
      totalRounds: players.length * (options.twoRounds ? 2 : 1),
      usedTopics: [],
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
        if (!state.players.some((player) => player.seat === action.seat)) {
          return gameError(ERROR.notAPlayer)
        }
        return skip(state, action.seat, rng) ?? gameError(ERROR.nothingToSkip)
      }
      if (state.phase === 'choosing') return randomChoice(state, rng)
      if (state.phase === 'answering') return lock(state)
      if (state.phase === 'guessing') return reveal(state, null, 'time')
      return gameError(ERROR.nothingToSkip)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (!state.players.some((player) => player.seat === actor)) return gameError(ERROR.notAPlayer)

    if (action.type === 'chooseTopic') {
      if (state.phase !== 'choosing') return gameError(ERROR.notChoosing)
      if (actor !== state.guesser) return gameError(ERROR.notGuesser)
      const topic = (state.card ?? []).find((option) => option.id === action.id)
      return topic ? choose(state, topic) : gameError(ERROR.notOnCard)
    }

    if (action.type === 'submitAnswer') {
      if (state.phase !== 'answering') return gameError(ERROR.notAnswering)
      if (actor === state.guesser) return gameError(ERROR.guesserAnswers)
      const answerer = state.answerers.find((other) => other.seat === actor)
      if (!answerer || answerer.out) return gameError(ERROR.out)
      const text = normaliseAnswer(action.text)
      const problem = answerProblem(text)
      if (problem === ERROR.tooLong) return gameError(problem, { max: MAX_ANSWER_LENGTH })
      if (problem !== null) return gameError(problem)
      return lockIfAllIn({
        ...state,
        answerers: state.answerers.map((other) =>
          other.seat === actor ? { ...other, text } : other,
        ),
      })
    }

    if (action.type === 'next') {
      if (state.phase !== 'reveal') return gameError(ERROR.notReveal)
      if (actor !== state.guesser) return gameError(ERROR.notGuesser)
      return nextRound(state, rng)
    }

    if (state.phase !== 'guessing') return gameError(ERROR.notGuessing)
    if (actor !== state.guesser) return gameError(ERROR.notGuesser)
    const guess: SpectrumGuess =
      action.type === 'guessExtremes'
        ? { kind: 'extremes', max: action.max, min: action.min }
        : { kind: 'order', seats: action.seats }
    const problem = checkGuess(state, guess)
    return problem === null ? reveal(state, guess, null) : gameError(problem)
  },

  // The only place numbers and unlocked answers are cut: rule 4 of shared/games/types.ts
  view(state, viewer) {
    const shown = state.phase === 'reveal' || state.phase === 'over'
    const locked = state.phase !== 'answering'
    const { usedTopics: _used, firstGuesser: _first, card, ...open } = state
    return {
      ...open,
      card: card ?? [],
      you: viewer === 'spectator' ? null : viewer,
      answerers: state.answerers.map((answerer) => {
        const own = answerer.seat === viewer
        return {
          seat: answerer.seat,
          status: answerer.out ? 'out' : answerer.text === null ? 'thinking' : 'answered',
          text: locked || own ? answerer.text : null,
          number: shown || own ? answerer.number : null,
        }
      }),
    }
  },

  legalActions(state, seat) {
    if (state.phase === 'choosing') {
      return seat === state.guesser
        ? (state.card ?? []).map((topic) => ({ type: 'chooseTopic', id: topic.id }))
        : []
    }
    if (state.phase === 'answering') {
      const answerer = state.answerers.find((other) => other.seat === seat)
      if (!answerer || answerer.out) return []
      return SAMPLE_ANSWERS.map((text) => ({ type: 'submitAnswer', text }))
    }
    if (seat !== state.guesser) return []
    if (state.phase === 'reveal') return [{ type: 'next' }]
    if (state.phase !== 'guessing') return []
    const playing = inPlay(state.answerers).map((answerer) => answerer.seat)
    if (state.mode === 'order') {
      // Two of the n! orders: the browser lets the guesser drag the real one
      return [playing, [...playing].reverse()].map((seats) => ({ type: 'guessOrder', seats }))
    }
    return playing.flatMap((max) =>
      playing.filter((min) => min !== max).map((min) => ({ type: 'guessExtremes', max, min })),
    )
  },

  // The table waits for an absent answerer who has not answered, and for an absent guesser
  skipAction(state, seat) {
    if (state.phase === 'choosing') return seat === state.guesser ? { type: 'skip', seat } : null
    if (state.phase === 'answering') {
      const answerer = state.answerers.find((other) => other.seat === seat)
      return answerer && !answerer.out && answerer.text === null ? { type: 'skip', seat } : null
    }
    return seat === state.guesser ? { type: 'skip', seat } : null
  },

  // The round in the id, so that every round gets a fresh clock. None at a reveal: the guesser moves on
  timers(state) {
    if (!state.clock) return []
    if (state.phase === 'choosing') {
      return [{ id: `choose-${state.round}`, ms: CHOOSE_MS, action: { type: 'timeUp' } }]
    }
    if (state.phase === 'answering') {
      return [{ id: `answer-${state.round}`, ms: ANSWER_MS, action: { type: 'timeUp' } }]
    }
    if (state.phase === 'guessing') {
      return [{ id: `guess-${state.round}`, ms: GUESS_MS, action: { type: 'timeUp' } }]
    }
    return []
  },

  // The answer is the only thing an answerer may say until the numbers are shown: chat would let
  // them tell the guesser their number, which scores them a point. The numbers are dealt before
  // the guesser chooses, so chat closes from then
  chatLocked(state) {
    return state.phase === 'choosing' || state.phase === 'answering' || state.phase === 'guessing'
  },

  isOver(state) {
    return state.phase === 'over'
  },

  result(state): GameResult {
    const ordered = [...state.players].sort((a, b) => b.score - a.score || a.seat - b.seat)
    const top = ordered[0].score
    const winners = ordered.filter((player) => player.score === top).length
    return {
      summary: {
        key: winners > 1 ? 'games.spectrum.result.tie' : 'games.spectrum.result.won',
        params: { score: top, rounds: state.totalRounds, winners },
      },
      standings: ordered.map((player) => ({
        seat: player.seat,
        rank: 1 + ordered.filter((other) => other.score > player.score).length,
        score: player.score,
        note: {
          key: 'games.spectrum.note.points',
          params: { guessed: player.guessed, read: player.read },
        },
      })),
    }
  },
}
