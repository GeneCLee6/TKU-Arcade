// What the lobby and the waiting room say of this game: these are in everyone's first load, through
// GAME_MESSAGES (shared/games/catalog.ts), so keep them few. All the rest is in i18n.screen.ts, which
// loads with the screen. `en` is the source; the type makes zh-TW keep the same keys.
const en = {
  'games.spectrum.name': 'Spectrum',
  'games.spectrum.summary':
    'Say where your secret number sits on a scale; the guesser finds the top and the bottom.',
  'games.spectrum.option.mode': 'The guesser picks',
  'games.spectrum.option.mode.extremes': 'The largest and the smallest',
  'games.spectrum.option.mode.order': 'Everyone in order',
  'games.spectrum.option.duplicates': 'Numbers can repeat',
  'games.spectrum.option.twoRounds': 'Everyone guesses twice',
  'games.spectrum.option.clock': '90 s to answer, 60 s to guess',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.spectrum.name': '光譜',
  'games.spectrum.summary': '用一個回答說出祕密數字在兩端之間的位置，猜題者找出最大和最小。',
  'games.spectrum.option.mode': '猜題者要猜',
  'games.spectrum.option.mode.extremes': '最大和最小',
  'games.spectrum.option.mode.order': '所有人的順序',
  'games.spectrum.option.duplicates': '數字可以重複',
  'games.spectrum.option.twoRounds': '每人當兩次猜題者',
  'games.spectrum.option.clock': '作答 90 秒、猜題 60 秒',
}

export const spectrumMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
