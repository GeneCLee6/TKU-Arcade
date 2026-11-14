// What the lobby and the waiting room say of this game: in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. `en` is the source.
const en = {
  // Working title (owner's brief 2026-11-14)
  'games.wasabi.name': 'Wasabi Dumplings',
  'games.wasabi.summary': 'Hide a wasabi dumpling, bid how many you can eat, then eat.',
  'games.wasabi.option.goal': 'Gold chopsticks to win',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.wasabi.name': '芥末餃子',
  'games.wasabi.summary': '藏一顆芥末餃，喊你吃得下幾顆，然後開吃。',
  'games.wasabi.option.goal': '贏要幾雙金筷子',
}

export const wasabiMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
