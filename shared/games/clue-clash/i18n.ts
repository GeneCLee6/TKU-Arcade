// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.clue-clash.name': 'Clue Clash',
  'games.clue-clash.summary': 'Everyone writes one clue for the guesser. Same clues cancel out.',
  'games.clue-clash.option.clock': 'Clock (90 s to write, 60 s to guess)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.clue-clash.name': '撞詞',
  'games.clue-clash.summary': '每人寫一個提示給猜的人，撞在一起的提示會抵銷。',
  'games.clue-clash.option.clock': '計時（寫提示 90 秒、猜 60 秒）',
}

export const clueClashMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
