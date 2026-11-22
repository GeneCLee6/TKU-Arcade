// 2026-11-21: the lobby's "Play the computer" (shared/games/quickBots.ts). Which games can open a
// room with computer players, how many the lobby asks for, and what POST /api/rooms takes.
import { describe, expect, it } from 'vitest'
import { getGame } from '../../shared/games/index.ts'
import { GAME_CARDS, LOBBY_GAMES } from '../../shared/games/lobby.ts'
import {
  parseQuickBots,
  QUICK_BOT_LEVEL,
  quickBotCount,
  quickBotLevel,
  quickBotRange,
} from '../../shared/games/quickBots.ts'
import { TABLE_BOT_NAMES } from '../../shared/games/tableBots.ts'

describe('quick games against the computer', () => {
  it('offer from enough for the fewest the game takes (at least one) to a full table', () => {
    expect(quickBotRange({ minPlayers: 1, maxPlayers: 2 })).toEqual({ min: 1, max: 1 })
    expect(quickBotRange({ minPlayers: 2, maxPlayers: 9 })).toEqual({ min: 1, max: 8 })
    expect(quickBotRange({ minPlayers: 4, maxPlayers: 11 }, 9)).toEqual({ min: 3, max: 9 })
    expect(quickBotCount('unknown', { minPlayers: 4, maxPlayers: 6 })).toBe(3)
  })

  it('first offer a lively table: hold’em five computers, never outside what the game takes', () => {
    expect(quickBotCount('holdem', getGame('holdem')!.meta)).toBe(5)
    for (const card of GAME_CARDS.filter((one) => one.meta.computer)) {
      const count = quickBotCount(card.id, card.meta)
      const range = quickBotRange(card.meta, TABLE_BOT_NAMES.length)
      expect(count, card.id).toBeGreaterThanOrEqual(range.min)
      expect(count, card.id).toBeLessThanOrEqual(range.max)
      expect(count, card.id).toBeGreaterThan(1)
    }
  })

  it('work for every listed game marked computer, at the default level, and for no other', () => {
    for (const card of GAME_CARDS) {
      const module = getGame(card.id)!
      const ask = { count: quickBotCount(card.id, card.meta), level: QUICK_BOT_LEVEL }
      expect(parseQuickBots(module, ask) !== null, card.id).toBe(card.meta.computer === true)
    }
    expect(LOBBY_GAMES.some((card) => card.meta.computer)).toBe(true)
  })

  it('take every level the game has, and every count from its fewest to its most', () => {
    for (const card of GAME_CARDS.filter((one) => one.meta.computer)) {
      const module = getGame(card.id)!
      for (const level of module.bots!.levels) {
        for (let count = 0; count <= card.meta.maxPlayers + 1; count++) {
          const fits = count >= 1 && count + 1 >= card.meta.minPlayers && count + 1 <= card.meta.maxPlayers
          expect(parseQuickBots(module, { count, level }) !== null, `${card.id} ${count}`).toBe(fits)
        }
      }
    }
  })

  it('refuse anything that is not a count and a level', () => {
    const holdem = getGame('holdem')!
    for (const raw of [null, 2, 'two', [], {}, { count: 1 }, { level: 'normal' }, { count: 1, level: 'hard' }]) {
      expect(parseQuickBots(holdem, raw), JSON.stringify(raw)).toBeNull()
    }
    expect(parseQuickBots(holdem, { count: 2, level: 'easy', extra: true })).toEqual({
      count: 2,
      level: 'easy',
    })
  })

  it('take one level per computer player, in seat order, and nothing else', () => {
    const holdem = getGame('holdem')!
    const mixed = { count: 3, level: 'normal', levels: ['easy', 'normal', 'easy'] }
    const bots = parseQuickBots(holdem, mixed)!
    expect(bots).toEqual(mixed)
    expect([0, 1, 2].map((index) => quickBotLevel(bots, index))).toEqual(['easy', 'normal', 'easy'])
    expect(quickBotLevel({ count: 2, level: 'easy' }, 1)).toBe('easy')
    for (const levels of [['easy'], ['easy', 'normal', 'hard'], 'easy', [1, 2, 3], null]) {
      expect(parseQuickBots(holdem, { count: 3, level: 'normal', levels }), JSON.stringify(levels)).toBeNull()
    }
    // A full table of eight computer players
    expect(parseQuickBots(holdem, { count: 8, level: 'easy' })).toEqual({ count: 8, level: 'easy' })
  })
})
