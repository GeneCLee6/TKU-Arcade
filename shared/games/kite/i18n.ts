// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.kite.name': 'Kite Day',
  'games.kite.summary': 'Fly kite trains together. You see every hand but yours.',
  'games.kite.option.rainbow': 'Rainbow kites (a sixth colour)',
  'games.kite.option.turnSeconds': 'Seconds per turn (0 = off)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.kite.name': '放風箏',
  'games.kite.summary': '一起放串風箏：看得到別人的牌，看不到自己的。',
  'games.kite.option.rainbow': '彩色風箏（第六種顏色）',
  'games.kite.option.turnSeconds': '每回合秒數（0 = 不限）',
}

export const kiteMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
