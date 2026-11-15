// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.secret-scroll.option.length': 'Renown to win',
  'games.secret-scroll.option.standard': 'Standard',
  'games.secret-scroll.option.short': 'Short',
  'games.secret-scroll.option.beggars': 'Add 2 Beggars (5–6 players)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.secret-scroll.option.length': '贏一局要的名望',
  'games.secret-scroll.option.standard': '標準',
  'games.secret-scroll.option.short': '短局',
  'games.secret-scroll.option.beggars': '加兩張乞丐（5–6 人）',
}

export const secretScrollMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
