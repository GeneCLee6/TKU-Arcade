// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { LanternOptions } from './types.ts'

export const lanternInfo: GameInfo<LanternOptions> = {
  id: 'lantern',

  options: {
    // 0 is one per player (at most 5), the usual difficulty; fewer is harder
    lives: { kind: 'int', labelKey: 'games.lantern.option.lives', min: 0, max: 5, default: 0 },
    levelTable: {
      kind: 'select',
      labelKey: 'games.lantern.option.levels',
      choices: [
        { value: 'standard', labelKey: 'games.lantern.option.levels.standard' },
        { value: 'short', labelKey: 'games.lantern.option.levels.short' },
        { value: 'taster', labelKey: 'games.lantern.option.levels.taster' },
      ],
      default: 'standard',
    },
  },
}
