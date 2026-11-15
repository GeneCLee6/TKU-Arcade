// What the lobby says of the race room: in everyone's first load, through GAME_MESSAGES
// (shared/games/catalog.ts), so keep them few. `en` is the source. The options' labels are in
// i18n.options.ts (the waiting room's chunk), the race screen's own strings in i18n.screen.ts.
const en = {
  // Working title (PRD e8)
  'games.kart.name': 'Kart',
  'games.kart.summary':
    'Drift through the corners to fill your boost gauge, and race your friends.',
  // The time trial alone, as before rooms opened (owner, 2026-11-14)
  'games.kart.tryAlone': 'Try it alone',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kart.name': '卡丁車',
  'games.kart.summary': '過彎甩尾集滿加速條，和朋友一起比賽。',
  'games.kart.tryAlone': '單人試跑',
}

export const kartMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
