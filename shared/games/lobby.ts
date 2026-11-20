// The lobby's record of every game: what a game card shows before anyone plays, and nothing else.
// The browser's first load has this file and one language's names (lobby.en.ts, lobby.zh-TW.ts);
// a game's options and the room's strings load with its room (src/i18n/gameDetails.ts), its rules
// only ever run on the server (shared/games/index.ts). Adding a game costs the first load one line
// here and its name and summary in the two lobby tables, so keep it to that.
import type { GameMeta } from './types.ts'

/** Each game's players, minutes and i18n prefix, in lobby order; info.ts hands it to the module */
export const GAME_META = {
  tictactoe: { minPlayers: 2, maxPlayers: 2, minutes: 2, i18nKey: 'games.tictactoe', unlisted: true },
  // Every turn is one roll, so playing it for someone is fair. The full edition's decisions (C8) are
  // never picked at random: covering a seat then takes the default answer (`proxyActions`, rules.ts)
  promotion: { minPlayers: 2, maxPlayers: 6, minutes: 20, i18nKey: 'games.promotion', proxyTurns: true, computer: true },
  // Listed on the owner's request, 2026-11-12 (the IP-CHECKLIST.md signature lines are still the owner's).
  // No `proxyTurns`: a chip is a decision, and a random one could lose the level
  'silent-table': { minPlayers: 3, maxPlayers: 6, minutes: 20, i18nKey: 'games.silent-table' },
  // Listed on the owner's request, 2026-11-12, under its working title (PRD Q3 still open). No
  // `proxyTurns`: an answer has to come from a person.
  // 4 to 11: at least three answerers, so that the largest and the smallest are two different
  // calls; at most ten, so that ten different numbers go round
  spectrum: { minPlayers: 4, maxPlayers: 11, minutes: 25, i18nKey: 'games.spectrum' },
  // Listed with its screen (I2). 3 to 9: a judge, the honest reader and at least one bluffer; the
  // mole needs four
  bluff: { minPlayers: 3, maxPlayers: 9, minutes: 30, i18nKey: 'games.bluff' },
  // 3 to 12: the owner's numbers (2026-11-14). The talking is on the friends' own voice call
  'odd-word': { minPlayers: 3, maxPlayers: 12, minutes: 20, i18nKey: 'games.odd-word' },
  // 2 to 4 as the game is meant; 5 and 6 play a shorter table (owner's request 2026-11-14). No
  // `proxyTurns`: when to light a lantern is the whole game
  lantern: { minPlayers: 2, maxPlayers: 6, minutes: 20, i18nKey: 'games.lantern' },
  // 2 to 4: the owner's numbers (2026-11-14), and what 106 tiles hold (14 each, a pool to draw from).
  // No `proxyTurns`: a turn is a decision
  tiles: { minPlayers: 2, maxPlayers: 4, minutes: 30, i18nKey: 'games.tiles' },
  // No `proxyTurns`: every turn is a decision, and a random one could snap a line
  kite: { minPlayers: 2, maxPlayers: 5, minutes: 30, i18nKey: 'games.kite' },
  // `computer`: the room plays computer seats (2026-11-20, GameModule.bot) in these three
  traders: { minPlayers: 2, maxPlayers: 4, minutes: 30, i18nKey: 'games.traders', computer: true },
  // 2 to 4 is the deck's sweet spot; 5 and 6 work, best with the Beggars (owner's brief 2026-11-14).
  // No `proxyTurns`: every card is a decision
  'secret-scroll': { minPlayers: 2, maxPlayers: 6, minutes: 20, i18nKey: 'games.secret-scroll' },
  // 3 to 6 (owner's brief 2026-11-14). No `proxyTurns`: every bid is a decision
  wasabi: { minPlayers: 3, maxPlayers: 6, minutes: 20, i18nKey: 'games.wasabi' },
  // 2 to 6: the owner's numbers (2026-11-14). The bluffing is on the friends' own voice call
  palace: { minPlayers: 2, maxPlayers: 6, minutes: 15, i18nKey: 'games.palace' },
  // 2 to 9: the owner's numbers (2026-11-14), one full table
  holdem: { minPlayers: 2, maxPlayers: 9, minutes: 45, i18nKey: 'games.holdem', computer: true },
  // 2 to 10 (owner's request 2026-11-14). The talking is on the friends' own voice call; no
  // `proxyTurns`: where a card goes is a decision
  misery: { minPlayers: 2, maxPlayers: 10, minutes: 25, i18nKey: 'games.misery' },
  // 2 to 10: co-op for two or three, two partnerships from four (owner's numbers, 2026-11-14)
  'word-bridge': { minPlayers: 2, maxPlayers: 10, minutes: 20, i18nKey: 'games.word-bridge' },
  // 3 to 7 (owner's numbers, 2026-11-14). No `proxyTurns`: a clue has to come from a person
  'clue-clash': { minPlayers: 3, maxPlayers: 7, minutes: 20, i18nKey: 'games.clue-clash' },
  // One player can open a room alone: to try the track, or to wait on the grid for friends. No
  // proxy turns: there are no turns
  kart: { minPlayers: 1, maxPlayers: 8, minutes: 5, i18nKey: 'games.kart', tryAlone: '/kart' },
} as const satisfies Record<string, GameMeta>

export type GameId = keyof typeof GAME_META

/** What a lobby card, the game picker and a room's title need of a game */
export type GameCard = { id: string; meta: GameMeta }

/** Every game, in lobby order, listed or not */
export const GAME_CARDS: readonly GameCard[] = Object.entries(GAME_META).map(([id, meta]) => ({
  id,
  meta: meta as GameMeta,
}))

const BY_ID: ReadonlyMap<string, GameCard> = new Map(GAME_CARDS.map((game) => [game.id, game]))

/** The games the lobby shows a card for, in order */
export const LOBBY_GAMES: readonly GameCard[] = GAME_CARDS.filter((game) => !game.meta.unlisted)

/** This game's card, or null: ids come from the network */
export function getGameCard(id: string): GameCard | null {
  return BY_ID.get(id) ?? null
}
