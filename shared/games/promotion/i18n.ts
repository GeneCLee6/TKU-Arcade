// What the room says of this game before its screen has loaded: the options form, errors and results.
// Not in the first load: the room loads this file when it opens a room of this game
// (src/i18n/gameDetails.ts). The name and summary are the lobby's (shared/games/lobby.en.ts).
// `en` is the source; the type makes zh-TW keep the same keys.
// The screen's own words, cell and rank names included, are in i18n.detail.ts and i18n.screen.ts.

const en = {
  'games.promotion.option.dice': 'Dice',
  'games.promotion.option.dice.fourSided': 'Four-sided top',
  'games.promotion.option.dice.sixSided': 'Four six-sided dice',
  'games.promotion.option.turnLimit': 'Round limit',
  'games.promotion.option.edition': 'Edition',
  'games.promotion.option.edition.simple': 'Simple',
  'games.promotion.option.edition.full': 'Full (silver and examinations)',
  'games.promotion.option.edition.simpleHint': '79 offices, one roll a turn, first to retire wins. About 20 minutes.',
  'games.promotion.option.edition.fullHint':
    'The traditional game: 236 offices, birth, exams, four dice, silver and choices; the richest wins. 30 to 50 minutes.',
  'games.promotion.option.decisionSeconds': 'Seconds to answer an offer or a purchase',
  'games.promotion.option.buying': 'Buying office (捐納)',
  'games.promotion.option.endAtDahe': 'End at the first grand congratulations (大賀)',
  'games.promotion.error.badAction': 'That is not a move in this game.',
  'games.promotion.error.over': 'The game is over.',
  'games.promotion.error.notYourTurn': 'It is not your turn.',
  'games.promotion.error.decide': 'Answer the question first.',
  'games.promotion.error.nothingToDecide': 'There is nothing to answer now.',
  'games.promotion.error.badBuy': 'That office is not for sale here.',
  'games.promotion.error.cannotAfford': 'Not enough silver for that office.',
  'games.promotion.result.retired': 'An official retires in glory after {rounds} rounds.',
  'games.promotion.result.turnLimit': 'The {rounds} rounds are up: seniority decides.',
  'games.promotion.note.retired': 'Retired in glory after {rolls} rolls.',
  'games.promotion.note.minister': 'Among the great ministers after {rolls} rolls.',
  'games.promotion.note.official': 'A respectable career, {rolls} rolls long.',
  'games.promotion.note.clerk': 'Still in the lower posts after {rolls} rolls.',
  'games.promotion.note.student': 'Still studying for the exams after {rolls} rolls.',
  'games.promotion.note.commoner': 'A commoner still, after {rolls} rolls.',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.promotion.option.dice': '骰子',
  'games.promotion.option.dice.fourSided': '四面陀螺',
  'games.promotion.option.dice.sixSided': '四顆六面骰',
  'games.promotion.option.turnLimit': '回合上限',
  'games.promotion.option.edition': '版本',
  'games.promotion.option.edition.simple': '簡化版',
  'games.promotion.option.edition.full': '完整版（銀兩與科舉）',
  'games.promotion.option.edition.simpleHint': '79 格、每回合擲一次、先榮歸的贏，約 20 分鐘。',
  'games.promotion.option.edition.fullHint': '照傳統玩法：236 格、出身、科舉、四顆骰子、銀兩與抉擇，銀兩最多的贏，約 30–50 分鐘。',
  'games.promotion.option.decisionSeconds': '回答授職或捐官的秒數',
  'games.promotion.option.buying': '捐納（花銀子買官）',
  'games.promotion.option.endAtDahe': '第一個人大賀就結束',
  'games.promotion.error.badAction': '這不是這款遊戲的動作。',
  'games.promotion.error.over': '這局已經結束了。',
  'games.promotion.error.notYourTurn': '還沒輪到你。',
  'games.promotion.error.decide': '請先回答問題。',
  'games.promotion.error.nothingToDecide': '現在沒有要回答的事。',
  'games.promotion.error.badBuy': '這裡不能捐這個官。',
  'games.promotion.error.cannotAfford': '銀兩不夠捐這個官。',
  'games.promotion.result.retired': '第 {rounds} 回合，有人榮歸故里。',
  'games.promotion.result.turnLimit': '{rounds} 回合已到，比官階定勝負。',
  'games.promotion.note.retired': '擲了 {rolls} 次，功成榮歸。',
  'games.promotion.note.minister': '擲了 {rolls} 次，已是朝廷大員。',
  'games.promotion.note.official': '擲了 {rolls} 次，仕途還算體面。',
  'games.promotion.note.clerk': '擲了 {rolls} 次，還在基層打滾。',
  'games.promotion.note.student': '擲了 {rolls} 次，還在考場奮鬥。',
  'games.promotion.note.commoner': '擲了 {rolls} 次，依然一介白丁。',
}

export const promotionMessages = {
  en: en as Record<string, string>,
  'zh-TW': zhTW as Record<string, string>,
}
