// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.misery.name': 'Misery Line',
  'games.misery.summary': 'How bad is it, 1 to 100? Slot each disaster into your line.',
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
  'games.misery.name': '慘度排排站',
  'games.misery.summary': '這件衰事有多慘？排進你的慘度線。',
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
