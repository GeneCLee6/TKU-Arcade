// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'

/**
 * No options the waiting room shows: the points that end the game are a hidden option in rules.ts
 * (15 unless a room is made with another), which keeps this game's share of everyone's first load
 * small
 */
export const tradersInfo: GameInfo<Record<string, never>> = {
  id: 'traders',

  options: {},
}
