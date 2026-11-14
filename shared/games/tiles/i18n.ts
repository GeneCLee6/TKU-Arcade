// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.tiles.name': 'Clubroom Tiles',
  'games.tiles.summary': 'Lay number tiles in runs and groups, rework the table, empty your rack first.',
  'games.tiles.option.clock': 'Turn clock',
  'games.tiles.option.clock.60': '60 s',
  'games.tiles.option.clock.90': '90 s',
  'games.tiles.option.clock.120': '120 s',
  'games.tiles.option.clock.off': 'Off',
  'games.tiles.option.rounds': 'Rounds',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.tiles.name': '社辦牌陣',
  'games.tiles.summary': '把數字牌排成順子和同數，整桌重組，先出完手牌的贏。',
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
