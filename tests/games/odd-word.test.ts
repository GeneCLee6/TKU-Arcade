import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { ODD_PAIRS } from '../../shared/games/odd-word/bank.ts'
import { oddWord, undercoverCount, wordOf } from '../../shared/games/odd-word/rules.ts'
import type { OddWordAction, OddWordOptions, OddWordState } from '../../shared/games/odd-word/types.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// 誰的詞不一樣 (working title Odd Word Out), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 60_000 })

const OPTIONS: OddWordOptions = { undercovers: 0, blank: false, rounds: 8 }

const start = (seats: number, overrides: Partial<OddWordOptions> = {}, seed = 1) =>
  oddWord.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

function act(state: OddWordState, action: OddWordAction, actor: Actor, seed = 7): OddWordState {
  const next = oddWord.reduce(state, action, actor, createRng(seed))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: OddWordState, action: unknown, actor: Actor): string => {
  const answer = oddWord.reduce(state, action as OddWordAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.odd-word.error.${name}`
const view = (viewer: number | 'spectator', state: OddWordState) => oddWord.view(state, viewer)
const notHost = (state: OddWordState) => state.players.find((seat) => seat !== state.host) as number

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('odd-word')).toBe(oddWord)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('odd-word')
    expect(defaultOptions(oddWord.options)).toEqual(OPTIONS)
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.odd-word.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.odd-word.ui.reveal']).toBeTruthy()
    }
  })
})

describe('how many get the other word', () => {
  it('is 1 up to 6 players and 2 from 7, unless the host chose', () => {
    expect([3, 4, 5, 6, 7, 12].map((players) => undercoverCount(players, 0))).toEqual([1, 1, 1, 1, 2, 2])
  })

  it('stays fewer than half the table, and at least one', () => {
    expect([3, 4, 5, 6, 7, 12].map((players) => undercoverCount(players, 3))).toEqual([1, 1, 2, 2, 3, 3])
    expect(undercoverCount(5, 2)).toBe(2)
    expect(undercoverCount(12, 1)).toBe(1)
  })
})

describe('the deal', () => {
  it('gives the common word to most seats and the other to the odd ones out', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = start(8, {}, seed)
      expect(state.undercover).toHaveLength(2)
      expect(state.pair.common).not.toBe(state.pair.odd)
      const row = ODD_PAIRS[state.pair.id - 1]
      expect([state.pair.common, state.pair.odd].sort()).toEqual([row[1], row[2]].sort())
      expect(state.pair.category).toBe(row[0])
      const words = state.players.map((seat) => wordOf(state, seat))
      expect(words.filter((word) => word === state.pair.odd)).toHaveLength(2)
      expect(words.filter((word) => word === state.pair.common)).toHaveLength(6)
    }
  })

  it('deals either word of a pair as the common one', () => {
    const swapped = new Set<boolean>()
    for (let seed = 1; seed <= 40; seed++) {
      const { pair } = start(4, {}, seed)
      swapped.add(ODD_PAIRS[pair.id - 1][1] === pair.odd)
    }
    expect(swapped).toEqual(new Set([true, false]))
  })

  it('leaves one of the odd ones out without a word when the blank is on', () => {
    const state = start(9, { blank: true, undercovers: 3 })
    expect(state.undercover).toHaveLength(3)
    expect(state.undercover).toContain(state.blank)
    expect(wordOf(state, state.blank as number)).toBeNull()
    expect(view(state.blank as number, state)).toMatchObject({ word: null, blankYou: true })
    expect(start(9).blank).toBeNull()
  })

  it('puts every seat in the speaking order once, round the table from the first speaker', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = start(6, {}, seed)
      expect([...state.order].sort()).toEqual(state.players)
      expect(state.host).toBe(state.order[0])
      const step = state.direction === 'clockwise' ? 1 : 5
      state.order.forEach((seat, index) => {
        if (index > 0) expect(seat).toBe((state.order[index - 1] + step) % 6)
      })
    }
  })

  it('draws a pair the room has not had, until every pair has come up', () => {
    let state = start(4, { rounds: 30 })
    const seen = new Set([state.pair.id])
    for (let round = 2; round <= 30; round++) {
      state = act(act(state, { type: 'reveal' }, state.host), { type: 'next' }, state.host, round)
      seen.add(state.pair.id)
    }
    expect(seen.size).toBe(30)
  })
})

describe('what each viewer sees', () => {
  const state = start(7, { undercovers: 2 })

  it('shows a seat its own word only, and never whether it is the odd one', () => {
    for (const seat of state.players) {
      const seen = view(seat, state)
      expect(seen.word).toBe(wordOf(state, seat))
      expect(seen.reveal).toBeNull()
      expect(seen.undercoverCount).toBe(2)
      const text = JSON.stringify(seen)
      const other = seen.word === state.pair.common ? state.pair.odd : state.pair.common
      expect(text).not.toContain(JSON.stringify(other))
      expect(text).not.toContain('"undercover"')
      expect(text).not.toContain('"pair"')
      expect(text).not.toContain('usedPairs')
    }
  })

  it('shows a spectator no word at all until the reveal', () => {
    const seen = view('spectator', state)
    expect(seen.word).toBeNull()
    expect(seen.you).toBeNull()
    expect(JSON.stringify(seen)).not.toContain(JSON.stringify(state.pair.common))
    expect(JSON.stringify(seen)).not.toContain(JSON.stringify(state.pair.odd))
  })

  it('shows everything to everyone at the reveal', () => {
    const shown = act(state, { type: 'reveal' }, state.host)
    expect(shown.phase).toBe('reveal')
    for (const viewer of [...state.players, 'spectator' as const]) {
      expect(view(viewer, shown).reveal).toEqual({ pair: state.pair, undercover: state.undercover, blank: null })
    }
  })

  it('gives only the round’s host anything to press', () => {
    expect(oddWord.legalActions(state, state.host)).toEqual([{ type: 'reveal' }, { type: 'redeal' }])
    expect(oddWord.legalActions(state, notHost(state))).toEqual([])
    const shown = act(state, { type: 'reveal' }, state.host)
    expect(oddWord.legalActions(shown, state.host)).toEqual([{ type: 'next' }, { type: 'end' }])
  })
})

describe('the round host’s buttons', () => {
  it('refuse anyone else, and the wrong phase', () => {
    const state = start(4)
    const other = notHost(state)
    for (const type of ['reveal', 'redeal', 'next', 'end'] as const) {
      expect(refusal(state, { type }, other)).toBe(error('notHost'))
    }
    expect(refusal(state, { type: 'next' }, state.host)).toBe(error('notReveal'))
    expect(refusal(state, { type: 'end' }, state.host)).toBe(error('notReveal'))
    const shown = act(state, { type: 'reveal' }, state.host)
    expect(refusal(shown, { type: 'reveal' }, state.host)).toBe(error('notWords'))
    expect(refusal(shown, { type: 'redeal' }, state.host)).toBe(error('notWords'))
    expect(refusal(state, { type: 'reveal' }, 9)).toBe(error('notAPlayer'))
    expect(refusal(state, { type: 'nope' }, state.host)).toBe(error('badAction'))
  })

  it('redeal a new pair to new odd ones out, keeping the speaking order', () => {
    const state = start(6)
    const again = act(state, { type: 'redeal' }, state.host)
    expect(again.phase).toBe('words')
    expect(again.pair.id).not.toBe(state.pair.id)
    expect(again.order).toEqual(state.order)
    expect(again.host).toBe(state.host)
    expect(again.redeals).toBe(1)
    expect(again.usedPairs).toEqual([state.pair.id, again.pair.id])
    expect(view(again.host, again).redeals).toBe(1)
  })

  it('start the next round with a new first speaker and keep the last one public', () => {
    let state = start(5)
    state = act(state, { type: 'reveal' }, state.host)
    const next = act(state, { type: 'next' }, state.host)
    expect(next).toMatchObject({ phase: 'words', round: 2, redeals: 0 })
    expect(next.host).toBe(next.order[0])
    expect(next.history).toEqual([{ round: 1, pair: state.pair, undercover: state.undercover, blank: null }])
  })
})

describe('the end', () => {
  it('comes with the last reveal', () => {
    let state = start(3, { rounds: 2 })
    state = act(act(state, { type: 'reveal' }, state.host), { type: 'next' }, state.host)
    state = act(state, { type: 'reveal' }, state.host)
    expect(state.phase).toBe('over')
    expect(oddWord.isOver(state)).toBe(true)
    expect(view('spectator', state).reveal).not.toBeNull()
    for (const seat of state.players) expect(oddWord.legalActions(state, seat)).toEqual([])
    expect(refusal(state, { type: 'next' }, state.host)).toBe(error('over'))
    const result = oddWord.result(state)
    expect(result.summary).toEqual({ key: 'games.odd-word.result.done', params: { rounds: 2 } })
    expect(result.standings.map((standing) => standing.rank)).toEqual([1, 1, 1])
    expect(result.standings.every((standing) => standing.score === null)).toBe(true)
    const times = result.standings.map((standing) => Number(standing.note.params?.times))
    expect(times.reduce((sum, value) => sum + value, 0)).toBe(2)
  })

  it('can be called by the round host after any reveal', () => {
    let state = start(4)
    state = act(act(state, { type: 'reveal' }, state.host), { type: 'end' }, state.host)
    expect(state).toMatchObject({ phase: 'over', endedEarly: true })
    expect(oddWord.result(state).summary).toEqual({ key: 'games.odd-word.result.ended', params: { rounds: 1 } })
  })
})

describe('covering for an absent seat', () => {
  it('is only for the round host', () => {
    const state = start(5)
    expect(oddWord.skipAction?.(state, state.host)).toEqual({ type: 'skip', seat: state.host })
    expect(oddWord.skipAction?.(state, notHost(state))).toBeNull()
    expect(refusal(state, { type: 'skip', seat: notHost(state) }, 'system')).toBe(error('nothingToSkip'))
  })

  it('hands the round to the next speaker before the reveal, and starts the next round after it', () => {
    const state = start(5)
    const handed = act(state, { type: 'skip', seat: state.host }, 'system')
    expect(handed.host).toBe(state.order[1])
    expect(handed.pair).toEqual(state.pair)
    expect(oddWord.legalActions(handed, state.order[1])).toEqual([{ type: 'reveal' }, { type: 'redeal' }])
    const shown = act(handed, { type: 'reveal' }, handed.host)
    const next = act(shown, { type: 'skip', seat: handed.host }, 'system')
    expect(next.round).toBe(2)
  })

  it('comes only from the room', () => {
    const state = start(4)
    expect(refusal(state, { type: 'skip', seat: state.host }, state.host)).toBe(error('systemOnly'))
    expect(refusal(state, { type: 'reveal' }, 'system')).toBe(error('badAction'))
  })
})

describe('chat', () => {
  it('is closed until the reveal, so nobody types their word', () => {
    const state = start(4)
    expect(oddWord.chatLocked?.(state)).toBe(true)
    expect(oddWord.chatLocked?.(act(state, { type: 'reveal' }, state.host))).toBe(false)
  })
})

describe('whole games through the harness', () => {
  it('plays to the end for 3 to 12 seats, with every option', () => {
    const options: OddWordOptions[] = [
      OPTIONS,
      { undercovers: 3, blank: true, rounds: 3 },
      { undercovers: 2, blank: false, rounds: 1 },
    ]
    for (const seats of [3, 4, 7, 12]) {
      for (const option of options) {
        for (let seed = 1; seed <= 4; seed++) {
          const { result } = playRandom(oddWord, {
            seed,
            seats,
            options: option,
            // A seat's view must hold no word but its own before the reveal
            secrets: (state, viewer) => {
              if (state.phase !== 'words') return []
              if (viewer === 'spectator') return [state.pair.common, state.pair.odd]
              const own = wordOf(state, viewer)
              return [own === state.pair.common ? state.pair.odd : state.pair.common]
            },
          })
          expect(result.standings).toHaveLength(seats)
        }
      }
    }
  })
})
