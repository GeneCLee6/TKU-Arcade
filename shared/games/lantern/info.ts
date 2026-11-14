// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { LanternOptions } from './types.ts'

export const lanternInfo: GameInfo<LanternOptions> = {
  id: 'lantern',
  // 2 to 4 as the game is meant; 5 and 6 play a shorter table (owner's request 2026-11-14). No
  // `proxyTurns`: when to light a lantern is the whole game
  meta: {
    minPlayers: 2,
    maxPlayers: 6,
    minutes: 20,
    i18nKey: 'games.lantern',
  },

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
