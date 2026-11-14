// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { WasabiOptions } from './types.ts'

export const wasabiInfo: GameInfo<WasabiOptions> = {
  id: 'wasabi',
  // 3 to 6 (owner's brief 2026-11-14). No `proxyTurns`: every bid is a decision
  meta: {
    minPlayers: 3,
    maxPlayers: 6,
    minutes: 20,
    i18nKey: 'games.wasabi',
  },
  options: {
    goal: { kind: 'int', labelKey: 'games.wasabi.option.goal', min: 1, max: 3, default: 2 },
  },
}
