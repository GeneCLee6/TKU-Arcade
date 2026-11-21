// 2026-11-21: the lobby's "Play the computer" (shared/games/quickBots.ts). Which games can open a
// room with computer players, how many the lobby asks for, and what POST /api/rooms takes.
import { describe, expect, it } from 'vitest'
import { getGame } from '../../shared/games/index.ts'
import { GAME_CARDS, LOBBY_GAMES } from '../../shared/games/lobby.ts'
import { parseQuickBots, QUICK_BOT_LEVEL, quickBotCount } from '../../shared/games/quickBots.ts'

describe('quick games against the computer', () => {
  it('ask for enough computer players for the fewest the game takes, and at least one', () => {
    expect(quickBotCount({ minPlayers: 1 })).toBe(1)
    expect(quickBotCount({ minPlayers: 2 })).toBe(1)
    expect(quickBotCount({ minPlayers: 4 })).toBe(3)
  })

  it('work for every listed game marked computer, at the default level, and for no other', () => {
    for (const card of GAME_CARDS) {
      const module = getGame(card.id)!
      const ask = { count: quickBotCount(card.meta), level: QUICK_BOT_LEVEL }
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
})
