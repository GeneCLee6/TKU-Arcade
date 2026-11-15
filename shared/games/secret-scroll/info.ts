// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { ScrollOptions } from './types.ts'

export const secretScrollInfo: GameInfo<ScrollOptions> = {
  id: 'secret-scroll',

  options: {
    length: {
      kind: 'select',
      labelKey: 'games.secret-scroll.option.length',
      choices: [
        { value: 'standard', labelKey: 'games.secret-scroll.option.standard' },
        { value: 'short', labelKey: 'games.secret-scroll.option.short' },
      ],
      default: 'standard',
    },
    beggars: { kind: 'boolean', labelKey: 'games.secret-scroll.option.beggars', default: false },
  },
}
