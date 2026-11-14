// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { ScrollOptions } from './types.ts'

export const secretScrollInfo: GameInfo<ScrollOptions> = {
  id: 'secret-scroll',
  // 2 to 4 is the deck's sweet spot; 5 and 6 work, best with the Beggars (owner's brief 2026-11-14).
  // No `proxyTurns`: every card is a decision
  meta: {
    minPlayers: 2,
    maxPlayers: 6,
    minutes: 20,
    i18nKey: 'games.secret-scroll',
  },

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
