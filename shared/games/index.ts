// The registry: every game the server can run. A new game adds its module and its strings here. No
// React: the Worker imports this file; the lazy screens get their own map with src/games/ (e2-t12).
import { ticTacToeMessages } from './tictactoe/i18n.ts'
import { ticTacToe } from './tictactoe/rules.ts'
import type { AnyGameModule, GameMessages } from './types.ts'

const MODULES: readonly AnyGameModule[] = [ticTacToe]

const BY_ID: ReadonlyMap<string, AnyGameModule> = new Map(MODULES.map((game) => [game.id, game]))

export const GAME_IDS: readonly string[] = MODULES.map((game) => game.id)

/** The module with this id, or null: ids come from the network */
export function getGame(id: string): AnyGameModule | null {
  return BY_ID.get(id) ?? null
}

/** Every game's strings, for src/i18n to merge into its dictionaries */
export const GAME_MESSAGES: GameMessages = {
  en: { ...ticTacToeMessages.en },
  'zh-TW': { ...ticTacToeMessages['zh-TW'] },
}
