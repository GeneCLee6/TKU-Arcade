// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.tiles.option.clock': 'Turn clock',
  'games.tiles.option.clock.60': '60 s',
  'games.tiles.option.clock.90': '90 s',
  'games.tiles.option.clock.120': '120 s',
  'games.tiles.option.clock.off': 'Off',
  'games.tiles.option.rounds': 'Rounds',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.tiles.option.clock': '每回合時限',
  'games.tiles.option.clock.60': '60 秒',
  'games.tiles.option.clock.90': '90 秒',
  'games.tiles.option.clock.120': '120 秒',
  'games.tiles.option.clock.off': '不限時',
  'games.tiles.option.rounds': '局數',
}

export const tilesMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
