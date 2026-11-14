import { describe, expect, it, vi } from 'vitest'
import { GAME_IDS, getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { applyAction, makeSeats, projectGame, startMatch } from '../../shared/games/match.ts'
import { defaultOptions, parseOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import {
  ANSWER_MS,
  CARD_SIZE,
  CHOOSE_MS,
  GUESS_MS,
  MAX_ANSWER_LENGTH,
  SAMPLE_ANSWERS,
  spectrum,
} from '../../shared/games/spectrum/rules.ts'
import { SPECTRUM_TOPICS } from '../../shared/games/spectrum/topics.ts'
import type {
  SpectrumAction,
  SpectrumOptions,
  SpectrumState,
  SpectrumView,
} from '../../shared/games/spectrum/types.ts'
import { isGameError, type Actor, type GameError, type Viewer } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// The harness plays whole games over many seeds, which goes past 5 s on a busy machine
vi.setConfig({ testTimeout: 120_000 })

const OPTIONS: SpectrumOptions = {
  mode: 'extremes',
  duplicates: false,
  twoRounds: false,
  clock: true,
}

/** A new game as the room deals it: the guesser still choosing from the card */
const dealt = (seats: number, overrides: Partial<SpectrumOptions> = {}, seed = 1) =>
  spectrum.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

/** The guesser asks the first topic on the card, and the answerers can write */
const chosen = (state: SpectrumState): SpectrumState =>
  act(state, { type: 'chooseTopic', id: (state.card ?? [])[0].id }, state.guesser)

/** A new game with its first topic chosen */
const start = (seats: number, overrides: Partial<SpectrumOptions> = {}, seed = 1) =>
  chosen(dealt(seats, overrides, seed))

const answer = (text: string): SpectrumAction => ({ type: 'submitAnswer', text })
const extremes = (max: number, min: number): SpectrumAction => ({ type: 'guessExtremes', max, min })
const order = (seats: number[]): SpectrumAction => ({ type: 'guessOrder', seats })
const NEXT: SpectrumAction = { type: 'next' }
const TIME_UP: SpectrumAction = { type: 'timeUp' }
const skip = (seat: number): SpectrumAction => ({ type: 'skip', seat })

function act(state: SpectrumState, action: SpectrumAction, actor: Actor): SpectrumState {
  const next = spectrum.reduce(state, action, actor, createRng(99))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: SpectrumState, action: unknown, actor: Actor): GameError => {
  const answered = spectrum.reduce(state, action as SpectrumAction, actor, createRng(99))
  expect(isGameError(answered)).toBe(true)
  return answered as GameError
}

const error = (name: string) => `games.spectrum.error.${name}`

/** The same state with these numbers, by seat, for a test that needs to know who holds what */
const withNumbers = (state: SpectrumState, numbers: Record<number, number>): SpectrumState => ({
  ...state,
  answerers: state.answerers.map((answerer) => ({
    ...answerer,
    number: numbers[answerer.seat] ?? answerer.number,
  })),
})

const answererSeats = (state: SpectrumState) => state.answerers.map((answerer) => answerer.seat)

/** Every answerer answers, so the answers lock */
const answerAll = (state: SpectrumState): SpectrumState =>
  answererSeats(state).reduce(
    (current, seat) => act(current, answer(`答案${'甲乙丙丁戊己庚辛壬癸'[seat % 10]}`), seat),
    state,
  )

/** A state with the guesser at seat 0 and the others holding these numbers, ready to guess */
function guessing(
  seats: number,
  numbers: Record<number, number>,
  overrides: Partial<SpectrumOptions> = {},
) {
  // Seed 3 puts the first guess on some seat; turn it to seat 0 for readable tests
  const base = start(seats, overrides, 3)
  const atZero = { ...base, ...rebuildAround(base, 0) }
  return answerAll(withNumbers(atZero, numbers))
}

/** The answerers of a round whose guesser is `guesser`, with numbers 1, 2, 3... in seat order */
function rebuildAround(state: SpectrumState, guesser: number): Partial<SpectrumState> {
  const seats = state.players.map((player) => player.seat).filter((seat) => seat !== guesser)
  return {
    firstGuesser: guesser,
    guesser,
    answerers: seats.map((seat, index) => ({ seat, number: index + 1, text: null, out: false })),
  }
}

const viewOf = (state: SpectrumState, viewer: Viewer): SpectrumView => spectrum.view(state, viewer)

describe('the module', () => {
  it('runs on the room for 4 to 11 seats, and the lobby lists it (owner, 2026-11-12)', () => {
    expect(getGame('spectrum')).toBe(spectrum)
    expect(GAME_IDS).toContain('spectrum')
    expect(spectrum.meta).toMatchObject({ minPlayers: 4, maxPlayers: 11 })
    expect(spectrum.meta).not.toHaveProperty('unlisted')
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('spectrum')
  })

  it('does not offer to play for an absent seat, since an answer has to come from a person', () => {
    expect(spectrum.meta.proxyTurns).toBeUndefined()
  })

  it('has every key it can send translated, in the lobby or the screen strings', () => {
    const keys = new Set([...Object.keys(GAME_MESSAGES.en), ...Object.keys(SCREEN_MESSAGES.en)])
    const source = JSON.stringify(spectrum) // labels of the options
    for (const key of source.match(/games\.spectrum\.[\w.]+/g) ?? []) expect(keys).toContain(key)
    for (const name of ['badAction', 'over', 'digits', 'tooLong', 'badOrder', 'nothingToSkip']) {
      expect(keys).toContain(error(name))
    }
    for (const key of ['result.won', 'result.tie', 'note.points']) {
      expect(keys).toContain(`games.spectrum.${key}`)
    }
  })
})

describe('rule options', () => {
  it('defaults to the whole order (owner, 2026-11-13), no repeats, one round each, the clock on', () => {
    expect(defaultOptions(spectrum.options)).toEqual({ ...OPTIONS, mode: 'order' })
  })

  it('replaces what is invalid with the default', () => {
    expect(
      parseOptions(spectrum.options, {
        mode: 'teams',
        duplicates: 'yes',
        twoRounds: 2,
        clock: null,
      }),
    ).toEqual({ ...OPTIONS, mode: 'order' })
  })

  it('keeps what is valid and copies it into the state', () => {
    const chosen: SpectrumOptions = {
      mode: 'order',
      duplicates: true,
      twoRounds: true,
      clock: false,
    }
    expect(parseOptions(spectrum.options, chosen)).toEqual(chosen)
    expect(start(4, chosen)).toMatchObject(chosen)
  })
})

describe('the deal', () => {
  it.each([4, 5, 8, 11])(
    'gives each of %i seats but the guesser a number from 1 to 10, all different',
    (seats) => {
      for (let seed = 0; seed < 20; seed++) {
        const state = start(seats, {}, seed)
        expect(state.answerers).toHaveLength(seats - 1)
        expect(answererSeats(state)).not.toContain(state.guesser)
        const numbers = state.answerers.map((answerer) => answerer.number)
        expect(numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 10)).toBe(true)
        expect(new Set(numbers).size).toBe(numbers.length)
      }
    },
  )

  it('with repeats allowed, draws each number on its own, so two can match', () => {
    let repeated = 0
    for (let seed = 0; seed < 30; seed++) {
      const numbers = start(11, { duplicates: true }, seed).answerers.map(
        (answerer) => answerer.number,
      )
      expect(numbers.every((n) => n >= 1 && n <= 10)).toBe(true)
      if (new Set(numbers).size < numbers.length) repeated++
    }
    // Ten draws out of ten values almost always repeat; all different every time would be a bug
    expect(repeated).toBeGreaterThan(25)
  })

  it('depends only on the seed', () => {
    expect(start(5, {}, 7)).toEqual(start(5, {}, 7))
    expect(start(5, {}, 7)).not.toEqual(start(5, {}, 8))
  })

  it('starts with nobody answered, no reveal, everyone on nothing', () => {
    const state = start(4)
    expect(state).toMatchObject({ phase: 'answering', round: 1, reveal: null, history: [] })
    expect(state.answerers.every((answerer) => answerer.text === null && !answerer.out)).toBe(true)
    expect(state.players.every((player) => player.score === 0)).toBe(true)
  })
})

const cardIds = (state: SpectrumState) => (state.card ?? []).map((topic) => topic.id)

describe('topics', () => {
  it('deals a card of four topics from the bank, each with its two ends, each of another category', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { card = [] } = dealt(4, {}, seed)
      expect(card).toHaveLength(CARD_SIZE)
      expect(CARD_SIZE).toBe(4)
      for (const topic of card) {
        const [category, text, scene, low, high] = SPECTRUM_TOPICS[topic.id - 1]
        expect(topic).toEqual({ id: topic.id, category, topic: text, scene, low, high })
      }
      expect(new Set(card.map((topic) => topic.category)).size).toBe(CARD_SIZE)
    }
  })

  it('never puts a topic on a card twice in a room, over the longest game', () => {
    let state = dealt(11, { twoRounds: true }, 5)
    const seen = [...cardIds(state)]
    while (state.phase !== 'over') {
      if (state.phase === 'choosing') state = chosen(state)
      state = answerAll(state)
      const [max, min] = answererSeats(state)
      state = act(state, extremes(max, min), state.guesser)
      if (state.phase === 'reveal') {
        state = act(state, NEXT, state.guesser)
        seen.push(...cardIds(state))
      }
    }
    expect(seen).toHaveLength(22 * CARD_SIZE)
    expect(new Set(seen).size).toBe(22 * CARD_SIZE)
    expect(state.usedTopics).toEqual(seen)
  })

  it('starts the bank over rather than run dry', () => {
    const all = SPECTRUM_TOPICS.map((_, index) => index + 1)
    const state = answerAll({ ...start(4), usedTopics: all.slice(0, all.length - 2) })
    const shown = act(act(state, extremes(...firstTwo(state)), state.guesser), NEXT, state.guesser)
    expect(shown.card).toHaveLength(CARD_SIZE)
    expect(shown.usedTopics).toEqual(cardIds(shown))
  })

  const firstTwo = (state: SpectrumState): [number, number] => {
    const [a, b] = answererSeats(state)
    return [a, b]
  }
})

