// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.palace.name': 'Palace Bluff',
  'games.palace.summary': 'Claim any role at court, call out the liars, be the last one standing.',
  'games.palace.option.window': 'Time to respond',
  'games.palace.option.window.10': '10 seconds',
  'games.palace.option.window.15': '15 seconds',
  'games.palace.option.window.20': '20 seconds',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.palace.name': '朝堂暗鬥',
  'games.palace.summary': '在朝堂上自稱任何官職，揭穿說謊的人，撐到最後一個。',
  'games.palace.option.window': '回應時間',
  'games.palace.option.window.10': '10 秒',
  'games.palace.option.window.15': '15 秒',
  'games.palace.option.window.20': '20 秒',
}

export const palaceMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
