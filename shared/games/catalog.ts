// What the browser needs of every game: names, player counts, rule options and the strings for them.
// No rules: src/ imports this file, and whatever it imports is in everyone's first load. The Worker's
// registry with the rules is shared/games/index.ts; a new game adds itself to both.
import { bluffMessages } from './bluff/i18n.ts'
import { bluffInfo } from './bluff/info.ts'
import { lanternMessages } from './lantern/i18n.ts'
import { lanternInfo } from './lantern/info.ts'
import { kiteMessages } from './kite/i18n.ts'
import { kiteInfo } from './kite/info.ts'
import { oddWordMessages } from './odd-word/i18n.ts'
import { oddWordInfo } from './odd-word/info.ts'
import { secretScrollMessages } from './secret-scroll/i18n.ts'
import { secretScrollInfo } from './secret-scroll/info.ts'
import { palaceMessages } from './palace/i18n.ts'
import { palaceInfo } from './palace/info.ts'
import { promotionMessages } from './promotion/i18n.ts'
import { promotionInfo } from './promotion/info.ts'
import { silentTableMessages } from './silent-table/i18n.ts'
import { silentTableInfo } from './silent-table/info.ts'
import { spectrumMessages } from './spectrum/i18n.ts'
import { spectrumInfo } from './spectrum/info.ts'
import { tilesMessages } from './tiles/i18n.ts'
import { tilesInfo } from './tiles/info.ts'
import { tradersMessages } from './traders/i18n.ts'
import { tradersInfo } from './traders/info.ts'
import { ticTacToeMessages } from './tictactoe/i18n.ts'
import { ticTacToeInfo } from './tictactoe/info.ts'
import { wasabiMessages } from './wasabi/i18n.ts'
import { wasabiInfo } from './wasabi/info.ts'
import type { AnyGameInfo, GameMessages } from './types.ts'

export const GAME_INFOS = [
  ticTacToeInfo,
  promotionInfo,
  silentTableInfo,
  spectrumInfo,
  bluffInfo,
  oddWordInfo,
  lanternInfo,
  tilesInfo,
  kiteInfo,
  tradersInfo,
  secretScrollInfo,
  wasabiInfo,
  palaceInfo,
] as unknown as readonly AnyGameInfo[]

const BY_ID: ReadonlyMap<string, AnyGameInfo> = new Map(GAME_INFOS.map((game) => [game.id, game]))

/** The games the lobby shows a card for, in order */
export const LOBBY_GAMES: readonly AnyGameInfo[] = GAME_INFOS.filter((game) => !game.meta.unlisted)

/** This game's info, or null: ids come from the network */
export function getGameInfo(id: string): AnyGameInfo | null {
  return BY_ID.get(id) ?? null
}

/** Every game's first-load strings, for src/i18n to merge into its dictionaries */
export const GAME_MESSAGES: GameMessages = {
  en: {
    ...ticTacToeMessages.en,
    ...promotionMessages.en,
    ...silentTableMessages.en,
    ...spectrumMessages.en,
    ...bluffMessages.en,
    ...oddWordMessages.en,
    ...lanternMessages.en,
    ...tilesMessages.en,
    ...kiteMessages.en,
    ...tradersMessages.en,
    ...secretScrollMessages.en,
    ...wasabiMessages.en,
    ...palaceMessages.en,
  },
  'zh-TW': {
    ...ticTacToeMessages['zh-TW'],
    ...promotionMessages['zh-TW'],
    ...silentTableMessages['zh-TW'],
    ...spectrumMessages['zh-TW'],
    ...bluffMessages['zh-TW'],
    ...oddWordMessages['zh-TW'],
    ...lanternMessages['zh-TW'],
    ...tilesMessages['zh-TW'],
    ...kiteMessages['zh-TW'],
    ...tradersMessages['zh-TW'],
    ...secretScrollMessages['zh-TW'],
    ...wasabiMessages['zh-TW'],
    ...palaceMessages['zh-TW'],
  },
}