describe('answering', () => {
  it('takes an answer, trimmed, with spaces of any kind made one', () => {
    const state = start(4)
    const seat = state.answerers[0].seat
    const next = act(state, answer('  鹽酥雞\t加\n辣  '), seat)
    expect(next.answerers[0].text).toBe('鹽酥雞 加 辣')
    expect(next.phase).toBe('answering')
  })

  it('lets an answer be replaced until the answers lock', () => {
    const state = start(4)
    const seat = state.answerers[0].seat
    const next = act(act(state, answer('牛肉麵'), seat), answer('水煮青菜'), seat)
    expect(next.answerers[0].text).toBe('水煮青菜')
  })

  it('refuses any digit, half-width, full-width or another sign of a number', () => {
    const state = start(4)
    const seat = state.answerers[0].seat
    for (const text of ['7', '我是9', '９分', '①號', '十²', '٣']) {
      expect(refusal(state, answer(text), seat).gameError, text).toBe(error('digits'))
    }
  })

  it('allows Chinese numerals, which are words too', () => {
    const state = start(4)
    const seat = state.answerers[0].seat
    for (const text of ['一般般', '十足的鹹酥雞', '九份', '三分熟的牛排', '〇']) {
      expect(act(state, answer(text), seat).answerers[0].text).toBe(text)
    }
  })

  it('refuses an empty answer and one over the length, counting characters, not bytes', () => {
    const state = start(4)
    const seat = state.answerers[0].seat
    expect(refusal(state, answer('   '), seat).gameError).toBe(error('empty'))
    expect(refusal(state, answer(''), seat).gameError).toBe(error('empty'))
    const longest = '滷'.repeat(MAX_ANSWER_LENGTH)
    expect(act(state, answer(longest), seat).answerers[0].text).toBe(longest)
    expect(act(state, answer('🍜'.repeat(MAX_ANSWER_LENGTH)), seat).answerers[0].text).toHaveLength(
      60,
    )
    expect(refusal(state, answer(`${longest}肉`), seat)).toEqual({
      gameError: error('tooLong'),
      params: { max: MAX_ANSWER_LENGTH },
    })
  })

  it('refuses the guesser, a seat not at the table, and the room', () => {
    const state = start(4)
    expect(refusal(state, answer('滷肉飯'), state.guesser).gameError).toBe(error('guesserAnswers'))
    expect(refusal(state, answer('滷肉飯'), 9).gameError).toBe(error('notAPlayer'))
    expect(refusal(state, answer('滷肉飯'), 'system').gameError).toBe(error('badAction'))
  })

  it('refuses the wrong shape of action', () => {
    const state = start(4)
    const seat = state.answerers[0].seat
    for (const bad of [
      { type: 'submitAnswer' },
      { type: 'submitAnswer', text: 7 },
      { type: 'guessExtremes', max: '1', min: 2 },
      { type: 'guessOrder', seats: [1, 'x'] },
      { type: 'guessOrder', seats: 'all' },
      { type: 'skip' },
      null,
      'next',
    ]) {
      expect(refusal(state, bad, seat).gameError, JSON.stringify(bad)).toBe(error('badAction'))
    }
  })

  it('locks the answers the moment the last one comes in, and takes no more', () => {
    const state = start(5)
    const seats = answererSeats(state)
    let current = state
    for (const seat of seats.slice(0, -1)) current = act(current, answer('滷肉飯'), seat)
    expect(current.phase).toBe('answering')
    current = act(current, answer('一杯珍奶'), seats[seats.length - 1])
    expect(current.phase).toBe('guessing')
    expect(refusal(current, answer('改一下'), seats[0]).gameError).toBe(error('notAnswering'))
    expect(spectrum.legalActions(current, seats[0])).toEqual([])
  })

  it('offers the answerers a few sample answers, and the guesser nothing', () => {
    const state = start(4)
    expect(spectrum.legalActions(state, state.answerers[0].seat)).toEqual(
      SAMPLE_ANSWERS.map(answer),
    )
    expect(spectrum.legalActions(state, state.guesser)).toEqual([])
    // The samples must pass the referee
    for (const text of SAMPLE_ANSWERS) act(state, answer(text), state.answerers[0].seat)
  })
})

