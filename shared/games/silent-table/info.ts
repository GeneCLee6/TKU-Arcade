// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { SilentTableOptions } from './types.ts'

export { COMMUNITY_BY_ROUND, ROUNDS } from './limits.ts'

export const silentTableInfo: GameInfo<SilentTableOptions> = {
  id: 'silent-table',

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
