// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.misery.option.target': 'Cards to win',
  'games.misery.option.target8': '8',
  'games.misery.option.target10': '10',
  'games.misery.option.target12': '12',
  'games.misery.option.startCards': 'Starting cards',
  'games.misery.option.steals': 'Steals',
  'games.misery.option.clock': 'Time to guess',
  'games.misery.option.clockOff': 'No clock',
  'games.misery.option.clock30': '30 s',
  'games.misery.option.clock60': '60 s',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.misery.option.target': '幾張獲勝',
  'games.misery.option.target8': '8',
  'games.misery.option.target10': '10',
  'games.misery.option.target12': '12',
  'games.misery.option.startCards': '起始張數',
  'games.misery.option.steals': '搶牌',
  'games.misery.option.clock': '每次猜的時間',
  'games.misery.option.clockOff': '不計時',
  'games.misery.option.clock30': '30 秒',
  'games.misery.option.clock60': '60 秒',
}

export const miseryMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
