// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.odd-word.name': 'Odd Word Out',
  'games.odd-word.summary': 'Most get one word, a few get a similar one. Spot them.',
  'games.odd-word.option.undercovers': 'Odd ones out',
  'games.odd-word.option.auto': 'Auto',
  'games.odd-word.option.n1': '1',
  'games.odd-word.option.n2': '2',
  'games.odd-word.option.n3': '3',
  'games.odd-word.option.blank': 'A blank (no word)',
  'games.odd-word.option.rounds': 'Rounds',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.odd-word.name': '誰的詞不一樣',
  'games.odd-word.summary': '少數人的詞和大家不太一樣，把他們找出來。',
  'games.odd-word.option.undercovers': '詞不一樣的人數',
  'games.odd-word.option.auto': '依人數',
  'games.odd-word.option.n1': '1',
  'games.odd-word.option.n2': '2',
  'games.odd-word.option.n3': '3',
  'games.odd-word.option.blank': '白板（沒有詞）',
  'games.odd-word.option.rounds': '回合數',
}

export const oddWordMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
