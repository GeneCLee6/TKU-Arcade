// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's request 2026-11-14)
  'games.traders.name': 'Tamsui Traders',
  'games.traders.summary': 'Trade tea and spice; each shop you buy makes the next cheaper.',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.traders.name': '滬尾商行',
  'games.traders.summary': '在淡水河港買賣茶葉香料，開店養店。',
}

export const tradersMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
