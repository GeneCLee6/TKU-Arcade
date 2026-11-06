// Every player-facing string of this game. `en` is the source; the type makes zh-TW keep the same
// keys. src/i18n merges these through GAME_MESSAGES (shared/games/index.ts).
const en = {
  'games.tictactoe.name': 'Tic-Tac-Toe',
  'games.tictactoe.summary': 'Three in a row wins.',
  'games.tictactoe.option.firstMove': 'Who goes first',
  'games.tictactoe.option.firstMove.random': 'Random',
  'games.tictactoe.option.firstMove.lowestSeat': 'First seat',
  'games.tictactoe.error.badAction': 'That is not a move in this game.',
  'games.tictactoe.error.over': 'The game is over.',
  'games.tictactoe.error.notYourTurn': 'It is not your turn.',
  'games.tictactoe.error.occupied': 'That cell is taken.',
  'games.tictactoe.result.won': 'Three in a row!',
  'games.tictactoe.result.draw': 'A draw.',
  'games.tictactoe.note.won': 'Got three in a row.',
  'games.tictactoe.note.lost': 'Blocked out this time.',
  'games.tictactoe.note.drew': 'Nobody got through.',
}

const zhTW: Record<keyof typeof en, string> = {
  'games.tictactoe.name': '井字棋',
  'games.tictactoe.summary': '三子連線獲勝。',
  'games.tictactoe.option.firstMove': '誰先下',
  'games.tictactoe.option.firstMove.random': '隨機',
  'games.tictactoe.option.firstMove.lowestSeat': '第一個座位',
  'games.tictactoe.error.badAction': '這不是這款遊戲的動作。',
  'games.tictactoe.error.over': '這局已經結束了。',
  'games.tictactoe.error.notYourTurn': '還沒輪到你。',
  'games.tictactoe.error.occupied': '這格已經有棋子了。',
  'games.tictactoe.result.won': '三子連線！',
  'games.tictactoe.result.draw': '平手。',
  'games.tictactoe.note.won': '成功連成一線。',
  'games.tictactoe.note.lost': '這次被擋下來了。',
  'games.tictactoe.note.drew': '誰也沒連成線。',
}

export const ticTacToeMessages = { en, 'zh-TW': zhTW }
