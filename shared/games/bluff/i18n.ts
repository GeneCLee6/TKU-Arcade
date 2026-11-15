// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.bluff.option.twoRounds': 'Everyone judges twice',
  'games.bluff.option.readSeconds': 'Seconds to read',
  'games.bluff.option.mole': 'A mole with secret words (4 players or more)',
  'games.bluff.option.hints': 'Show three categories, one of them true',
  'games.bluff.option.clock': 'Countdowns',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.bluff.option.twoRounds': '每人當兩次裁判',
  'games.bluff.option.readSeconds': '每人朗讀秒數',
  'games.bluff.option.mole': '有暗樁（4 人以上）',
  'games.bluff.option.hints': '顯示三個類別提示（其中一個是真的）',
  'games.bluff.option.clock': '倒數計時',
}

export const bluffMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
