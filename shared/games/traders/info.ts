// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'

/**
 * No options the waiting room shows: the points that end the game are a hidden option in rules.ts
 * (15 unless a room is made with another), which keeps this game's share of everyone's first load
 * small
 */
export const tradersInfo: GameInfo<Record<string, never>> = {
  id: 'traders',
  meta: {
    minPlayers: 2,
    maxPlayers: 4,
    minutes: 30,
    i18nKey: 'games.traders',
  },

  options: {},
}
