// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.odd-word.option.undercovers': 'Odd ones out',
  'games.odd-word.option.auto': 'Auto',
  'games.odd-word.option.n1': '1',
  'games.odd-word.option.n2': '2',
  'games.odd-word.option.n3': '3',
  'games.odd-word.option.blank': 'A blank (no word)',
  'games.odd-word.option.rounds': 'Rounds',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.odd-word.option.undercovers': '詞不一樣的人數',
  'games.odd-word.option.auto': '依人數',
  'games.odd-word.option.n1': '1',
  'games.odd-word.option.n2': '2',
  'games.odd-word.option.n3': '3',
  'games.odd-word.option.blank': '白板（沒有詞）',
  'games.odd-word.option.rounds': '回合數',
}

export const oddWordMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
