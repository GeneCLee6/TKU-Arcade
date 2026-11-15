// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // The traditional game's own generic name (owner's request 2026-11-14)
  'games.holdem.name': "Texas Hold'em",
  'games.holdem.summary': 'No-limit poker for play chips: two cards each, five shared.',
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
  'games.holdem.name': '德州撲克',
  'games.holdem.summary': '無限注撲克，只用遊戲籌碼：每人兩張、桌上五張。',
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
