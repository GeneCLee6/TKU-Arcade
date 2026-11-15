// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.palace.option.window': 'Time to respond',
  'games.palace.option.window.10': '10 seconds',
  'games.palace.option.window.15': '15 seconds',
  'games.palace.option.window.20': '20 seconds',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.palace.option.window': '回應時間',
  'games.palace.option.window.10': '10 秒',
  'games.palace.option.window.15': '15 秒',
  'games.palace.option.window.20': '20 秒',
}

export const palaceMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
