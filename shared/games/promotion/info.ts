// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { PromotionShownOptions } from './types.ts'

export const DEFAULT_TURN_LIMIT = 60

// The options the waiting room shows. `edition` is not here: rules.ts adds it, hidden, until C7
export const promotionInfo: GameInfo<PromotionShownOptions> = {
  id: 'promotion',
  // Every turn is one roll, with nothing to decide, so playing it for someone is fair
  meta: { minPlayers: 2, maxPlayers: 6, minutes: 20, i18nKey: 'games.promotion', proxyTurns: true },

  options: {
    dice: {
      kind: 'select',
      labelKey: 'games.promotion.option.dice',
      choices: [
        { value: 'four-sided', labelKey: 'games.promotion.option.dice.fourSided' },
        { value: 'six-sided', labelKey: 'games.promotion.option.dice.sixSided' },
      ],
      default: 'four-sided',
    },
    turnLimit: {
      kind: 'int',
      labelKey: 'games.promotion.option.turnLimit',
      min: 10,
      max: 200,
      default: DEFAULT_TURN_LIMIT,
    },
  },
}
