// What the lobby and the waiting room say of the race room: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source. The race screen's
// own strings are in i18n.screen.ts.
const en = {
  // Working title (PRD e8)
  'games.kart.name': 'Kart',
  'games.kart.summary': 'Drift through the corners to fill your boost gauge, and race your friends.',
  // The time trial alone, as before rooms opened (owner, 2026-11-14)
  'games.kart.tryAlone': 'Try it alone',
  'games.kart.option.track': 'Track',
  'games.kart.option.laps': 'Laps',
  // Working titles, as on the time trial's course menu
  'games.kart.track.riverside': 'Riverside',
  'games.kart.track.harbour': 'Harbour Hairpins',
  'games.kart.track.tamkang': 'Tamkang Campus',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kart.name': '卡丁車',
  'games.kart.summary': '過彎甩尾集滿加速條，和朋友一起比賽。',
  'games.kart.tryAlone': '單人試跑',
  'games.kart.option.track': '賽道',
  'games.kart.option.laps': '圈數',
  'games.kart.track.riverside': '河畔',
  'games.kart.track.harbour': '漁港髮夾彎',
  'games.kart.track.tamkang': '淡江校園',
}

export const kartMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
