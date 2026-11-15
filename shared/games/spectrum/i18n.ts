// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
// All the rest is in i18n.screen.ts, which loads with the screen.
const en = {
  'games.spectrum.option.mode': 'The guesser picks',
  'games.spectrum.option.mode.extremes': 'The largest and the smallest',
  'games.spectrum.option.mode.order': 'Everyone in order',
  'games.spectrum.option.duplicates': 'Numbers can repeat',
  'games.spectrum.option.twoRounds': 'Everyone guesses twice',
  'games.spectrum.option.clock': '30 s to choose, 90 s to answer, 60 s to guess',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.spectrum.option.mode': '猜題者要猜',
  'games.spectrum.option.mode.extremes': '最大和最小',
  'games.spectrum.option.mode.order': '所有人的順序',
  'games.spectrum.option.duplicates': '數字可以重複',
  'games.spectrum.option.twoRounds': '每人當兩次猜題者',
  'games.spectrum.option.clock': '選題 30 秒、作答 90 秒、猜題 60 秒',
}

export const spectrumMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
