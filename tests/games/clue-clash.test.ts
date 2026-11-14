import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { CC_WORDS } from '../../shared/games/clue-clash/bank.ts'
import { clashKey, clueProblem, isRight } from '../../shared/games/clue-clash/clue.ts'
import { clueClash, crossesNeeded, outcomeOf, tierOf } from '../../shared/games/clue-clash/rules.ts'
import type { CcAction, CcOptions, CcState } from '../../shared/games/clue-clash/types.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// 撞詞 (working title Clue Clash), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 120_000 })

const OPTIONS: CcOptions = { clock: true }

const start = (seats: number, seed = 1, options: CcOptions = OPTIONS) =>
  clueClash.init(makeSeats(seats), options, createRng(seed))

function act(state: CcState, action: CcAction, actor: Actor, seed = 7): CcState {
  const next = clueClash.reduce(state, action, actor, createRng(seed))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: CcState, action: unknown, actor: Actor): string => {
  const answer = clueClash.reduce(state, action as CcAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.clue-clash.error.${name}`
const giversOf = (state: CcState) => state.players.filter((seat) => seat !== state.guesser)

/** Every giver sends the clue from `clues` (by giver order); with three, each sends a pair */
function allClues(state: CcState, clues: string[][]): CcState {
  return giversOf(state).reduce((s, seat, index) => act(s, { type: 'clue', texts: clues[index] }, seat), state)
}

const allReady = (state: CcState) =>
  giversOf(state).reduce((s, seat) => (s.phase === 'review' ? act(s, { type: 'ready' }, seat) : s), state)

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('clue-clash')).toBe(clueClash)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('clue-clash')
    expect(defaultOptions(clueClash.options)).toEqual(OPTIONS)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.clue-clash.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.clue-clash.ui.guessButton']).toBeTruthy()
    }
  })
})

describe('comparing words', () => {
  it('clashes after folding width, case, punctuation and an English plural', () => {
    expect(clashKey('Cats!')).toBe(clashKey('cat'))
    expect(clashKey('ＢＯＸＥＳ')).toBe(clashKey('box'))
    expect(clashKey('berries')).toBe(clashKey('berry'))
    expect(clashKey('glass')).toBe('glass')
    expect(clashKey('貓 咪')).toBe(clashKey('貓咪'))
    expect(clashKey('貓')).not.toBe(clashKey('貓咪'))
  })

  it('refuses a clue that is or holds the word, or an answer that counts', () => {
    expect(clueProblem('珍奶', ['珍珠奶茶', '珍奶'])?.key).toBe(error('tooClose'))
    expect(clueProblem('奶茶', ['珍珠奶茶'])?.key).toBe(error('tooClose'))
    expect(clueProblem('飲料', ['珍珠奶茶'])).toBeNull()
    expect(clueProblem('two words', ['x'])?.key).toBe(error('oneWord'))
  })

  it('accepts the word or another name for it as the guess', () => {
    expect(isRight(' 珍奶 ', ['珍珠奶茶', '珍奶'])).toBe(true)
    expect(isRight('奶茶', ['珍珠奶茶', '珍奶'])).toBe(false)
  })
})

describe('a card', () => {
  it('rotates the guesser and gives the others the word; three players write two clues each', () => {
    const state = start(4)
    expect(state.perGiver).toBe(1)
    expect(start(3).perGiver).toBe(2)
    expect(clueClash.view(state, state.guesser).word).toBeNull()
    expect(clueClash.view(state, 'spectator').word).toBeNull()
    expect(clueClash.view(state, giversOf(state)[0]).word).toEqual(state.word)
  })

  it('hides each clue from the other givers and the guesser until the review', () => {
    let state = start(4)
    const [a, b] = giversOf(state)
    state = act(state, { type: 'clue', texts: ['飲料'] }, a)
    expect(clueClash.view(state, a).clues.find((clue) => clue.seat === a)?.text).toBe('飲料')
    expect(clueClash.view(state, b).clues.find((clue) => clue.seat === a)?.text).toBeNull()
    expect(clueClash.view(state, state.guesser).clues.find((clue) => clue.seat === a)).toMatchObject({ text: null, status: 'sent' })
  })

  it('cancels exact clashes, lets the givers cross out more, and shows the guesser only the rest', () => {
    let state = start(5, 2)
    state = allClues(state, [['kiwi'], ['Kiwi'], ['oasis'], ['zebra']])
    expect(state.phase).toBe('review')
    expect(state.clues.map((clue) => clue.clash)).toEqual([true, true, false, false])
    // A guesser sees nothing during the review
    expect(clueClash.view(state, state.guesser).clues.every((clue) => clue.text === null)).toBe(true)
    const givers = giversOf(state)
    expect(crossesNeeded(4)).toBe(2)
    state = act(state, { type: 'flag', index: 2, on: true }, givers[0])
    expect(refusal(state, { type: 'flag', index: 2, on: true }, givers[0])).toBe(error('same'))
    expect(refusal(state, { type: 'flag', index: 0, on: true }, givers[0])).toBe(error('badIndex'))
    state = act(state, { type: 'flag', index: 2, on: true }, givers[1])
    state = allReady(state)
    expect(state.phase).toBe('guess')
    expect(state.clues.map((clue) => clue.cancelled)).toEqual([true, true, true, false])
    const seen = clueClash.view(state, state.guesser).clues
    expect(seen.map((clue) => clue.text)).toEqual([null, null, null, 'zebra'])
  })

  it('skips the review when nothing is left to cross out', () => {
    const state = allClues(start(4), [['kiwi'], ['kiwi'], ['KIWI']])
    expect(state.phase).toBe('guess')
  })

  it('refuses a clue from the guesser, two equal clues from one giver, and the word itself', () => {
    const state = start(3)
    const [giver] = giversOf(state)
    expect(refusal(state, { type: 'clue', texts: ['kiwi', 'kiwi'] }, state.guesser)).toBe(error('guesserClues'))
    expect(refusal(state, { type: 'clue', texts: ['kiwi', 'Kiwis'] }, giver)).toBe(error('twice'))
    expect(refusal(state, { type: 'clue', texts: ['kiwi'] }, giver)).toBe(error('count'))
    expect(refusal(state, { type: 'clue', texts: ['kiwi', state.word.word] }, giver)).toBe(error('tooClose'))
  })

  it('lets a giver redraw the word once', () => {
    let state = start(4)
    const [giver] = giversOf(state)
    state = act(state, { type: 'clue', texts: ['kiwi'] }, giver)
    const before = state.word
    state = act(state, { type: 'redraw' }, giver)
    expect(state.word).not.toEqual(before)
    expect(state.clues.every((clue) => clue.text === null)).toBe(true)
    expect(refusal(state, { type: 'redraw' }, giver)).toBe(error('redrawn'))
  })
})

describe('scoring', () => {
  const toGuess = (seed = 1) => allReady(allClues(start(4, seed), [['kiwi'], ['oasis'], ['zebra']]))

  it('scores a right guess', () => {
    let state = toGuess()
    state = act(state, { type: 'guess', text: state.word.word }, state.guesser)
    expect(state.phase).toBe('reveal')
    expect(outcomeOf(state)).toBe('right')
    const next = act(state, { type: 'next' }, state.guesser)
    expect(next.score).toBe(1)
    expect(next.cardsUsed).toBe(2)
    expect(next.guesser).not.toBe(state.guesser)
  })

  it('loses only this card on a pass', () => {
    let state = toGuess()
    state = act(act(state, { type: 'pass' }, state.guesser), { type: 'next' }, state.guesser)
    expect(state.score).toBe(0)
    expect(state.cardsUsed).toBe(2)
  })

  it('loses this card and the next on a wrong guess, unless the givers count it as right', () => {
    let state = toGuess()
    state = act(state, { type: 'guess', text: 'kiwi' }, state.guesser)
    expect(outcomeOf(state)).toBe('wrong')
    const wrong = act(state, { type: 'next' }, state.guesser)
    expect(wrong.cardsUsed).toBe(3)
    expect(wrong.history.map((card) => card.outcome)).toEqual(['wrong', 'lost'])
    expect(refusal(state, { type: 'accept' }, state.guesser)).toBe(error('notGiver'))
    const accepted = act(act(state, { type: 'accept' }, giversOf(state)[0]), { type: 'next' }, state.guesser)
    expect(accepted.score).toBe(1)
    expect(accepted.cardsUsed).toBe(2)
  })

  it('takes a point off for a wrong guess on the last card, and ends after 13 cards', () => {
    let state = start(4, 3)
    while (state.phase !== 'over') {
      state = allReady(allClues(state, [['kiwi'], ['oasis'], ['zebra']]))
      const last = state.cardsUsed === state.totalCards
      state = act(state, { type: 'guess', text: last ? 'kiwi' : state.word.word }, state.guesser)
      state = act(state, { type: 'next' }, state.guesser)
    }
    expect(state.score).toBe(11)
    expect(state.penalty).toBe(1)
    expect(state.history).toHaveLength(13)
    const result = clueClash.result(state)
    expect(result.summary.key).toBe('games.clue-clash.result.great')
    expect(result.standings.every((line) => line.rank === 1 && line.score === 11)).toBe(true)
  })

  it('names a verdict for every score', () => {
    expect([13, 12, 10, 8, 5, 2].map(tierOf)).toEqual(['perfect', 'great', 'good', 'fair', 'warm', 'cold'])
  })
})

describe('the clock and the room', () => {
  it('locks the clues, settles the review and passes the guess when time runs out', () => {
    let state = start(4)
    state = act(state, { type: 'clue', texts: ['kiwi'] }, giversOf(state)[0])
    expect(clueClash.timers?.(state)[0].id).toBe('clues-1-a')
    state = act(state, { type: 'timeUp' }, 'system')
    expect(state.phase).toBe('review')
    expect(state.clues.filter((clue) => clue.none)).toHaveLength(2)
    state = act(state, { type: 'timeUp' }, 'system')
    expect(state.phase).toBe('guess')
    state = act(state, { type: 'timeUp' }, 'system')
    expect(state.guess).toEqual({ kind: 'time' })
    expect(clueClash.timers?.(start(4, 1, { clock: false }))).toEqual([])
  })

  it('skips an absent giver who has not written, and an absent guesser', () => {
    const state = start(4)
    const [a] = giversOf(state)
    expect(clueClash.skipAction?.(state, a)).toEqual({ type: 'skip', seat: a })
    expect(clueClash.skipAction?.(state, state.guesser)).toBeNull()
    const skipped = act(state, { type: 'skip', seat: a }, 'system')
    expect(skipped.clues.find((clue) => clue.seat === a)?.none).toBe(true)
    const guessing = allClues(start(4), [['kiwi'], ['kiwi'], ['kiwi']])
    expect(act(guessing, { type: 'skip', seat: guessing.guesser }, 'system').guess).toEqual({ kind: 'time' })
  })
})

describe('random games', () => {
  it.each([3, 4, 5, 7])('play to the end with %i seats, and never show the guesser the word', (seats) => {
    for (let seed = 1; seed <= 4; seed++) {
      for (const clock of [true, false]) {
        const { result } = playRandom(clueClash, {
          seed,
          seats,
          options: { clock },
          secrets: (state, viewer) => {
            if (state.phase === 'reveal' || state.phase === 'over') return []
            if (viewer === 'spectator' || viewer === state.guesser) return [state.word.word]
            return []
          },
        })
        expect(result.standings).toHaveLength(seats)
      }
    }
  })

  it('draws from a bank of 400 or more', () => {
    expect(CC_WORDS.length).toBeGreaterThanOrEqual(400)
  })
})
