// Every string that loads with a game's screen instead of with the site, in one place for what has
// to see them all: check-i18n and `npm run play`. The site itself must not import this file: that
// would put them all in everyone's first load. A screen adds its own (`addGameMessages`).
import { silentTableScreenMessages } from './silent-table/i18n.screen.ts'
import type { GameMessages } from './types.ts'

export const SCREEN_MESSAGES: GameMessages = {
  en: { ...silentTableScreenMessages.en },
  'zh-TW': { ...silentTableScreenMessages['zh-TW'] },
}
