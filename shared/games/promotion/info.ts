// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { PromotionOptions } from './types.ts'

export const DEFAULT_TURN_LIMIT = 60

// The options the waiting room shows. The edition first: the dice and the round limit are the simple
// edition's, so the form shows them only for it (the full one throws four dice and has its own limit)
const simpleOnly = { field: 'edition', value: 'simple' }

export const promotionInfo: GameInfo<PromotionOptions> = {
  id: 'promotion',
  // Every turn is one roll, with nothing to decide, so playing it for someone is fair
  meta: { minPlayers: 2, maxPlayers: 6, minutes: 20, i18nKey: 'games.promotion', proxyTurns: true },

  options: {
    edition: {
      kind: 'select',
      labelKey: 'games.promotion.option.edition',
      choices: [
        {
          value: 'simple',
          labelKey: 'games.promotion.option.edition.simple',
          hintKey: 'games.promotion.option.edition.simpleHint',
        },
        {
          value: 'full',
          labelKey: 'games.promotion.option.edition.full',
          hintKey: 'games.promotion.option.edition.fullHint',
        },
      ],
      default: 'simple',
    },
    dice: {
      kind: 'select',
      labelKey: 'games.promotion.option.dice',
      choices: [
        { value: 'four-sided', labelKey: 'games.promotion.option.dice.fourSided' },
        { value: 'six-sided', labelKey: 'games.promotion.option.dice.sixSided' },
      ],
      default: 'four-sided',
      showIf: simpleOnly,
    },
    turnLimit: {
      kind: 'int',
      labelKey: 'games.promotion.option.turnLimit',
      min: 10,
      max: 200,
      default: DEFAULT_TURN_LIMIT,
      showIf: simpleOnly,
    },
  },
}