describe('guessing the largest and the smallest', () => {
  // Guesser seat 0; seats 1, 2, 3 hold 7, 2, 9
  const NUMBERS = { 1: 7, 2: 2, 3: 9 }

  it('scores one for the guesser and one for each answerer read right', () => {
    const both = act(guessing(4, NUMBERS), extremes(3, 2), 0)
    expect(both.phase).toBe('reveal')
    expect(both.reveal).toEqual({
      guess: { kind: 'extremes', max: 3, min: 2 },
      missed: null,
      correct: [3, 2],
      close: [],
      points: [2, 0, 1, 1],
    })
    expect(both.players.map((player) => player.score)).toEqual([2, 0, 1, 1])
    expect(both.players[0]).toMatchObject({ guessed: 2, read: 0 })
    expect(both.players[3]).toMatchObject({ guessed: 0, read: 1 })

    const one = act(guessing(4, NUMBERS), extremes(1, 2), 0)
    expect(one.reveal?.correct).toEqual([2])
    expect(one.reveal?.points).toEqual([1, 0, 1, 0])

    const none = act(guessing(4, NUMBERS), extremes(2, 3), 0)
    expect(none.reveal?.correct).toEqual([])
    expect(none.reveal?.points).toEqual([0, 0, 0, 0])
  })

  it('with repeats, any answerer tied on the top or the bottom number counts', () => {
    const tied = guessing(5, { 1: 9, 2: 9, 3: 1, 4: 1 }, { duplicates: true })
    for (const [max, min] of [
      [1, 3],
      [2, 4],
      [1, 4],
      [2, 3],
    ]) {
      expect(act(tied, extremes(max, min), 0).reveal?.correct).toEqual([max, min])
    }
    // Everyone on the same number: both picks are right, whichever two they are
    const flat = guessing(4, { 1: 5, 2: 5, 3: 5 }, { duplicates: true })
    expect(act(flat, extremes(2, 3), 0).reveal?.points).toEqual([2, 0, 1, 1])
  })

  it('refuses the same seat twice, a seat not answering, the other mode and anyone else', () => {
    const state = guessing(4, NUMBERS)
    expect(refusal(state, extremes(1, 1), 0).gameError).toBe(error('sameSeat'))
    expect(refusal(state, extremes(0, 1), 0).gameError).toBe(error('notInGuess'))
    expect(refusal(state, extremes(1, 8), 0).gameError).toBe(error('notInGuess'))
    expect(refusal(state, order([2, 1, 3]), 0).gameError).toBe(error('wrongMode'))
    expect(refusal(state, extremes(3, 2), 1).gameError).toBe(error('notGuesser'))
    expect(refusal(start(4), extremes(1, 2), start(4).guesser).gameError).toBe(error('notGuessing'))
  })

  it('offers the guesser every pair of two different answers', () => {
    const legal = spectrum.legalActions(guessing(4, NUMBERS), 0)
    expect(legal).toHaveLength(6)
    expect(legal).toContainEqual(extremes(3, 2))
    expect(
      legal.some((action) => action.type === 'guessExtremes' && action.max === action.min),
    ).toBe(false)
    expect(spectrum.legalActions(guessing(4, NUMBERS), 1)).toEqual([])
  })
})

