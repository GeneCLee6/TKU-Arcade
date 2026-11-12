// What the browser needs to know of this game before anyone plays it: no rules, so that they stay
// out of the first load (shared/games/catalog.ts). `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { PromotionOptions } from './types.ts'

export const DEFAULT_TURN_LIMIT = 60

// The options the waiting room shows. The edition first: the dice and the round limit are the simple
// edition's, so the form shows them only for it (the full one throws four dice and has its own limit)
const simpleOnly = { field: 'edition', value: 'simple' }
const fullOnly = { field: 'edition', value: 'full' }

export const promotionInfo: GameInfo<PromotionOptions> = {
  id: 'promotion',
  // Every turn is one roll, so playing it for someone is fair. The full edition's decisions (C8) are
  // never picked at random: covering a seat then takes the default answer (`proxyActions`, rules.ts)
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
    // The full edition's (C8). Buying office is the tradition, so on; ending at the first 大賀 is a
    // house rule some tables play, so off
    decisionSeconds: {
      kind: 'int',
      labelKey: 'games.promotion.option.decisionSeconds',
      min: 10,
      max: 120,
      default: 30,
      showIf: fullOnly,
    },
    buying: { kind: 'boolean', labelKey: 'games.promotion.option.buying', default: true, showIf: fullOnly },
    endAtDahe: {
      kind: 'boolean',
      labelKey: 'games.promotion.option.endAtDahe',
      default: false,
      showIf: fullOnly,
    },
  },
}
