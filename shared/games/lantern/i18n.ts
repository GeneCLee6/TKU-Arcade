// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.lantern.name': 'Lantern Lane',
  'games.lantern.summary': 'Light lanterns 1–100 in order without a word.',
  'games.lantern.option.lives': 'Starting matches (0: one per player)',
  'games.lantern.option.levels': 'Levels',
  'games.lantern.option.levels.standard': 'Standard',
  'games.lantern.option.levels.short': 'Short',
  'games.lantern.option.levels.taster': 'Taster (3)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.lantern.name': '宮燈點點',
  'games.lantern.summary': '不說話，一起把 1–100 號宮燈由小到大點亮。',
  'games.lantern.option.lives': '起始火柴（0＝一人一根）',
  'games.lantern.option.levels': '關卡數',
  'games.lantern.option.levels.standard': '標準',
  'games.lantern.option.levels.short': '短',
  'games.lantern.option.levels.taster': '試玩（3 關）',
}

export const lanternMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
