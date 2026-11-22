// The words of the promotion screen that stay out of the board font's request (boardFont.ts): full
// screen and the tip to turn a phone (e3-t10), a cell's details with its hat button and watermark,
// both illustrative (e3-t11), the status line, the four results, rank names, and the cell names.
// The board does draw those, but the font takes them from board.ts. Loaded with the screen
// (src/games/promotion/PromotionScreen.tsx), so that they cost the lobby and the other games nothing
// (D4); check-i18n and `npm run play` find them through shared/games/screenMessages.ts. `en` is the
// source; the type makes zh-TW keep the same keys.
//
// Both languages, for check-i18n, `npm run play` and the tests (through screenMessages.ts). The
// browser loads one language at a time instead (src/games/promotion/detailStrings.ts, 2026-11-23):
// the tables are i18n.detail.en.ts and i18n.detail.zh-TW.ts.
import { messages as en } from './i18n.detail.en.ts'
import { messages as zhTW } from './i18n.detail.zh-TW.ts'

export const promotionDetailMessages = { en, 'zh-TW': zhTW }
