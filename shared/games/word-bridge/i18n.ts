// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.word-bridge.name': 'Word Bridge',
  'games.word-bridge.summary': 'One-word clues bridge your partners to your words. Teams or co-op.',
  'games.word-bridge.option.mode': 'Mode',
  'games.word-bridge.option.mode.auto': 'Auto',
  'games.word-bridge.option.mode.teams': 'Two teams',
  'games.word-bridge.option.mode.duo': 'Co-op',
  'games.word-bridge.option.clock': 'Minutes per clue and per picks (0: no clock)',
  'games.word-bridge.option.turns': 'Co-op: clues before the last stand',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.word-bridge.name': '搭橋',
  'games.word-bridge.summary': '用一個詞替隊友搭橋，連到自己的詞。分隊對戰或兩人合作。',
  'games.word-bridge.option.mode': '模式',
  'games.word-bridge.option.mode.auto': '依人數',
  'games.word-bridge.option.mode.teams': '兩隊對戰',
  'games.word-bridge.option.mode.duo': '合作',
  'games.word-bridge.option.clock': '每次提示、每輪翻詞幾分鐘（0：不計時）',
  'games.word-bridge.option.turns': '合作：最後關頭前的提示次數',
}

export const wordBridgeMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
