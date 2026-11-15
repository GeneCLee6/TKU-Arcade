// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.lantern.option.lives': 'Starting matches (0: one per player)',
  'games.lantern.option.levels': 'Levels',
  'games.lantern.option.levels.standard': 'Standard',
  'games.lantern.option.levels.short': 'Short',
  'games.lantern.option.levels.taster': 'Taster (3)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.lantern.option.lives': '起始火柴（0＝一人一根）',
  'games.lantern.option.levels': '關卡數',
  'games.lantern.option.levels.standard': '標準',
  'games.lantern.option.levels.short': '短',
  'games.lantern.option.levels.taster': '試玩（3 關）',
}

export const lanternMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