describe('guessing the whole order', () => {
  const NUMBERS = { 1: 7, 2: 2, 3: 9, 4: 4 }

  it('scores two each for an answer in its place and one each for one place off (2026-11-14)', () => {
    const right = act(guessing(5, NUMBERS, { mode: 'order' }), order([2, 4, 1, 3]), 0)
    expect(right.reveal?.correct).toEqual([2, 4, 1, 3])
    expect(right.reveal?.close).toEqual([])
    expect(right.reveal?.points).toEqual([8, 2, 2, 2, 2])

    // 4 and 1 swapped: the two ends are right, the middle two one place off
    const swapped = act(guessing(5, NUMBERS, { mode: 'order' }), order([2, 1, 4, 3]), 0)
    expect(swapped.reveal?.correct).toEqual([2, 3])
    expect(swapped.reveal?.close).toEqual([1, 4])
    expect(swapped.reveal?.points).toEqual([6, 1, 2, 2, 1])
  })

  it('does not zero out a whole line for one early slip', () => {
    // Truly 2, 4, 7, 9; the smallest put last: the other three are each one place off
    const slipped = act(guessing(5, NUMBERS, { mode: 'order' }), order([4, 1, 3, 2]), 0)
    expect(slipped.reveal?.correct).toEqual([])
    expect(slipped.reveal?.close).toEqual([4, 1, 3])
    expect(slipped.reveal?.points).toEqual([3, 1, 0, 1, 1])
  })

  it('lets tied numbers sit in either order', () => {
    const tied = guessing(5, { 1: 3, 2: 3, 3: 8, 4: 1 }, { mode: 'order', duplicates: true })
    expect(act(tied, order([4, 1, 2, 3]), 0).reveal?.correct).toHaveLength(4)
    expect(act(tied, order([4, 2, 1, 3]), 0).reveal?.correct).toHaveLength(4)
    expect(act(tied, order([1, 4, 2, 3]), 0).reveal?.correct).toEqual([2, 3])
  })

  it('needs every answer exactly once', () => {
    const state = guessing(5, NUMBERS, { mode: 'order' })
    for (const seats of [
      [2, 4, 1],
      [2, 4, 1, 3, 3],
      [2, 4, 1, 1],
      [2, 4, 1, 0],
      [2, 4, 1, 3, 0],
    ]) {
      expect(refusal(state, order(seats), 0).gameError, seats.join()).toBe(error('badOrder'))
    }
    expect(refusal(state, extremes(3, 2), 0).gameError).toBe(error('wrongMode'))
  })

  it('offers two sample orders, each accepted', () => {
    const state = guessing(5, NUMBERS, { mode: 'order' })
    const legal = spectrum.legalActions(state, 0)
    expect(legal).toEqual([order([1, 2, 3, 4]), order([4, 3, 2, 1])])
    for (const action of legal) act(state, action, 0)
  })
})

