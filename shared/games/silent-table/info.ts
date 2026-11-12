// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { SilentTableOptions } from './types.ts'

/** How many shared cards are showing in round 1, 2 and 3 */
export const COMMUNITY_BY_ROUND: readonly number[] = [3, 4, 5]
export const ROUNDS = COMMUNITY_BY_ROUND.length

export const silentTableInfo: GameInfo<SilentTableOptions> = {
  id: 'silent-table',
  // Listed on the owner's request, 2026-11-12 (the IP-CHECKLIST.md signature lines are still the owner's).
  // No `proxyTurns`: a chip is a decision, and a random one could lose the level
  meta: {
    minPlayers: 3,
    maxPlayers: 6,
    minutes: 20,
    i18nKey: 'games.silent-table',
  },

  options: {
    levelsToWin: {
      kind: 'int',
      labelKey: 'games.silent-table.option.levelsToWin',
      min: 1,
      max: 7,
      default: 3,
    },
    failureLimit: {
      kind: 'int',
      labelKey: 'games.silent-table.option.failureLimit',
      min: 1,
      max: 5,
      default: 3,
    },
    allowTakeFromPlayers: {
      kind: 'boolean',
      labelKey: 'games.silent-table.option.allowTakeFromPlayers',
      default: true,
    },
    spectatorsSeeAll: {
      kind: 'boolean',
      labelKey: 'games.silent-table.option.spectatorsSeeAll',
      default: false,
    },
    roundSeconds: {
      kind: 'select',
      labelKey: 'games.silent-table.option.roundSeconds',
      choices: [
        { value: 0, labelKey: 'games.silent-table.option.roundSeconds.off' },
        { value: 60, labelKey: 'games.silent-table.option.roundSeconds.60' },
        { value: 90, labelKey: 'games.silent-table.option.roundSeconds.90' },
        { value: 120, labelKey: 'games.silent-table.option.roundSeconds.120' },
      ],
      default: 0,
    },
    skin: {
      kind: 'select',
      labelKey: 'games.silent-table.option.skin',
      choices: [
        { value: 'plain', labelKey: 'games.silent-table.option.skin.plain' },
        { value: 'diving', labelKey: 'games.silent-table.option.skin.diving' },
        { value: 'climbing', labelKey: 'games.silent-table.option.skin.climbing' },
      ],
      default: 'plain',
    },
  },
}
