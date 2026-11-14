// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { TilesOptions } from './types.ts'

export const TILES_DEFAULT_CLOCK = 90
export const TILES_MAX_ROUNDS = 5

export const tilesInfo: GameInfo<TilesOptions> = {
  id: 'tiles',
  // 2 to 4: the owner's numbers (2026-11-14), and what 106 tiles hold (14 each, a pool to draw from).
  // No `proxyTurns`: a turn is a decision
  meta: {
    minPlayers: 2,
    maxPlayers: 4,
    minutes: 30,
    i18nKey: 'games.tiles',
  },

  options: {
    clock: {
      kind: 'select',
      labelKey: 'games.tiles.option.clock',
      choices: [
        { value: 60, labelKey: 'games.tiles.option.clock.60' },
        { value: 90, labelKey: 'games.tiles.option.clock.90' },
        { value: 120, labelKey: 'games.tiles.option.clock.120' },
        { value: 0, labelKey: 'games.tiles.option.clock.off' },
      ],
      default: TILES_DEFAULT_CLOCK,
    },
    rounds: {
      kind: 'int',
      labelKey: 'games.tiles.option.rounds',
      min: 1,
      max: TILES_MAX_ROUNDS,
      default: 1,
    },
  },
}
