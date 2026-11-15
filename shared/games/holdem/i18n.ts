// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.holdem.option.stack': 'Starting chips',
  'games.holdem.option.bb.100': '100 BB · 2,000 chips',
  'games.holdem.option.bb.200': '200 BB · 4,000 chips',
  'games.holdem.option.bb.300': '300 BB · 6,000 chips',
  'games.holdem.option.blindUp': 'Blinds go up',
  'games.holdem.option.blindUp.15': 'Every 15 hands',
  'games.holdem.option.blindUp.20': 'Every 20 hands',
  'games.holdem.option.timer': 'Time to act',
  'games.holdem.option.timer.20': '20 seconds',
  'games.holdem.option.timer.30': '30 seconds',
  'games.holdem.option.timer.60': '60 seconds',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.holdem.option.stack': '起始籌碼',
  'games.holdem.option.bb.100': '100 BB・2,000 籌碼',
  'games.holdem.option.bb.200': '200 BB・4,000 籌碼',
  'games.holdem.option.bb.300': '300 BB・6,000 籌碼',
  'games.holdem.option.blindUp': '盲注升級',
  'games.holdem.option.blindUp.15': '每 15 手',
  'games.holdem.option.blindUp.20': '每 20 手',
  'games.holdem.option.timer': '行動時間',
  'games.holdem.option.timer.20': '20 秒',
  'games.holdem.option.timer.30': '30 秒',
  'games.holdem.option.timer.60': '60 秒',
}

export const holdemMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