describe('rounds and the end of the game', () => {
  /** Plays one round with a guess that is wrong for the bottom, right for the top */
  function playRound(state: SpectrumState): SpectrumState {
    const answered = answerAll(state)
    const [first, second] = answererSeats(answered)
    const guessed = act(answered, extremes(first, second), answered.guesser)
    return guessed.phase === 'reveal' ? chosen(act(guessed, NEXT, guessed.guesser)) : guessed
  }

  it('moves the guesser one seat on each round, so everyone guesses once', () => {
    let state = start(5, {}, 2)
    const guessers = [state.guesser]
    while (state.phase !== 'over') {
      state = playRound(state)
      if (state.phase !== 'over') guessers.push(state.guesser)
    }
    expect(guessers).toHaveLength(5)
    expect([...guessers].sort()).toEqual([0, 1, 2, 3, 4])
    for (let index = 1; index < guessers.length; index++) {
      expect(guessers[index]).toBe((guessers[index - 1] + 1) % 5)
    }
    expect(state.history).toHaveLength(4)
    expect(state.totalRounds).toBe(5)
  })

  it('twice round the table with the option', () => {
    let state = start(4, { twoRounds: true })
    let rounds = 1
    while (state.phase !== 'over') {
      state = playRound(state)
      if (state.phase !== 'over') rounds++
    }
    expect(rounds).toBe(8)
    expect(state.totalRounds).toBe(8)
  })

  it('keeps each finished round, deals new numbers, and clears the answers', () => {
    const state = act(guessing(4, { 1: 7, 2: 2, 3: 9 }), extremes(3, 2), 0)
    const next = act(state, NEXT, 0)
    expect(next).toMatchObject({ phase: 'choosing', round: 2, guesser: 1, reveal: null, topic: null })
    expect(next.history).toHaveLength(1)
    expect(next.history[0]).toMatchObject({ round: 1, guesser: 0, topic: state.topic })
    expect(next.history[0].reveal).toEqual(state.reveal)
    expect(next.history[0].answerers.map((answerer) => answerer.number)).toEqual([7, 2, 9])
    expect(answererSeats(next)).toEqual([0, 2, 3])
    expect(next.answerers.every((answerer) => answerer.text === null)).toBe(true)
    expect(cardIds(next)).not.toContain(state.topic?.id)
  })

  it('only the guesser moves on, and only after the reveal', () => {
    const state = act(guessing(4, { 1: 7, 2: 2, 3: 9 }), extremes(3, 2), 0)
    expect(refusal(state, NEXT, 1).gameError).toBe(error('notGuesser'))
    expect(spectrum.legalActions(state, 0)).toEqual([NEXT])
    expect(spectrum.legalActions(state, 1)).toEqual([])
    expect(refusal(guessing(4, { 1: 7, 2: 2, 3: 9 }), NEXT, 0).gameError).toBe(error('notReveal'))
    expect(refusal(state, answer('滷肉飯'), 1).gameError).toBe(error('notAnswering'))
  })

  it('ends at the last guess with that reveal up, ranks by score, ties sharing a place', () => {
    let state = start(4, {}, 4)
    while (state.round < state.totalRounds) state = playRound(state)
    state = answerAll(state)
    const [first, second] = answererSeats(state)
    state = act(state, extremes(first, second), state.guesser)
    expect(state.phase).toBe('over')
    expect(state.reveal).not.toBeNull()
    expect(spectrum.isOver(state)).toBe(true)
    for (const seat of [0, 1, 2, 3]) expect(spectrum.legalActions(state, seat)).toEqual([])
    expect(refusal(state, NEXT, state.guesser).gameError).toBe(error('over'))

    const scored = {
      ...state,
      players: state.players.map((player, index) => ({
        ...player,
        score: [3, 5, 5, 1][index],
        guessed: [1, 2, 3, 0][index],
        read: [2, 3, 2, 1][index],
      })),
    }
    const result = spectrum.result(scored)
    expect(result.summary).toEqual({
      key: 'games.spectrum.result.tie',
      params: { score: 5, rounds: 4, winners: 2 },
    })
    expect(result.standings.map((line) => [line.seat, line.rank, line.score])).toEqual([
      [1, 1, 5],
      [2, 1, 5],
      [0, 3, 3],
      [3, 4, 1],
    ])
    expect(result.standings[0].note).toEqual({
      key: 'games.spectrum.note.points',
      params: { guessed: 2, read: 3 },
    })
    const single = {
      ...scored,
      players: scored.players.map((p, i) => ({ ...p, score: [3, 6, 5, 1][i] })),
    }
    expect(spectrum.result(single).summary.key).toBe('games.spectrum.result.won')
  })
})

