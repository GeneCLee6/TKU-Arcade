// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.word-bridge.option.mode': 'Mode',
  'games.word-bridge.option.mode.auto': 'Auto',
  'games.word-bridge.option.mode.teams': 'Two teams',
  'games.word-bridge.option.mode.duo': 'Co-op',
  'games.word-bridge.option.clock': 'Minutes per clue and per picks (0: no clock)',
  'games.word-bridge.option.turns': 'Co-op: clues before the last stand',
}

const zhTW: Record<keyof typeof en, string> = {
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
