// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.wasabi.option.goal': 'Gold chopsticks to win',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.wasabi.option.goal': '贏要幾雙金筷子',
}

export const wasabiMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