describe('the clock', () => {
  const timers = (state: SpectrumState) => spectrum.timers?.(state) ?? []

  it('gives 30 seconds to choose, 90 to answer and 60 to guess, a fresh one every round', () => {
    expect(timers(dealt(4))).toEqual([{ id: 'choose-1', ms: CHOOSE_MS, action: TIME_UP }])
    expect(CHOOSE_MS).toBe(30_000)
    const state = start(4)
    expect(timers(state)).toEqual([{ id: 'answer-1', ms: ANSWER_MS, action: TIME_UP }])
    expect(ANSWER_MS).toBe(90_000)
    const guess = guessing(4, { 1: 7, 2: 2, 3: 9 })
    expect(timers(guess)).toEqual([{ id: `guess-${guess.round}`, ms: GUESS_MS, action: TIME_UP }])
    expect(GUESS_MS).toBe(60_000)
    const shown = act(guess, extremes(3, 2), 0)
    expect(timers(shown)).toEqual([])
    expect(timers(act(shown, NEXT, 0))[0].id).toBe('choose-2')
  })

  it('keeps the same countdown while answers come in', () => {
    const state = start(5)
    expect(timers(act(state, answer('滷肉飯'), state.answerers[0].seat))[0].id).toBe('answer-1')
  })

  it('asks for none when the option is off', () => {
    expect(timers(start(4, { clock: false }))).toEqual([])
    expect(timers(guessing(4, { 1: 7, 2: 2, 3: 9 }, { clock: false }))).toEqual([])
  })

  it('when answering runs out, whoever has not answered sits the round out', () => {
    const state = start(5)
    const [a, b, c] = answererSeats(state)
    const after = act(act(act(state, answer('滷肉飯'), a), answer('珍奶'), b), TIME_UP, 'system')
    expect(after.phase).toBe('guessing')
    expect(after.answerers.find((answerer) => answerer.seat === c)?.out).toBe(true)
    const legal = spectrum.legalActions(after, after.guesser)
    expect(legal).toEqual([extremes(a, b), extremes(b, a)])
    expect(refusal(after, extremes(a, c), after.guesser).gameError).toBe(error('notInGuess'))
  })

  it('with fewer than two answers there is nothing to guess: the round scores nothing', () => {
    const state = start(4)
    const after = act(act(state, answer('滷肉飯'), state.answerers[0].seat), TIME_UP, 'system')
    expect(after.phase).toBe('reveal')
    expect(after.reveal).toEqual({
      guess: null,
      missed: 'tooFew',
      correct: [],
      close: [],
      points: [0, 0, 0, 0],
    })
    expect(act(start(4), TIME_UP, 'system').reveal?.missed).toBe('tooFew')
  })

  it('when guessing runs out, the guess counts as none', () => {
    const after = act(guessing(4, { 1: 7, 2: 2, 3: 9 }), TIME_UP, 'system')
    expect(after.reveal).toEqual({ guess: null, missed: 'time', correct: [], close: [], points: [0, 0, 0, 0] })
  })

  it('only the room can call time, and a late call at a reveal does nothing', () => {
    expect(refusal(start(4), TIME_UP, 0).gameError).toBe(error('systemOnly'))
    const shown = act(guessing(4, { 1: 7, 2: 2, 3: 9 }), extremes(3, 2), 0)
    expect(refusal(shown, TIME_UP, 'system').gameError).toBe(error('nothingToSkip'))
  })
})

describe('covering for an absent seat', () => {
  it('skips an answerer who has not answered: out of the round, and the answers may lock', () => {
    const state = start(4)
    const [a, b, c] = answererSeats(state)
    expect(spectrum.skipAction?.(state, a)).toEqual(skip(a))
    let next = act(act(state, answer('滷肉飯'), b), answer('珍奶'), c)
    expect(next.phase).toBe('answering')
    next = act(next, skip(a), 'system')
    expect(next.phase).toBe('guessing')
    expect(next.answerers[0]).toMatchObject({ seat: a, out: true, text: null })
    expect(spectrum.legalActions(next, a)).toEqual([])
  })

  it('has nothing to skip for an answerer already in, or for the guesser while others answer', () => {
    const state = start(4)
    const [a] = answererSeats(state)
    const answered = act(state, answer('滷肉飯'), a)
    expect(spectrum.skipAction?.(answered, a)).toBeNull()
    expect(refusal(answered, skip(a), 'system').gameError).toBe(error('nothingToSkip'))
    expect(spectrum.skipAction?.(state, state.guesser)).toBeNull()
    expect(refusal(state, skip(state.guesser), 'system').gameError).toBe(error('nothingToSkip'))
  })

  it('skips an absent guesser: no guess and nothing scored, then on to the next round', () => {
    const state = guessing(4, { 1: 7, 2: 2, 3: 9 })
    expect(spectrum.skipAction?.(state, 0)).toEqual(skip(0))
    expect(spectrum.skipAction?.(state, 1)).toBeNull()
    const shown = act(state, skip(0), 'system')
    expect(shown.reveal).toEqual({
      guess: null,
      missed: 'skipped',
      correct: [],
      close: [],
      points: [0, 0, 0, 0],
    })
    expect(spectrum.skipAction?.(shown, 0)).toEqual(skip(0))
    const next = act(shown, skip(0), 'system')
    expect(next).toMatchObject({ phase: 'choosing', round: 2, guesser: 1 })
  })

  it('comes only from the room, for a seat at the table', () => {
    const state = start(4)
    expect(refusal(state, skip(state.answerers[0].seat), state.answerers[1].seat).gameError).toBe(
      error('systemOnly'),
    )
    expect(refusal(state, skip(9), 'system').gameError).toBe(error('notAPlayer'))
    expect(refusal(state, NEXT, 'system').gameError).toBe(error('badAction'))
  })

  it('goes through the same match code the room uses', () => {
    const match = startMatch(spectrum, makeSeats(4), OPTIONS, 5)
    expect(isGameError(applyAction(spectrum, match, skip(match.state.guesser), 'system'))).toBe(false)
  })
})

