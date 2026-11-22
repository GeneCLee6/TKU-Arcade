// What only someone at the table reads: errors, hands, the result and the screen itself. Loaded with
// the screen (src/games/silent-table/), so that it costs the rest of the site nothing. check-i18n and
// `npm run play` find it through shared/games/screenMessages.ts. `en` is the source.
//
// Both languages, for check-i18n, `npm run play` and the tests (through screenMessages.ts). The
// browser loads one language at a time instead (src/games/screenStrings.ts): the tables are
// i18n.screen.en.ts and i18n.screen.zh-TW.ts.
import { messages as en } from './i18n.screen.en.ts'
import { messages as zhTW } from './i18n.screen.zh-TW.ts'

export const silentTableScreenMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
