// The simple board's screen words (shared/games/promotion/i18n.detail.*.ts), in the page's language
// only (src/i18n/t.ts, 2026-11-23): screens.ts starts this alongside the screen's chunk, so the screen
// shows with them and no later, as the full edition's do (full/fullStrings.ts)
import { registerLanguageParts } from '../../i18n/t.ts'

export const loadDetailStrings = (): Promise<void> =>
  registerLanguageParts('promotion-detail', {
    en: () => import('../../../shared/games/promotion/i18n.detail.en.ts').then((module) => module.messages),
    'zh-TW': () =>
      import('../../../shared/games/promotion/i18n.detail.zh-TW.ts').then((module) => module.messages),
  })