describe('choosing the topic (owner, 2026-11-13)', () => {
  it('starts every round with the guesser choosing, the numbers already dealt', () => {
    const state = dealt(4)
    expect(state).toMatchObject({ phase: 'choosing', topic: null, round: 1 })
    expect(state.answerers.every((answerer) => answerer.number >= 1 && answerer.number <= 10)).toBe(true)
  })

  it('takes the guesser’s pick from the card and lets the answerers write', () => {
    const state = dealt(4)
    const [, second] = state.card ?? []
    const next = act(state, { type: 'chooseTopic', id: second.id }, state.guesser)
    expect(next).toMatchObject({ phase: 'answering', topic: second })
  })

  it('offers the guesser each topic on the card, and nobody else anything', () => {
    const state = dealt(4)
    expect(spectrum.legalActions(state, state.guesser)).toEqual(
      cardIds(state).map((id) => ({ type: 'chooseTopic', id })),
    )
    expect(spectrum.legalActions(state, state.answerers[0].seat)).toEqual([])
  })

  it('refuses a topic not on the card, anyone but the guesser, and choosing twice', () => {
    const state = dealt(4)
    const off = SPECTRUM_TOPICS.map((_, index) => index + 1).find((id) => !cardIds(state).includes(id))
    expect(refusal(state, { type: 'chooseTopic', id: off }, state.guesser).gameError).toBe(error('notOnCard'))
    expect(refusal(state, { type: 'chooseTopic', id: cardIds(state)[0] }, state.answerers[0].seat).gameError).toBe(
      error('notGuesser'),
    )
    expect(refusal(state, { type: 'chooseTopic', id: 'one' }, state.guesser).gameError).toBe(error('badAction'))
    expect(refusal(chosen(state), { type: 'chooseTopic', id: cardIds(state)[0] }, state.guesser).gameError).toBe(
      error('notChoosing'),
    )
    expect(refusal(state, answer('滷肉飯'), state.answerers[0].seat).gameError).toBe(error('notAnswering'))
  })

  it('when the time runs out or the guesser is gone, the room asks one of the card’s topics', () => {
    const state = dealt(4)
    const timed = act(state, TIME_UP, 'system')
    expect(timed.phase).toBe('answering')
    expect(cardIds(state)).toContain(timed.topic?.id)
    expect(spectrum.skipAction?.(state, state.guesser)).toEqual(skip(state.guesser))
    expect(spectrum.skipAction?.(state, state.answerers[0].seat)).toBeNull()
    const skipped = act(state, skip(state.guesser), 'system')
    expect(cardIds(state)).toContain(skipped.topic?.id)
  })

  it('shows everyone the card, the guesser and spectators too', () => {
    const state = dealt(4)
    for (const viewer of [state.guesser, state.answerers[0].seat, 'spectator'] as const) {
      expect(spectrum.view(state, viewer).card).toEqual(state.card)
    }
  })

  it('still shows a round from before cards, with an empty card', () => {
    const { card: _card, ...old } = start(4)
    expect(spectrum.view(old, 0).card).toEqual([])
  })
})

describe('chat', () => {
  it('is closed while answering and guessing, so nobody can type a number, and open at the reveal', () => {
    expect(spectrum.chatLocked?.(dealt(4))).toBe(true)
    expect(spectrum.chatLocked?.(start(4))).toBe(true)
    const guess = guessing(4, { 1: 7, 2: 2, 3: 9 })
    expect(spectrum.chatLocked?.(guess)).toBe(true)
    expect(spectrum.chatLocked?.(act(guess, extremes(3, 2), 0))).toBe(false)
  })
})

