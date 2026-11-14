import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import {
  lantern,
  LEVEL_TABLES,
  levelsFor,
  MAX_LIVES,
  MAX_MOONS,
  REWARDS,
  startingLives,
} from '../../shared/games/lantern/rules.ts'
import type { LanternAction, LanternOptions, LanternState } from '../../shared/games/lantern/types.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// 宮燈點點 (working title Lantern Lane), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 60_000 })

const OPTIONS: LanternOptions = { lives: 0, levelTable: 'standard' }

const start = (seats: number, overrides: Partial<LanternOptions> = {}, seed = 1) =>
  lantern.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

function act(state: LanternState, action: LanternAction, actor: Actor, seed = 7): LanternState {
  const next = lantern.reduce(state, action, actor, createRng(seed))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: LanternState, action: unknown, actor: Actor): string => {
  const answer = lantern.reduce(state, action as LanternAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.lantern.error.${name}`

/** Every hand up: the level is on */
const allReady = (state: LanternState): LanternState =>
  state.players.reduce((next, player) => act(next, { type: 'ready' }, player.seat), state)

/** A state with these hands, in play (cards sorted for you) */
function withHands(state: LanternState, hands: number[][], extra: Partial<LanternState> = {}): LanternState {
  return {
    ...state,
    phase: 'play',
    players: state.players.map((player, index) => ({
      ...player,
      hand: [...hands[index]].sort((a, b) => a - b),
      ready: true,
    })),
    ...extra,
  }
}

/** Plays a level perfectly: always the lowest lantern at the table */
function clearLevel(state: LanternState): LanternState {
  let next = state.phase === 'focus' ? allReady(state) : state
  const level = next.level
  while (next.phase === 'play' && next.level === level) {
    const holder = next.players
      .filter((player) => player.hand.length > 0)
      .sort((a, b) => a.hand[0] - b.hand[0])[0]
    next = act(next, { type: 'light', card: holder.hand[0] }, holder.seat)
  }
  return next
}

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('lantern')).toBe(lantern)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('lantern')
    expect(defaultOptions(lantern.options)).toEqual(OPTIONS)
    expect(lantern.meta).toMatchObject({ minPlayers: 2, maxPlayers: 6 })
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.lantern.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.lantern.ui.light']).toBeTruthy()
    }
  })
})

describe('the setup', () => {
  it('has 12 levels for 2 players, 10 for 3, 8 for 4, and shorter tables for 5 and 6', () => {
    expect([2, 3, 4, 5, 6].map((players) => levelsFor('standard', players))).toEqual([12, 10, 8, 7, 6])
    expect([2, 3, 4, 5, 6].map((players) => levelsFor('short', players))).toEqual([8, 7, 6, 5, 4])
    expect([2, 3, 4, 5, 6].map((players) => levelsFor('taster', players))).toEqual([3, 3, 3, 3, 3])
    expect(start(3).totalLevels).toBe(10)
    expect(start(4, { levelTable: 'short' }).totalLevels).toBe(6)
  })

  it('never needs more than 100 lanterns', () => {
    for (const table of Object.values(LEVEL_TABLES)) {
      for (const [players, levels] of Object.entries(table)) expect(Number(players) * levels).toBeLessThanOrEqual(100)
    }
  })

  it('starts with one match per player (at most 5) unless the host chose, and one moonlight', () => {
    expect([2, 3, 4, 5, 6].map((players) => startingLives(0, players))).toEqual([2, 3, 4, 5, 5])
    expect(startingLives(1, 4)).toBe(1)
    expect(startingLives(9, 2)).toBe(MAX_LIVES)
    const state = start(3, { lives: 2 })
    expect(state).toMatchObject({ lives: 2, startLives: 2, moons: 1, level: 1, phase: 'focus' })
  })

  it('deals level n as n different lanterns from 1 to 100 to each player, lowest first', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = start(4, {}, seed)
      for (const player of state.players) expect(player.hand).toHaveLength(1)
      let next = clearLevel(clearLevel(state))
      expect(next.level).toBe(3)
      const all = next.players.flatMap((player) => player.hand)
      expect(new Set(all).size).toBe(12)
      for (const player of next.players) {
        expect(player.hand).toHaveLength(3)
        expect(player.hand).toEqual([...player.hand].sort((a, b) => a - b))
        for (const card of player.hand) expect(card >= 1 && card <= 100).toBe(true)
      }
      next = clearLevel(next)
      expect(next.players.every((player) => player.hand.length === 4)).toBe(true)
    }
  })
})

describe('the focus', () => {
  it('starts the level once every hand is up, and not before', () => {
    let state = start(3)
    expect(refusal(state, { type: 'light', card: state.players[0].hand[0] }, 0)).toBe(error('notPlaying'))
    state = act(state, { type: 'ready' }, 0)
    expect(refusal(state, { type: 'ready' }, 0)).toBe(error('alreadyReady'))
    state = act(state, { type: 'ready' }, 1)
    expect(state.phase).toBe('focus')
    state = act(state, { type: 'ready' }, 2)
    expect(state.phase).toBe('play')
    expect(refusal(state, { type: 'ready' }, 0)).toBe(error('notFocus'))
  })
})

describe('lighting', () => {
  it('puts lanterns in order on the avenue, and clears the level when the hands are empty', () => {
    let state = withHands(start(2), [[10], [20]])
    state = act(state, { type: 'light', card: 10 }, 0)
    expect(state.pile).toEqual([{ card: 10, seat: 0, how: 'lit' }])
    expect(state.lives).toBe(2)
    state = act(state, { type: 'light', card: 20 }, 1)
    expect(state.level).toBe(2)
    expect(state.phase).toBe('focus')
    expect(state.pile).toEqual([])
    expect(state.news).toEqual([{ kind: 'cleared', level: 1, reward: null, capped: false }])
    expect(state.players.map((player) => player.lit)).toEqual([1, 1])
  })

  it('takes only your lowest lantern, and refuses one that is already gone', () => {
    const state = withHands(start(2), [[10, 40], [20, 30]])
    expect(refusal(state, { type: 'light', card: 40 }, 0)).toBe(error('notLowest'))
    expect(refusal(state, { type: 'light', card: 20 }, 0)).toBe(error('gone'))
    expect(refusal(state, { type: 'light', card: 1.5 }, 0)).toBe(error('badAction'))
  })

  it('costs a match when too early, and burns every lower lantern in every hand', () => {
    let state = withHands(start(3), [[5, 50], [7, 30, 60], [20, 70]])
    state = act(state, { type: 'light', card: 20 }, 2)
    expect(state.lives).toBe(2)
    expect(state.players.map((player) => player.hand)).toEqual([[50], [30, 60], [70]])
    expect(state.pile).toEqual([
      { card: 5, seat: 0, how: 'burned' },
      { card: 7, seat: 1, how: 'burned' },
      { card: 20, seat: 2, how: 'early' },
    ])
    expect(state.news).toEqual([
      {
        kind: 'early',
        seat: 2,
        card: 20,
        burned: [
          { seat: 0, card: 5 },
          { seat: 1, card: 7 },
        ],
      },
    ])
    expect(state.players[2]).toMatchObject({ lit: 0, early: 1 })
    // Play goes on
    state = act(state, { type: 'light', card: 30 }, 1)
    expect(state.pile.at(-1)).toEqual({ card: 30, seat: 1, how: 'lit' })
  })

  it('keeps the avenue in rising order whatever happens', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { final } = playRandom(lantern, { seed, seats: 3 })
      expect(final.state.phase).toBe('over')
    }
    let state = withHands(start(2), [[3, 9, 40], [15, 50, 60]])
    state = act(state, { type: 'light', card: 15 }, 1)
    state = act(state, { type: 'light', card: 40 }, 0)
    const cards = state.pile.map((entry) => entry.card)
    expect(cards).toEqual([...cards].sort((a, b) => a - b))
  })

  it('ends the night when the last match is gone, even with the hands empty', () => {
    const state = act(withHands(start(2, { lives: 1 }), [[5], [9]]), { type: 'light', card: 9 }, 1)
    expect(state).toMatchObject({ phase: 'over', ending: 'lost', lives: 0 })
    expect(lantern.isOver(state)).toBe(true)
    expect(lantern.result(state).summary).toEqual({ key: 'games.lantern.result.lost', params: { level: 1, levels: 12 } })
    expect(refusal(state, { type: 'ready' }, 0)).toBe(error('over'))
  })

  it('takes two players lighting at once in the order the room got them', () => {
    const state = withHands(start(2), [[30, 80], [31, 90]])
    const first = act(state, { type: 'light', card: 31 }, 1)
    expect(first.lives).toBe(1)
    // The other tap arrives after its lantern burned
    expect(refusal(first, { type: 'light', card: 30 }, 0)).toBe(error('gone'))
  })
})

describe('moonlight', () => {
  it('needs every player, shows each lowest lantern and uses one', () => {
    let state = withHands(start(3), [[4, 40], [12, 50], [33]])
    state = act(state, { type: 'moon', on: true }, 0)
    state = act(state, { type: 'moon', on: true }, 1)
    expect(state.moons).toBe(1)
    expect(refusal(state, { type: 'moon', on: true }, 1)).toBe(error('sameVote'))
    state = act(state, { type: 'moon', on: false }, 1)
    state = act(state, { type: 'moon', on: true }, 2)
    expect(state.moons).toBe(1)
    state = act(state, { type: 'moon', on: true }, 1)
    expect(state.moons).toBe(0)
    expect(state.players.map((player) => player.hand)).toEqual([[40], [50], []])
    expect(state.players.every((player) => !player.moonVote)).toBe(true)
    expect(state.pile.map((entry) => [entry.card, entry.how])).toEqual([
      [4, 'moon'],
      [12, 'moon'],
      [33, 'moon'],
    ])
    expect(state.news).toEqual([
      {
        kind: 'moon',
        shown: [
          { seat: 0, card: 4 },
          { seat: 1, card: 12 },
          { seat: 2, card: 33 },
        ],
      },
    ])
    expect(state.lives).toBe(3)
    expect(refusal(state, { type: 'moon', on: true }, 0)).toBe(error('noMoon'))
    expect(lantern.legalActions(state, 0)).toEqual([{ type: 'light', card: 40 }])
  })

  it('can clear the level by itself', () => {
    let state = withHands(start(2), [[4], [12]])
    state = act(act(state, { type: 'moon', on: true }, 0), { type: 'moon', on: true }, 1)
    expect(state.level).toBe(2)
    expect(state.news.map((item) => item.kind)).toEqual(['moon', 'cleared'])
  })
})

describe('rewards', () => {
  it('gives moonlight after levels 2, 5 and 8 and a match after 3, 6 and 9', () => {
    expect(REWARDS).toEqual({ 2: 'moon', 3: 'life', 5: 'moon', 6: 'life', 8: 'moon', 9: 'life' })
    let state = start(2, { lives: 2 })
    state = clearLevel(state)
    expect(state).toMatchObject({ level: 2, lives: 2, moons: 1 })
    state = clearLevel(state)
    expect(state).toMatchObject({ level: 3, lives: 2, moons: 2 })
    expect(state.news).toEqual([{ kind: 'cleared', level: 2, reward: 'moon', capped: false }])
    state = clearLevel(state)
    expect(state).toMatchObject({ level: 4, lives: 3, moons: 2 })
  })

  it('stops at 5 matches and 3 moonlight', () => {
    let state = { ...start(2, { lives: 5 }), moons: MAX_MOONS }
    state = clearLevel(clearLevel(state))
    expect(state.moons).toBe(MAX_MOONS)
    expect(state.news).toEqual([{ kind: 'cleared', level: 2, reward: 'moon', capped: true }])
    state = clearLevel(state)
    expect(state.lives).toBe(MAX_LIVES)
  })

  it('wins the game by clearing the last level, with no reward after it', () => {
    let state = start(4, { levelTable: 'taster' })
    for (let level = 1; level <= 3; level++) state = clearLevel(state)
    expect(state).toMatchObject({ phase: 'over', ending: 'won', level: 3 })
    const result = lantern.result(state)
    expect(result.summary).toEqual({ key: 'games.lantern.result.won', params: { level: 3, levels: 3 } })
    expect(result.standings.map((standing) => standing.rank)).toEqual([1, 1, 1, 1])
    expect(result.standings[0].note.key).toBe('games.lantern.note')
    expect(lantern.legalActions(state, 0)).toEqual([])
  })

  it('wins a full standard game played perfectly, for every number of players', () => {
    for (let players = 2; players <= 6; players++) {
      let state = start(players, {}, players)
      while (state.phase !== 'over') state = clearLevel(state)
      expect(state.ending).toBe('won')
      expect(state.level).toBe(levelsFor('standard', players))
    }
  })
})

describe('what each viewer sees', () => {
  const state = withHands(start(3), [[4, 40], [12, 50], [33, 90]])

  it('gives a seat its own lanterns and only counts of the others', () => {
    const view = lantern.view(state, 1)
    expect(view.hand).toEqual([12, 50])
    expect(view.players.map((player) => player.count)).toEqual([2, 2, 2])
    for (const card of [4, 40, 33, 90]) expect(JSON.stringify(view.players)).not.toContain(`${card}`)
    expect(view.players[0]).not.toHaveProperty('hand')
    expect(view.leftover).toBeNull()
    expect(view.you).toBe(1)
  })

  it('gives a spectator no lanterns at all', () => {
    const view = lantern.view(state, 'spectator')
    expect(view.hand).toBeNull()
    expect(view.you).toBeNull()
    for (const card of [4, 40, 12, 50, 33, 90]) expect(JSON.stringify(view.players)).not.toContain(`${card}`)
  })

  it('shows what was left once the night is over', () => {
    const over = act(withHands(start(2, { lives: 1 }), [[5, 60], [9, 70]]), { type: 'light', card: 9 }, 1)
    expect(lantern.view(over, 'spectator').leftover).toEqual([
      { seat: 0, cards: [60] },
      { seat: 1, cards: [70] },
    ])
  })

  it('says what clearing this level earns', () => {
    expect(lantern.view(start(2), 0).reward).toBeNull()
    expect(lantern.view({ ...start(2), level: 3 }, 0).reward).toBe('life')
    expect(lantern.view({ ...start(2, { levelTable: 'taster' }), level: 3 }, 0).reward).toBeNull()
  })

  it('lists only your lowest lantern and the moonlight vote', () => {
    expect(lantern.legalActions(state, 0)).toEqual([
      { type: 'light', card: 4 },
      { type: 'moon', on: true },
    ])
    expect(lantern.legalActions(start(3), 0)).toEqual([{ type: 'ready' }])
    expect(lantern.legalActions(state, 9)).toEqual([])
  })

  it('keeps the chat closed until the game is over', () => {
    expect(lantern.chatLocked?.(start(2))).toBe(true)
    expect(lantern.chatLocked?.(state)).toBe(true)
    expect(lantern.chatLocked?.({ ...state, phase: 'over' })).toBe(false)
  })
})

describe('an absent player', () => {
  it('raises their hand in the focus', () => {
    const state = act(start(2), { type: 'skip', seat: 1 }, 'system')
    expect(state.players[1].ready).toBe(true)
    expect(lantern.skipAction?.(state, 1)).toBeNull()
    expect(refusal(state, { type: 'skip', seat: 1 }, 'system')).toBe(error('nothingToSkip'))
  })

  it('lights their lowest lantern in play, or completes a moonlight everyone else wants', () => {
    let state = withHands(start(3), [[4, 40], [12, 50], [33]])
    let next = act(state, { type: 'skip', seat: 1 }, 'system')
    expect(next.players[1].hand).toEqual([50])
    expect(next.lives).toBe(2)
    state = act(act(state, { type: 'moon', on: true }, 0), { type: 'moon', on: true }, 2)
    next = act(state, { type: 'skip', seat: 1 }, 'system')
    expect(next.moons).toBe(0)
    expect(next.players[1].hand).toEqual([50])
  })

  it('votes for moonlight once their hand is empty, and is not waited for after that', () => {
    const state = withHands(start(2), [[], [12, 50]])
    expect(lantern.skipAction?.(state, 0)).toEqual({ type: 'skip', seat: 0 })
    const next = act(state, { type: 'skip', seat: 0 }, 'system')
    expect(next.players[0].moonVote).toBe(true)
    expect(lantern.skipAction?.(next, 0)).toBeNull()
  })

  it('is skipped only by the room', () => {
    const state = withHands(start(2), [[4], [12]])
    expect(refusal(state, { type: 'skip', seat: 1 }, 0)).toBe(error('systemOnly'))
    expect(refusal(state, { type: 'skip', seat: 7 }, 'system')).toBe(error('notAPlayer'))
    expect(refusal(state, { type: 'ready' }, 'system')).toBe(error('badAction'))
  })
})

describe('random games', () => {
  for (const seats of [2, 3, 4, 5, 6]) {
    for (const options of [OPTIONS, { lives: 5, levelTable: 'short' }, { lives: 1, levelTable: 'taster' }] as LanternOptions[]) {
      it(`play to the end with ${seats} seats, ${JSON.stringify(options)}, and hide every hand`, () => {
        for (let seed = 1; seed <= 4; seed++) {
          const { result } = playRandom(lantern, {
            seed,
            seats,
            options,
            // Another seat's lanterns never reach a viewer while the game is on. Numbers above 12
            // only, and none that a public tally holds right now, so that a level, a count, a seat
            // or a tally cannot be taken for one
            secrets: (state, viewer) => {
              if (state.phase === 'over') return []
              // Last level's news can show a number that this level dealt again
              const lastLevel = state.news.flatMap((item) =>
                item.kind === 'early' ? [item.card, ...item.burned.map((entry) => entry.card)] : item.kind === 'moon' ? item.shown.map((entry) => entry.card) : [],
              )
              const tallies = new Set([
                state.newsId,
                ...lastLevel,
                ...state.players.flatMap((player) => [player.lit, player.early]),
              ])
              return state.players
                .filter((player) => player.seat !== viewer)
                .flatMap((player) => player.hand)
                .filter((card) => card > 12 && !tallies.has(card))
            },
          })
          expect(result.standings).toHaveLength(seats)
        }
      })
    }
  }
})
