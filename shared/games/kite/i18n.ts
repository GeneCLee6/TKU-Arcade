// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.kite.option.rainbow': 'Rainbow kites (a sixth colour)',
  'games.kite.option.turnSeconds': 'Seconds per turn (0 = off)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kite.option.rainbow': '彩色風箏（第六種顏色）',
  'games.kite.option.turnSeconds': '每回合秒數（0 = 不限）',
}

export const kiteMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
