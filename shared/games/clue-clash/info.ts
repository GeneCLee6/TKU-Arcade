// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { CcOptions } from './types.ts'

/** Cards in a game, and so the best score */
export const CC_CARDS = 13

export const clueClashInfo: GameInfo<CcOptions> = {
  id: 'clue-clash',
  // 3 to 7 (owner's numbers, 2026-11-14). No `proxyTurns`: a clue has to come from a person
  meta: {
    minPlayers: 3,
    maxPlayers: 7,
    minutes: 20,
    i18nKey: 'games.clue-clash',
  },

  options: {
    clock: { kind: 'boolean', labelKey: 'games.clue-clash.option.clock', default: true },
  },
}