describe('view trimming', () => {
  const NUMBERS = { 1: 7, 2: 2, 3: 9 }

  it('an answerer sees their own number and nobody else’s', () => {
    const state = withNumbers({ ...start(4, {}, 3), ...rebuildAround(start(4, {}, 3), 0) }, NUMBERS)
    const view = viewOf(state, 2)
    expect(view.you).toBe(2)
    expect(view.answerers.map((answerer) => answerer.number)).toEqual([null, 2, null])
  })

  it('the guesser and spectators see no number, and see the same thing', () => {
    const state = withNumbers({ ...start(4, {}, 3), ...rebuildAround(start(4, {}, 3), 0) }, NUMBERS)
    const guesser = viewOf(state, 0)
    const spectator = viewOf(state, 'spectator')
    expect(guesser.answerers.every((answerer) => answerer.number === null)).toBe(true)
    expect(spectator.you).toBeNull()
    expect({ ...spectator, you: 0 }).toEqual(guesser)
  })

  it('before the answers lock, shows only who has answered, and your own answer to you', () => {
    const base = withNumbers({ ...start(5, {}, 3), ...rebuildAround(start(5, {}, 3), 0) }, NUMBERS)
    const state = act(act(base, answer('鹽酥雞'), 1), answer('水煮青菜'), 2)
    expect(state.phase).toBe('answering')
    const one = viewOf(state, 1)
    expect(
      one.answerers.map((answerer) => [answerer.seat, answerer.status, answerer.text]),
    ).toEqual([
      [1, 'answered', '鹽酥雞'],
      [2, 'answered', null],
      [3, 'thinking', null],
      [4, 'thinking', null],
    ])
    for (const viewer of [0, 3, 'spectator'] as const) {
      expect(viewOf(state, viewer).answerers.every((answerer) => answerer.text === null)).toBe(true)
    }
  })

  it('once locked, shows every answer to everyone, still without the numbers', () => {
    const state = guessing(4, NUMBERS)
    for (const viewer of [0, 1, 2, 3, 'spectator'] as const) {
      const view = viewOf(state, viewer)
      expect(view.answerers.every((answerer) => answerer.text !== null)).toBe(true)
      expect(view.answerers.filter((answerer) => answerer.number !== null)).toHaveLength(
        viewer === 'spectator' || viewer === 0 ? 0 : 1,
      )
    }
  })

  it('the reveal shows every number to everyone, spectators too', () => {
    const state = act(guessing(4, NUMBERS), extremes(3, 2), 0)
    for (const viewer of [0, 1, 2, 3, 'spectator'] as const) {
      expect(viewOf(state, viewer).answerers.map((answerer) => answerer.number)).toEqual([7, 2, 9])
    }
  })

  it('sends neither the topics used nor where the guesser role started', () => {
    const view = viewOf(start(4), 1)
    expect(Object.keys(view)).not.toContain('usedTopics')
    expect(Object.keys(view)).not.toContain('firstGuesser')
  })

  /**
   * The strongest check: change what `viewer` may not know (other seats' numbers, and before the
   * lock other seats' answers) and what they are sent must not change by a single byte. Run at every
   * position of many random games, for every viewer.
   */
  function hiddenFrom(
    state: SpectrumState,
    viewer: Viewer,
    rng: ReturnType<typeof createRng>,
  ): SpectrumState {
    if (state.phase === 'reveal' || state.phase === 'over') {
      return state // everything is shown: nothing to vary
    }
    return {
      ...state,
      answerers: state.answerers.map((answerer) => {
        if (answerer.seat === viewer) return answerer
        const text =
          state.phase === 'answering' && answerer.text !== null
            ? `另一個回答${rng.int(1000)}`
            : answerer.text
        return { ...answerer, number: 1 + rng.int(10), text }
      }),
    }
  }

  const wire = (state: SpectrumState, viewer: Viewer) =>
    JSON.stringify(projectGame(spectrum, state, viewer))

  it.each([4, 6, 11])(
    'no projection depends on what its viewer may not know, %i seats, many seeds',
    (seats) => {
      let compared = 0
      for (const options of [OPTIONS, { ...OPTIONS, mode: 'order' as const, duplicates: true }]) {
        for (let seed = 0; seed < 6; seed++) {
          const chooser = createRng(seed ^ 0x5eed)
          const vary = createRng(seed + 1000)
          let match = startMatch(spectrum, makeSeats(seats), options, seed)
          for (;;) {
            const viewers: Viewer[] = [
              ...match.state.players.map((player) => player.seat),
              'spectator',
            ]
            for (const viewer of viewers) {
              const other = hiddenFrom(match.state, viewer, vary)
              expect(wire(other, viewer), `${viewer} at ${match.state.phase}`).toBe(
                wire(match.state, viewer),
              )
              compared++
            }
            if (spectrum.isOver(match.state)) break
            const able = makeSeats(seats)
              .map((seat) => seat.id)
              .filter((seat) => spectrum.legalActions(match.state, seat).length > 0)
            const actor = chooser.pick(able)
            const next = applyAction(
              spectrum,
              match,
              chooser.pick(spectrum.legalActions(match.state, actor)),
              actor,
            )
            if (isGameError(next)) throw new Error(next.gameError)
            match = next
          }
        }
      }
      expect(compared).toBeGreaterThan(100)
    },
  )

  it('and the check is not blind: varying a number the viewer may see changes what they get', () => {
    const state = withNumbers({ ...start(4, {}, 3), ...rebuildAround(start(4, {}, 3), 0) }, NUMBERS)
    expect(wire(withNumbers(state, { 2: 5 }), 2)).not.toBe(wire(state, 2))
    expect(wire(withNumbers(state, { 2: 5 }), 1)).toBe(wire(state, 1))
  })
})

describe('whole games through the harness', () => {
  const VARIATIONS: SpectrumOptions[] = [
    OPTIONS,
    { ...OPTIONS, mode: 'order' },
    { ...OPTIONS, duplicates: true },
    { ...OPTIONS, twoRounds: true, clock: false },
  ]

  it.each([4, 5, 7, 11])('plays whole games with %i seats under every option', (seats) => {
    for (const options of VARIATIONS) {
      for (let seed = 1; seed <= 3; seed++) {
        const { result, final } = playRandom(spectrum, { seed, seats, options })
        expect(result.standings).toHaveLength(seats)
        expect(final.state.history).toHaveLength(final.state.totalRounds - 1)
      }
    }
  })
})
