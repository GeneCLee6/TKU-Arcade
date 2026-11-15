// Every game's info (options included) and every string the room may need before a screen loads, in
// both languages: for the Worker, the scripts, check-i18n and the tests. No rules (shared/games/index.ts
// has them). The browser must not import this file, or every game's options and strings are in its
// first load (tests/games/catalog.test.ts checks): the lobby has lobby.ts and one language's
// lobby table, and a room loads its own game's info.ts and i18n.ts (src/i18n/gameDetails.ts).
import { bluffMessages } from './bluff/i18n.ts'
import { bluffInfo } from './bluff/info.ts'
import { lanternMessages } from './lantern/i18n.ts'
import { lanternInfo } from './lantern/info.ts'
import { clueClashMessages } from './clue-clash/i18n.ts'
import { clueClashInfo } from './clue-clash/info.ts'
import { kartMessages } from './kart/i18n.ts'
import { kartInfo } from './kart/info.ts'
import { kiteMessages } from './kite/i18n.ts'
import { kiteInfo } from './kite/info.ts'
import { oddWordMessages } from './odd-word/i18n.ts'
import { oddWordInfo } from './odd-word/info.ts'
import { secretScrollMessages } from './secret-scroll/i18n.ts'
import { secretScrollInfo } from './secret-scroll/info.ts'
import { palaceMessages } from './palace/i18n.ts'
import { palaceInfo } from './palace/info.ts'
import { holdemMessages } from './holdem/i18n.ts'
import { holdemInfo } from './holdem/info.ts'
import { miseryMessages } from './misery/i18n.ts'
import { miseryInfo } from './misery/info.ts'
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
import { wordBridgeMessages } from './word-bridge/i18n.ts'
import { wordBridgeInfo } from './word-bridge/info.ts'
import { wasabiMessages } from './wasabi/i18n.ts'
import { wasabiInfo } from './wasabi/info.ts'
import { lobbyEn } from './lobby.en.ts'
import { lobbyZhTW } from './lobby.zh-TW.ts'
import type { AnyGameInfo, GameMessages } from './types.ts'

export { LOBBY_GAMES } from './lobby.ts'

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
  holdemInfo,
  miseryInfo,
  wordBridgeInfo,
  clueClashInfo,
  kartInfo,
] as unknown as readonly AnyGameInfo[]

const BY_ID: ReadonlyMap<string, AnyGameInfo> = new Map(GAME_INFOS.map((game) => [game.id, game]))

/** This game's info, or null: ids come from the network */
export function getGameInfo(id: string): AnyGameInfo | null {
  return BY_ID.get(id) ?? null
}

/** Every game's lobby and room strings: what the browser has by the time a room of that game shows */
export const GAME_MESSAGES: GameMessages = {
  en: {
    ...lobbyEn,
    ...ticTacToeMessages.en,
    ...promotionMessages.en,
    ...silentTableMessages.en,
    ...spectrumMessages.en,
    ...bluffMessages.en,
    ...oddWordMessages.en,
    ...lanternMessages.en,
    ...tilesMessages.en,
    ...wordBridgeMessages.en,
    ...clueClashMessages.en,
    ...kartMessages.en,
    ...kiteMessages.en,
    ...tradersMessages.en,
    ...secretScrollMessages.en,
    ...wasabiMessages.en,
    ...palaceMessages.en,
    ...holdemMessages.en,
    ...miseryMessages.en,
  },
  'zh-TW': {
    ...lobbyZhTW,
    ...ticTacToeMessages['zh-TW'],
    ...promotionMessages['zh-TW'],
    ...silentTableMessages['zh-TW'],
    ...spectrumMessages['zh-TW'],
    ...bluffMessages['zh-TW'],
    ...oddWordMessages['zh-TW'],
    ...lanternMessages['zh-TW'],
    ...tilesMessages['zh-TW'],
    ...wordBridgeMessages['zh-TW'],
    ...clueClashMessages['zh-TW'],
    ...kartMessages['zh-TW'],
    ...kiteMessages['zh-TW'],
    ...tradersMessages['zh-TW'],
    ...secretScrollMessages['zh-TW'],
    ...wasabiMessages['zh-TW'],
    ...palaceMessages['zh-TW'],
    ...holdemMessages['zh-TW'],
    ...miseryMessages['zh-TW'],
  },
}
