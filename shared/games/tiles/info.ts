// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { TilesOptions } from './types.ts'

export const TILES_DEFAULT_CLOCK = 90
export const TILES_MAX_ROUNDS = 5

export const tilesInfo: GameInfo<TilesOptions> = {
  id: 'tiles',

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
