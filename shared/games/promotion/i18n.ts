// What the lobby and the waiting room say of this game, and what the room may show before the screen
// has loaded (errors, results): these are in everyone's first load, through GAME_MESSAGES
// (shared/games/catalog.ts). The screen's own words, cell and rank names included, are in
// i18n.detail.ts and i18n.screen.ts, which load with the screen. `en` is the source; the type makes
// zh-TW keep the same keys.

const en = {
  'games.promotion.name': 'Promotion',
  'games.promotion.summary': 'Roll your way from commoner to the top of the imperial civil service.',
  'games.promotion.option.dice': 'Dice',
  'games.promotion.option.dice.fourSided': 'Four-sided top',
  'games.promotion.option.dice.sixSided': 'Four six-sided dice',
  'games.promotion.option.turnLimit': 'Round limit',
  // The character on the top, Chinese in both languages: it is the game's own look
  'games.promotion.glyph.de': '德',
  'games.promotion.glyph.cai': '才',
  'games.promotion.glyph.gong': '功',
  'games.promotion.glyph.zang': '贓',
  'games.promotion.error.badAction': 'That is not a move in this game.',
  'games.promotion.error.over': 'The game is over.',
  'games.promotion.error.notYourTurn': 'It is not your turn.',
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
  'games.promotion.name': '陞官圖',
  'games.promotion.summary': '從白丁一路擲到位極人臣，看誰先榮歸故里。',
  'games.promotion.option.dice': '骰子',
  'games.promotion.option.dice.fourSided': '四面陀螺',
  'games.promotion.option.dice.sixSided': '四顆六面骰',
  'games.promotion.option.turnLimit': '回合上限',
  'games.promotion.glyph.de': '德',
  'games.promotion.glyph.cai': '才',
  'games.promotion.glyph.gong': '功',
  'games.promotion.glyph.zang': '贓',
  'games.promotion.error.badAction': '這不是這款遊戲的動作。',
  'games.promotion.error.over': '這局已經結束了。',
  'games.promotion.error.notYourTurn': '還沒輪到你。',
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
