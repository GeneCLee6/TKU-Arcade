// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { CcOptions } from './types.ts'

/** Cards in a game, and so the best score */
export const CC_CARDS = 13

export const clueClashInfo: GameInfo<CcOptions> = {
  id: 'clue-clash',

  options: {
    clock: { kind: 'boolean', labelKey: 'games.clue-clash.option.clock', default: true },
  },
}
