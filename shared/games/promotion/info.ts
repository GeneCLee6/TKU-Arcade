// The room's options for this game: no rules, and not in the first load either. The room loads this
// file when it opens a room of this game (src/i18n/gameDetails.ts). The lobby card's players and
// minutes are the module's `meta`, from shared/games/lobby.ts. `rules.ts` spreads this into the module.
import type { GameInfo } from '../types.ts'
import type { PromotionOptions } from './types.ts'

export const DEFAULT_TURN_LIMIT = 60

// The options the waiting room shows. The edition first: the dice and the round limit are the simple
// edition's, so the form shows them only for it (the full one throws four dice and has its own limit)
const simpleOnly = { field: 'edition', value: 'simple' }
const fullOnly = { field: 'edition', value: 'full' }

export const promotionInfo: GameInfo<PromotionOptions> = {
  id: 'promotion',

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
