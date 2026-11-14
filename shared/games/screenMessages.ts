// Every string that loads with a game's screen instead of with the site, in one place for what has
// to see them all: check-i18n and `npm run play`. The site itself must not import this file: that
// would put them all in everyone's first load. A screen adds its own (`registerMessages`).
import { bluffScreenMessages } from './bluff/i18n.screen.ts'
import { lanternScreenMessages } from './lantern/i18n.screen.ts'
import { clueClashScreenMessages } from './clue-clash/i18n.screen.ts'
import { kiteScreenMessages } from './kite/i18n.screen.ts'
import { miseryScreenMessages } from './misery/i18n.screen.ts'
import { oddWordScreenMessages } from './odd-word/i18n.screen.ts'
import { secretScrollScreenMessages } from './secret-scroll/i18n.screen.ts'
import { wasabiScreenMessages } from './wasabi/i18n.screen.ts'
import { roomExtraMessages } from './roomExtras.ts'
import { promotionDetailMessages } from './promotion/i18n.detail.ts'
import { promotionFullMessages } from './promotion/i18n.full.ts'
import { promotionRouteMessages } from './promotion/i18n.routes.ts'
import { promotionScreenMessages } from './promotion/i18n.screen.ts'
import { silentTableScreenMessages } from './silent-table/i18n.screen.ts'
import { soonMessages } from './soon.ts'
import { spectrumScreenMessages } from './spectrum/i18n.screen.ts'
import { tilesScreenMessages } from './tiles/i18n.screen.ts'
import { tradersScreenMessages } from './traders/i18n.screen.ts'
import type { GameMessages } from './types.ts'
import { wordBridgeScreenMessages } from './word-bridge/i18n.screen.ts'

export const SCREEN_MESSAGES: GameMessages = {
  en: {
    ...promotionScreenMessages.en,
    ...promotionDetailMessages.en,
    ...promotionFullMessages.en,
    ...promotionRouteMessages.en,
    ...silentTableScreenMessages.en,
    ...spectrumScreenMessages.en,
    ...bluffScreenMessages.en,
    ...oddWordScreenMessages.en,
    ...lanternScreenMessages.en,
    ...tilesScreenMessages.en,
    ...wordBridgeScreenMessages.en,
    ...clueClashScreenMessages.en,
    ...kiteScreenMessages.en,
    ...tradersScreenMessages.en,
    ...secretScrollScreenMessages.en,
    ...wasabiScreenMessages.en,
    ...miseryScreenMessages.en,
    ...soonMessages.en,
    ...roomExtraMessages.en,
  },
  'zh-TW': {
    ...promotionScreenMessages['zh-TW'],
    ...promotionDetailMessages['zh-TW'],
    ...promotionFullMessages['zh-TW'],
    ...promotionRouteMessages['zh-TW'],
    ...silentTableScreenMessages['zh-TW'],
    ...spectrumScreenMessages['zh-TW'],
    ...bluffScreenMessages['zh-TW'],
    ...oddWordScreenMessages['zh-TW'],
    ...lanternScreenMessages['zh-TW'],
    ...tilesScreenMessages['zh-TW'],
    ...wordBridgeScreenMessages['zh-TW'],
    ...clueClashScreenMessages['zh-TW'],
    ...kiteScreenMessages['zh-TW'],
    ...tradersScreenMessages['zh-TW'],
    ...secretScrollScreenMessages['zh-TW'],
    ...wasabiScreenMessages['zh-TW'],
    ...miseryScreenMessages['zh-TW'],
    ...soonMessages['zh-TW'],
    ...roomExtraMessages['zh-TW'],
  },
}
