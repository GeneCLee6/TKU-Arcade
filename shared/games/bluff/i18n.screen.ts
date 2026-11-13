// What only someone at the table reads: errors and the result (the screen's own strings join in I2).
// check-i18n and `npm run play` find it through shared/games/screenMessages.ts. `en` is the source.
const en = {
  'games.bluff.error.badAction': 'That is not a move in this game.',
  'games.bluff.error.over': 'The game is over.',
  'games.bluff.error.notAPlayer': 'That seat is not playing in this game.',
  'games.bluff.error.systemOnly': 'Only the room can do that.',
  'games.bluff.error.notPreparing': 'The reading has already started.',
  'games.bluff.error.notJudge': 'Only the judge can do that.',
  'games.bluff.error.notReading': 'Nobody is reading now.',
  'games.bluff.error.notYourReading': 'Only the reader or the judge can end this reading.',
  'games.bluff.error.notVoting': 'It is not time to vote.',
  'games.bluff.error.notAReader': 'Pick one of this round’s readers.',
  'games.bluff.error.judgeSticker': 'The judge votes instead of giving a sticker.',
  'games.bluff.error.ownSticker': 'You cannot give yourself a sticker.',
  'games.bluff.error.notReveal': 'The round is not over yet.',
  'games.bluff.error.nothingToSkip': 'There is nothing to skip for that seat.',
  'games.bluff.result.won': 'Top score: {score} points after {rounds} rounds.',
  'games.bluff.result.tie': '{winners} players share the top score of {score} after {rounds} rounds.',
  'games.bluff.note.points': 'Fooled the judge {fooled} times; found as the honest reader {found} times.',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.bluff.error.badAction': '這個遊戲沒有這一步。',
  'games.bluff.error.over': '遊戲已經結束了。',
  'games.bluff.error.notAPlayer': '這個座位沒有在這局遊戲裡。',
  'games.bluff.error.systemOnly': '只有房間可以這樣做。',
  'games.bluff.error.notPreparing': '朗讀已經開始了。',
  'games.bluff.error.notJudge': '只有裁判可以這樣做。',
  'games.bluff.error.notReading': '現在沒有人在朗讀。',
  'games.bluff.error.notYourReading': '只有正在朗讀的人或裁判可以結束這段朗讀。',
  'games.bluff.error.notVoting': '還不是投票的時候。',
  'games.bluff.error.notAReader': '從這回合朗讀的人裡面選一位。',
  'games.bluff.error.judgeSticker': '裁判用投票，不貼吐槽貼。',
  'games.bluff.error.ownSticker': '不能貼自己。',
  'games.bluff.error.notReveal': '這回合還沒結束。',
  'games.bluff.error.nothingToSkip': '這個座位沒有可以跳過的事。',
  'games.bluff.result.won': '{rounds} 回合結束，最高分 {score} 分。',
  'games.bluff.result.tie': '{rounds} 回合結束，{winners} 人同分並列最高的 {score} 分。',
  'games.bluff.note.points': '騙倒裁判 {fooled} 次，當老實人被找到 {found} 次。',
}

export const bluffScreenMessages = { en, 'zh-TW': zhTW } as {
  en: Record<string, string>
  'zh-TW': Record<string, string>
}
