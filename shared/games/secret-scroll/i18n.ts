// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's brief 2026-11-14)
  'games.secret-scroll.name': 'Secret Scroll',
  'games.secret-scroll.summary': 'One card in hand, sixteen in the deck. Bluff, deduce, hold the highest.',
  'games.secret-scroll.option.length': 'Renown to win',
  'games.secret-scroll.option.standard': 'Standard',
  'games.secret-scroll.option.short': 'Short',
  'games.secret-scroll.option.beggars': 'Add 2 Beggars (5–6 players)',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.secret-scroll.name': '奪祕笈',
  'games.secret-scroll.summary': '手上一張、牌堆十六張。虛張、推理，留到最後最大的贏。',
  'games.secret-scroll.option.length': '贏一局要的名望',
  'games.secret-scroll.option.standard': '標準',
  'games.secret-scroll.option.short': '短局',
  'games.secret-scroll.option.beggars': '加兩張乞丐（5–6 人）',
}

export const secretScrollMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
