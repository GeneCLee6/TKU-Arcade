// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  'games.bluff.name': 'Bluff Reader',
  'games.bluff.summary':
    'One of you reads the real meaning of an odd word, the rest make one up; the judge finds the truth.',
  'games.bluff.option.twoRounds': 'Everyone judges twice',
  'games.bluff.option.readSeconds': 'Seconds to read',
  'games.bluff.option.mole': 'A mole with secret words (4 players or more)',
  'games.bluff.option.hints': 'Bluffers get a hint',
  'games.bluff.option.clock': 'Countdowns',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.bluff.name': '真假朗讀',
  'games.bluff.summary': '一個人念出怪詞的真正意思，其他人現場瞎掰，裁判要找出誰說的是真的。',
  'games.bluff.option.twoRounds': '每人當兩次裁判',
  'games.bluff.option.readSeconds': '每人朗讀秒數',
  'games.bluff.option.mole': '有暗樁（4 人以上）',
  'games.bluff.option.hints': '瞎掰的人看得到提示',
  'games.bluff.option.clock': '倒數計時',
}

export const bluffMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
