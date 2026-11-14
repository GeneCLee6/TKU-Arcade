// The registry with the rules: every game the server can run. The Worker and the scripts import this
// file; the browser must not, or every game's rules are in its first load: it has catalog.ts, and the
// lazy screens have src/games/screens.ts. A new game adds its module here and its info in catalog.ts.
import { bluff } from './bluff/rules.ts'
import { lantern } from './lantern/rules.ts'
import { clueClash } from './clue-clash/rules.ts'
import { oddWord } from './odd-word/rules.ts'
import { promotion } from './promotion/rules.ts'
import { silentTable } from './silent-table/rules.ts'
import { spectrum } from './spectrum/rules.ts'
import { ticTacToe } from './tictactoe/rules.ts'
import { wordBridge } from './word-bridge/rules.ts'
import type { AnyGameModule } from './types.ts'

export { GAME_MESSAGES, LOBBY_GAMES } from './catalog.ts'

const MODULES: readonly AnyGameModule[] = [
  ticTacToe,
  promotion,
  silentTable,
  spectrum,
  bluff,
  oddWord,
  lantern,
  wordBridge,
  clueClash,
]

const BY_ID: ReadonlyMap<string, AnyGameModule> = new Map(MODULES.map((game) => [game.id, game]))

export const GAME_IDS: readonly string[] = MODULES.map((game) => game.id)

/** The module with this id, or null: ids come from the network */
export function getGame(id: string): AnyGameModule | null {
  return BY_ID.get(id) ?? null
}
