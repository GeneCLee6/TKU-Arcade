// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
// All the rest is in i18n.screen.ts, which loads with the screen.
const en = {
  'games.silent-table.option.levelsToWin': 'Levels in a row to win',
  'games.silent-table.option.failureLimit': 'Failed levels that end the game',
  'games.silent-table.option.allowTakeFromPlayers': 'Chips can be taken from other players',
  'games.silent-table.option.spectatorsSeeAll': 'Spectators see all hole cards',
  'games.silent-table.option.roundSeconds': 'Time for each round',
  'games.silent-table.option.roundSeconds.off': 'No clock',
  'games.silent-table.option.roundSeconds.60': '60 seconds',
  'games.silent-table.option.roundSeconds.90': '90 seconds',
  'games.silent-table.option.roundSeconds.120': '120 seconds',
  'games.silent-table.option.skin': 'Table theme',
  'games.silent-table.option.skin.plain': 'Plain table',
  'games.silent-table.option.skin.diving': 'Diving team',
  'games.silent-table.option.skin.climbing': 'Climbing team',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.silent-table.option.levelsToWin': '連過幾關獲勝',
  'games.silent-table.option.failureLimit': '失敗幾關算輸',
  'games.silent-table.option.allowTakeFromPlayers': '可以從別的玩家手上拿籌碼',
  'games.silent-table.option.spectatorsSeeAll': '旁觀者可以看所有底牌',
  'games.silent-table.option.roundSeconds': '每輪時間',
  'games.silent-table.option.roundSeconds.off': '不限時',
  'games.silent-table.option.roundSeconds.60': '60 秒',
  'games.silent-table.option.roundSeconds.90': '90 秒',
  'games.silent-table.option.roundSeconds.120': '120 秒',
  'games.silent-table.option.skin': '牌桌主題',
  'games.silent-table.option.skin.plain': '素面牌桌',
  'games.silent-table.option.skin.diving': '潛水隊',
  'games.silent-table.option.skin.climbing': '登山隊',
}

export const silentTableMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
