import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { MISERY_CARDS } from '../../shared/games/misery/bank.ts'
import { cardOf, fits, misery, stealersLeft } from '../../shared/games/misery/rules.ts'
import type { MiseryAction, MiseryCard, MiseryOptions, MiseryState } from '../../shared/games/misery/types.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// 慘度排排站 (working title Misery Line), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 60_000 })

const OPTIONS: MiseryOptions = { target: 10, startCards: 3, steals: true, clock: 60 }

const start = (seats: number, overrides: Partial<MiseryOptions> = {}, seed = 1) =>
  misery.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

function act(state: MiseryState, action: MiseryAction, actor: Actor): MiseryState {
  const next = misery.reduce(state, action, actor, createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: MiseryState, action: unknown, actor: Actor): string => {
  const answer = misery.reduce(state, action as MiseryAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.misery.error.${name}`
const lineOf = (state: MiseryState, seat: number) => state.lines.find((line) => line.seat === seat)?.cards ?? []
const card = (index: number, id = index): MiseryCard => ({ id, category: 'x', title: `t${id}`, index })

/** Every gap of `seat`'s line that is right, or wrong, for the card on the table */
function gaps(state: MiseryState, seat: number, right: boolean): number[] {
  const cards = lineOf(state, seat)
  const all = Array.from({ length: cards.length + 1 }, (_, gap) => gap)
  return all.filter((gap) => fits(cards, gap, state.current as MiseryCard) === right)
}

/** A state whose card on the table can be placed wrong by the guesser */
function withWrongGap(seats: number, overrides: Partial<MiseryOptions> = {}): MiseryState {
  for (let seed = 1; seed < 200; seed++) {
    const state = start(seats, overrides, seed)
    if (gaps(state, state.guesser, false).length > 0) return state
  }
  throw new Error('no state with a wrong gap')
}

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('misery')).toBe(misery)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('misery')
    expect(defaultOptions(misery.options)).toEqual(OPTIONS)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.misery.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.misery.ui.draw']).toBeTruthy()
    }
  })
})

describe('the deal', () => {
  it('gives every player their starting cards, in order, all different, and a card on the table', () => {
    for (const startCards of [1, 3, 5]) {
      const state = start(6, { startCards })
      const ids = state.lines.flatMap((line) => line.cards.map((c) => c.id))
      expect(new Set([...ids, state.current?.id]).size).toBe(6 * startCards + 1)
      for (const line of state.lines) {
        expect(line.cards).toHaveLength(startCards)
        const indexes = line.cards.map((c) => c.index)
        expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
      }
      expect(state.deck).toHaveLength(MISERY_CARDS.length - 6 * startCards - 1)
      expect(state).toMatchObject({ phase: 'guess', turnNo: 1 })
      expect(state.guesser).toBe(state.turn)
    }
  })

  it('reads its cards from the bank', () => {
    const state = start(3)
    const current = state.current as MiseryCard
    const [category, title, index] = MISERY_CARDS[current.id - 1]
    expect(current).toEqual({ id: current.id, category, title, index })
    expect(cardOf(1).title).toBe(MISERY_CARDS[0][1])
  })

  it('picks a random first player', () => {
    const firsts = new Set(Array.from({ length: 30 }, (_, seed) => start(4, {}, seed + 1).turn))
    expect(firsts.size).toBeGreaterThan(1)
  })
})

describe('where a card fits', () => {
  const line = [card(10), card(40), card(40, 41), card(80)]

  it('is between the indexes either side, the ends open', () => {
    expect(fits(line, 0, card(5))).toBe(true)
    expect(fits(line, 0, card(11))).toBe(false)
    expect(fits(line, 1, card(25))).toBe(true)
    expect(fits(line, 4, card(99))).toBe(true)
    expect(fits(line, 4, card(79))).toBe(false)
  })

  it('takes an equal index on either side of its twin', () => {
    expect(fits(line, 0, card(10, 2))).toBe(true)
    expect(fits(line, 1, card(10, 2))).toBe(true)
    expect(fits(line, 1, card(40, 3))).toBe(true)
    expect(fits(line, 2, card(40, 3))).toBe(true)
    expect(fits(line, 3, card(40, 3))).toBe(true)
    expect(fits(line, 4, card(40, 3))).toBe(false)
  })
})

describe('the view', () => {
  it('hides the index of the card on the table, and the deck, from everyone', () => {
    const state = start(4)
    for (const viewer of [0, 1, 2, 3, 'spectator'] as const) {
      const view = misery.view(state, viewer)
      expect(view.current).toEqual({ category: state.current?.category, title: state.current?.title })
      expect(view).not.toHaveProperty('deck')
      expect(view.deckLeft).toBe(state.deck.length)
      expect(JSON.stringify(view)).not.toContain(`"id":${state.current?.id},`)
      expect(view.you).toBe(viewer === 'spectator' ? null : viewer)
    }
  })

  it('shows every line, face up, to everyone', () => {
    const state = start(3)
    expect(misery.view(state, 'spectator').lines).toEqual(state.lines)
  })
})

describe('a placement', () => {
  it('keeps a right card, in its gap, and shows its index', () => {
    const state = start(4)
    const seat = state.guesser
    const gap = gaps(state, seat, true)[0]
    const next = act(state, { type: 'place', gap }, seat)
    expect(lineOf(next, seat)).toHaveLength(4)
    expect(lineOf(next, seat)[gap]).toEqual(state.current)
    expect(next.phase).toBe('reveal')
    expect(next.current).toBeNull()
    expect(next.last).toMatchObject({ keptBy: seat, card: state.current, turn: seat, turnNo: 1 })
    expect(next.last?.attempts).toHaveLength(1)
    expect(next.last?.attempts[0]).toMatchObject({ seat, gap, right: true })
  })

  it('on a wrong one, hands the card to the next player in seat order, index still hidden', () => {
    const state = withWrongGap(4)
    const seat = state.guesser
    const next = act(state, { type: 'place', gap: gaps(state, seat, false)[0] }, seat)
    expect(next.phase).toBe('guess')
    expect(next.guesser).toBe((seat + 1) % 4)
    expect(next.current).toEqual(state.current)
    expect(next.attempts).toHaveLength(1)
    expect(next.attempts[0].right).toBe(false)
    expect(misery.view(next, 'spectator').current).not.toHaveProperty('index')
    expect(misery.legalActions(next, seat)).toEqual([])
    expect(refusal(next, { type: 'place', gap: 0 }, seat)).toBe(error('notYourGuess'))
  })

  it('goes round the table once; nobody right throws the card away', () => {
    let state = withWrongGap(3)
    const turn = state.turn
    expect(stealersLeft(state)).toEqual([(turn + 1) % 3, (turn + 2) % 3])
    for (let tries = 0; tries < 3; tries++) {
      state = act(state, { type: 'timeUp' }, 'system')
    }
    expect(state.phase).toBe('reveal')
    expect(state.last?.keptBy).toBeNull()
    expect(state.last?.attempts.map((attempt) => attempt.seat)).toEqual([turn, (turn + 1) % 3, (turn + 2) % 3])
    expect(state.discarded).toBe(1)
  })

  it('lets a stealer keep the card in their own line', () => {
    let state = withWrongGap(2)
    const [turn, other] = [state.turn, 1 - state.turn]
    state = act(state, { type: 'place', gap: gaps(state, turn, false)[0] }, turn)
    expect(state.guesser).toBe(other)
    const right = gaps(state, other, true)[0]
    state = act(state, { type: 'place', gap: right }, other)
    expect(state.last?.keptBy).toBe(other)
    expect(lineOf(state, other)).toHaveLength(4)
    expect(lineOf(state, turn)).toHaveLength(3)
    // The turn goes on in seat order, whoever stole
    expect(misery.legalActions(state, other)).toEqual([{ type: 'next' }])
    state = act(state, { type: 'next' }, other)
    expect(state).toMatchObject({ phase: 'guess', turn: other, guesser: other, turnNo: 2 })
  })

  it('with steals off, throws a wrong card away at once', () => {
    const state = withWrongGap(4, { steals: false })
    const next = act(state, { type: 'place', gap: gaps(state, state.guesser, false)[0] }, state.guesser)
    expect(next.phase).toBe('reveal')
    expect(next.last?.keptBy).toBeNull()
    expect(stealersLeft(state)).toEqual([])
  })

  it('refuses a gap outside the line, and from anyone but the guesser', () => {
    const state = start(3)
    const other = (state.guesser + 1) % 3
    expect(refusal(state, { type: 'place', gap: 4 }, state.guesser)).toBe(error('badGap'))
    expect(refusal(state, { type: 'place', gap: -1 }, state.guesser)).toBe(error('badGap'))
    expect(refusal(state, { type: 'place', gap: 1.5 }, state.guesser)).toBe(error('badAction'))
    expect(refusal(state, { type: 'place', gap: 0 }, other)).toBe(error('notYourGuess'))
    expect(refusal(state, { type: 'next' }, other)).toBe(error('notReveal'))
    expect(refusal(state, { type: 'place', gap: 0 }, 9)).toBe(error('notAPlayer'))
  })
})

describe('the next card', () => {
  it('is drawn only by the next player in seat order', () => {
    const state = start(3)
    const shown = act(state, { type: 'place', gap: gaps(state, state.guesser, true)[0] }, state.guesser)
    const next = (state.turn + 1) % 3
    expect(misery.view(shown, 0).nextTurn).toBe(next)
    expect(refusal(shown, { type: 'next' }, state.turn)).toBe(error('notYourDraw'))
    expect(refusal(shown, { type: 'place', gap: 0 }, state.turn)).toBe(error('notGuess'))
    const drawn = act(shown, { type: 'next' }, next)
    expect(drawn.current?.id).toBe(state.deck[0])
    expect(drawn.deck).toHaveLength(state.deck.length - 1)
  })
})

describe('the end', () => {
  it('comes as soon as a line reaches the target', () => {
    let state = start(2, { target: 8, startCards: 5 })
    while (state.phase !== 'over') {
      if (state.phase === 'reveal') {
        state = act(state, { type: 'next' }, misery.view(state, 0).nextTurn)
        continue
      }
      const right = gaps(state, state.guesser, true)
      state = act(state, { type: 'place', gap: right[0] }, state.guesser)
    }
    const winner = state.last?.keptBy as number
    expect(lineOf(state, winner)).toHaveLength(8)
    for (const seat of state.players) expect(misery.legalActions(state, seat)).toEqual([])
    expect(refusal(state, { type: 'next' }, 0)).toBe(error('over'))
    const result = misery.result(state)
    expect(result.summary.key).toBe('games.misery.result.won')
    expect(result.standings[0]).toMatchObject({ seat: winner, rank: 1, score: 8 })
    expect(result.standings[1].rank).toBe(2)
  })

  it('comes when the deck runs out, the longest line first, ties shared', () => {
    const state = start(3)
    const shown = act({ ...state, deck: [] }, { type: 'timeUp' }, 'system')
    const passed = act(act(shown, { type: 'timeUp' }, 'system'), { type: 'timeUp' }, 'system')
    expect(passed.phase).toBe('reveal')
    const over = act(passed, { type: 'next' }, misery.view(passed, 0).nextTurn)
    expect(over).toMatchObject({ phase: 'over', deckOut: true })
    const result = misery.result(over)
    expect(result.summary).toMatchObject({ key: 'games.misery.result.deckTie', params: { winners: 3, cards: 3 } })
    expect(result.standings.map((standing) => standing.rank)).toEqual([1, 1, 1])
  })
})

describe('the clock and absent seats', () => {
  it('gives every try its own clock, and none with the clock off or at a reveal', () => {
    const state = withWrongGap(3)
    expect(misery.timers?.(state)).toEqual([{ id: 'guess-1-0', ms: 60_000, action: { type: 'timeUp' } }])
    const stolen = act(state, { type: 'place', gap: gaps(state, state.guesser, false)[0] }, state.guesser)
    expect(misery.timers?.(stolen)?.[0].id).toBe('guess-1-1')
    expect(misery.timers?.(start(3, { clock: 30 }))?.[0].ms).toBe(30_000)
    expect(misery.timers?.(start(3, { clock: 0 }))).toEqual([])
    const shown = act(state, { type: 'place', gap: gaps(state, state.guesser, true)[0] }, state.guesser)
    expect(misery.timers?.(shown)).toEqual([])
    expect(refusal(shown, { type: 'timeUp' }, 'system')).toBe(error('notGuess'))
  })

  it('skips an absent guesser as a miss, and draws for an absent next player', () => {
    const state = start(3)
    const other = (state.guesser + 1) % 3
    expect(misery.skipAction?.(state, state.guesser)).toEqual({ type: 'skip', seat: state.guesser })
    expect(misery.skipAction?.(state, other)).toBeNull()
    expect(refusal(state, { type: 'skip', seat: other }, 'system')).toBe(error('nothingToSkip'))
    const skipped = act(state, { type: 'skip', seat: state.guesser }, 'system')
    expect(skipped.guesser).toBe(other)
    expect(skipped.attempts[0]).toMatchObject({ seat: state.guesser, gap: null, right: false })
    const shown = act(state, { type: 'place', gap: gaps(state, state.guesser, true)[0] }, state.guesser)
    expect(misery.skipAction?.(shown, other)).toEqual({ type: 'skip', seat: other })
    expect(act(shown, { type: 'skip', seat: other }, 'system')).toMatchObject({ phase: 'guess', turn: other })
  })

  it('takes time and skips only from the room', () => {
    const state = start(3)
    expect(refusal(state, { type: 'timeUp' }, state.guesser)).toBe(error('systemOnly'))
    expect(refusal(state, { type: 'skip', seat: state.guesser }, state.guesser)).toBe(error('systemOnly'))
    expect(refusal(state, { type: 'place', gap: 0 }, 'system')).toBe(error('badAction'))
  })
})

describe('whole games through the harness', () => {
  it('plays to the end for 2 to 10 seats, with every option', () => {
    const options: MiseryOptions[] = [
      OPTIONS,
      { target: 8, startCards: 1, steals: false, clock: 0 },
      { target: 12, startCards: 5, steals: true, clock: 30 },
    ]
    for (const seats of [2, 3, 6, 10]) {
      for (const option of options) {
        for (let seed = 1; seed <= 3; seed++) {
          const { result } = playRandom(misery, {
            seed,
            seats,
            options: option,
            maxSteps: 5000,
            // The card on the table goes out without its index or its id
            secrets: (state) => (state.current === null ? [] : [`${state.current.id}:${state.current.index}`]),
          })
          expect(result.standings).toHaveLength(seats)
        }
      }
    }
  })
})
