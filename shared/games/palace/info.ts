// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { PalaceOptions } from './types.ts'

export const PALACE_DEFAULT_WINDOW = 15

export const palaceInfo: GameInfo<PalaceOptions> = {
  id: 'palace',
  // 2 to 6: the owner's numbers (2026-11-14). The bluffing is on the friends' own voice call
  meta: {
    minPlayers: 2,
    maxPlayers: 6,
    minutes: 15,
    i18nKey: 'games.palace',
  },

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
