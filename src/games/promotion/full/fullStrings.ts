// The full board's words, by far the biggest table, in the page's language only (src/i18n/t.ts):
// screens.ts starts this alongside the screen's chunk, so the screen shows with them and no later
import { registerLanguageParts } from '../../../i18n/t.ts'

export const loadFullStrings = (): Promise<void> =>
  registerLanguageParts('promotion-full', {
    en: () =>
      import('../../../../shared/games/promotion/i18n.full.en.ts').then((module) => module.promotionFullEn),
    'zh-TW': () =>
      import('../../../../shared/games/promotion/i18n.full.zh-TW.ts').then(
        (module) => module.promotionFullZhTW,
      ),
  })
