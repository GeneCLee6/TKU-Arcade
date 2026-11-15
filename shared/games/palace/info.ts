// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { PalaceOptions } from './types.ts'

export const PALACE_DEFAULT_WINDOW = 15

export const palaceInfo: GameInfo<PalaceOptions> = {
  id: 'palace',

  options: {
    window: {
      kind: 'select',
      labelKey: 'games.palace.option.window',
      choices: [
        { value: 10, labelKey: 'games.palace.option.window.10' },
        { value: 15, labelKey: 'games.palace.option.window.15' },
        { value: 20, labelKey: 'games.palace.option.window.20' },
      ],
      default: PALACE_DEFAULT_WINDOW,
    },
  },
}
