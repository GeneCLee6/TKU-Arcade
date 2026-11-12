// The full edition's words (C6): the hidden option, the end of a game and each seat's line. No page
// loads this file yet: C7 registers it with the full board's screen and moves the option's three
// labels into i18n.ts when it shows the option (NEXT.md). check-i18n and `npm run play` find it
// through shared/games/screenMessages.ts. `en` is the source; the type makes zh-TW keep the same keys.

const en = {
  'games.promotion.option.edition': 'Edition',
  'games.promotion.option.edition.simple': 'Simple',
  'games.promotion.option.edition.full': 'Full (silver and examinations)',
  'games.promotion.full.result.oneLeft':
    'After {rounds} rounds one official is left in office: ranks are compared and the pot is shared.',
  'games.promotion.full.result.turnLimit':
    'The {rounds} rounds are up: ranks are compared as they stand and the pot is shared.',
  'games.promotion.full.note.dahe': 'Retired to grand congratulations after {rolls} rolls, {money} silver.',
  'games.promotion.full.note.retired': 'Retired after {rolls} rolls, {money} silver.',
  'games.promotion.full.note.out': 'Exiled to the frontier after {rolls} rolls, {money} silver.',
  'games.promotion.full.note.active': 'Still in office after {rolls} rolls, {money} silver.',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.promotion.option.edition': '版本',
  'games.promotion.option.edition.simple': '簡化版',
  'games.promotion.option.edition.full': '完整版（銀兩與科舉）',
  'games.promotion.full.result.oneLeft': '第 {rounds} 回合只剩一人在任：對品、分注後結算。',
  'games.promotion.full.result.turnLimit': '{rounds} 回合已到：照目前的官階對品、分注後結算。',
  'games.promotion.full.note.dahe': '擲了 {rolls} 次，大賀榮歸，銀 {money} 兩。',
  'games.promotion.full.note.retired': '擲了 {rolls} 次，致仕歸鄉，銀 {money} 兩。',
  'games.promotion.full.note.out': '擲了 {rolls} 次，發往邊疆長戍，銀 {money} 兩。',
  'games.promotion.full.note.active': '擲了 {rolls} 次，仍在任上，銀 {money} 兩。',
}

export const promotionFullMessages = {
  en: en as Record<string, string>,
  'zh-TW': zhTW as Record<string, string>,
}
