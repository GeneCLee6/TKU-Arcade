// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { WasabiOptions } from './types.ts'

export const wasabiInfo: GameInfo<WasabiOptions> = {
  id: 'wasabi',
  options: {
    goal: { kind: 'int', labelKey: 'games.wasabi.option.goal', min: 1, max: 3, default: 2 },
  },
}
