// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { KiteOptions } from './types.ts'

export const MAX_NOTES = 8
export const MAX_BURNS = 3
export const MAX_TURN_SECONDS = 300
/** Cards in hand: 5 with 2–3 players, 4 with 4–5 */
export const handSize = (players: number): number => (players <= 3 ? 5 : 4)

export const kiteInfo: GameInfo<KiteOptions> = {
  id: 'kite',
  // No `proxyTurns`: every turn is a decision, and a random one could snap a line
  meta: {
    minPlayers: 2,
    maxPlayers: 5,
    minutes: 30,
    i18nKey: 'games.kite',
  },

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
