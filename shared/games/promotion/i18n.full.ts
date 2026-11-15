// The full edition's words in both languages (C6, C7), for check-i18n, `npm run play` and the tests
// (through shared/games/screenMessages.ts). The browser loads one language at a time instead
// (src/games/promotion/full/fullStrings.ts): the tables are i18n.full.en.ts and i18n.full.zh-TW.ts.
import { promotionFullEn } from './i18n.full.en.ts'
import { promotionFullZhTW } from './i18n.full.zh-TW.ts'

export const promotionFullMessages = {
  en: promotionFullEn,
  'zh-TW': promotionFullZhTW,
}
