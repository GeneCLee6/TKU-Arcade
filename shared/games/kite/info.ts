// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import { MAX_TURN_SECONDS } from './limits.ts'
import type { KiteOptions } from './types.ts'

export { handSize, MAX_BURNS, MAX_NOTES, MAX_TURN_SECONDS } from './limits.ts'

export const kiteInfo: GameInfo<KiteOptions> = {
  id: 'kite',

  options: {
    rainbow: { kind: 'boolean', labelKey: 'games.kite.option.rainbow', default: false },
    // A number, not a list of choices: four more labels in both languages cost the first load more
    turnSeconds: {
      kind: 'int',
      labelKey: 'games.kite.option.turnSeconds',
      min: 0,
      max: MAX_TURN_SECONDS,
      default: 0,
    },
  },
}
