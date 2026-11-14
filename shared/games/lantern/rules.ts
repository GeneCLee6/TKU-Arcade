// 宮燈點點 (working title Lantern Lane; owner's request 2026-11-14). A co-operative real-time game.
// Lanterns 1–100 are dealt in levels, level n giving each player n of them, and without a word the
// table lights them all onto one avenue in rising order. Anyone may light their lowest lantern at any
// moment: actions arrive one at a time through the room, so two players lighting "at once" are simply
// taken in the order the room got them.
//
// - Lighting a lantern while anyone still holds a lower one is too early: a match is gone, and every
//   lower lantern still in a hand burns (shown and put on the avenue). No matches left: the night ends.
// - Moonlight: once every player has agreed, each player's lowest lantern is shown and put on the
//   avenue. The table earns more moonlight and matches by clearing some levels.
// - Every lantern on the avenue is lower than every lantern still in a hand (an early one burns all the
//   lower ones), so the avenue is always in rising order and a light only has to look at the hands.
//
// docs/PRD/e15-lantern-lane.md has the rules and every detail decided here.
import { lanternInfo } from './info.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  LanternAction,
  LanternLevelTable,
  LanternNews,
  LanternOptions,
  LanternPileEntry,
  LanternPlayer,
  LanternReward,
  LanternState,
  LanternView,
} from './types.ts'

export const HIGHEST = 100
export const MAX_LIVES = 5
export const MAX_MOONS = 3
export const START_MOONS = 1

/** Levels by the number of players (2 to 6) */
export const LEVEL_TABLES: Record<LanternLevelTable, Record<number, number>> = {
  standard: { 2: 12, 3: 10, 4: 8, 5: 7, 6: 6 },
  short: { 2: 8, 3: 7, 4: 6, 5: 5, 6: 4 },
  taster: { 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 },
}

/** What clearing a level earns, by the level cleared; the others earn nothing */
export const REWARDS: Readonly<Record<number, LanternReward>> = {
  2: 'moon',
  3: 'life',
  5: 'moon',
  6: 'life',
  8: 'moon',
  9: 'life',
}

const ERROR = {
  badAction: 'games.lantern.error.badAction',
  over: 'games.lantern.error.over',
  notAPlayer: 'games.lantern.error.notAPlayer',
  systemOnly: 'games.lantern.error.systemOnly',
  notFocus: 'games.lantern.error.notFocus',
  alreadyReady: 'games.lantern.error.alreadyReady',
  notPlaying: 'games.lantern.error.notPlaying',
  gone: 'games.lantern.error.gone',
  notLowest: 'games.lantern.error.notLowest',
  noMoon: 'games.lantern.error.noMoon',
  sameVote: 'games.lantern.error.sameVote',
  nothingToSkip: 'games.lantern.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): LanternAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, card, on, seat } = action as Record<string, unknown>
  if (type === 'ready') return { type }
  if (type === 'light' && Number.isInteger(card)) return { type, card: card as number }
  if (type === 'moon' && typeof on === 'boolean') return { type, on }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  return null
}

export const levelsFor = (table: LanternLevelTable, players: number): number =>
  LEVEL_TABLES[table][players] ?? LEVEL_TABLES[table][Math.min(6, Math.max(2, players))]

export const startingLives = (choice: number, players: number): number =>
  choice >= 1 ? Math.min(choice, MAX_LIVES) : Math.min(players, MAX_LIVES)

/** Level `level` dealt from a fresh deck: hands up, votes off, an empty avenue */
function deal(
  state: Pick<LanternState, 'players'>,
  level: number,
  rng: Rng,
): Pick<LanternState, 'players' | 'level' | 'phase' | 'pile'> {
  const deck = rng.shuffle(Array.from({ length: HIGHEST }, (_, index) => index + 1))
  return {
    level,
    phase: 'focus',
    pile: [],
    players: state.players.map((player, index) => ({
      ...player,
      hand: deck.slice(index * level, (index + 1) * level).sort((a, b) => a - b),
      ready: false,
      moonVote: false,
    })),
  }
}

const withNews = (state: LanternState, news: LanternNews[]): LanternState => ({
  ...state,
  news,
  newsId: state.newsId + 1,
})

/** After lanterns leave the hands: the night ends, or the level is cleared, or play goes on */
function settle(state: LanternState, news: LanternNews[], rng: Rng): LanternState {
  if (state.lives <= 0) return withNews({ ...state, phase: 'over', ending: 'lost' }, news)
  if (state.players.some((player) => player.hand.length > 0)) return withNews(state, news)
  if (state.level >= state.totalLevels) return withNews({ ...state, phase: 'over', ending: 'won' }, news)

  const reward = REWARDS[state.level] ?? null
  const capped =
    (reward === 'life' && state.lives >= MAX_LIVES) || (reward === 'moon' && state.moons >= MAX_MOONS)
  const lives = reward === 'life' && !capped ? state.lives + 1 : state.lives
  const moons = reward === 'moon' && !capped ? state.moons + 1 : state.moons
  const cleared: LanternNews = { kind: 'cleared', level: state.level, reward, capped }
  return withNews({ ...state, lives, moons, ...deal(state, state.level + 1, rng) }, [...news, cleared])
}

/** `seat` lights `card`, its lowest. Too early when another hand holds a lower one */
function light(state: LanternState, seat: SeatId, card: number, rng: Rng): LanternState {
  const burned: { seat: SeatId; card: number }[] = []
  const players = state.players.map((player): LanternPlayer => {
    if (player.seat === seat) return { ...player, hand: player.hand.slice(1) }
    const lower = player.hand.filter((other) => other < card)
    for (const other of lower) burned.push({ seat: player.seat, card: other })
    return lower.length === 0 ? player : { ...player, hand: player.hand.filter((other) => other >= card) }
  })
  burned.sort((a, b) => a.card - b.card)
  const early = burned.length > 0
  const pile: LanternPileEntry[] = [
    ...state.pile,
    ...burned.map((entry): LanternPileEntry => ({ ...entry, how: 'burned' })),
    { card, seat, how: early ? 'early' : 'lit' },
  ]
  const counted = players.map((player) =>
    player.seat === seat
      ? { ...player, lit: player.lit + (early ? 0 : 1), early: player.early + (early ? 1 : 0) }
      : player,
  )
  const next = { ...state, players: counted, pile, lives: state.lives - (early ? 1 : 0) }
  return settle(next, early ? [{ kind: 'early', seat, card, burned }] : [], rng)
}

/** Everyone agreed: each player's lowest lantern is shown and goes on the avenue */
function moonlight(state: LanternState, rng: Rng): LanternState {
  const shown = state.players
    .filter((player) => player.hand.length > 0)
    .map((player) => ({ seat: player.seat, card: player.hand[0] }))
    .sort((a, b) => a.card - b.card)
  const next: LanternState = {
    ...state,
    moons: state.moons - 1,
    players: state.players.map((player) => ({ ...player, hand: player.hand.slice(1), moonVote: false })),
    pile: [...state.pile, ...shown.map((entry): LanternPileEntry => ({ ...entry, how: 'moon' }))],
  }
  return settle(next, [{ kind: 'moon', shown }], rng)
}

function vote(state: LanternState, seat: SeatId, on: boolean, rng: Rng): LanternState {
  const players = state.players.map((player) => (player.seat === seat ? { ...player, moonVote: on } : player))
  const next = { ...state, players }
  return players.every((player) => player.moonVote) ? moonlight(next, rng) : next
}

function raiseHand(state: LanternState, seat: SeatId): LanternState {
  const players = state.players.map((player) => (player.seat === seat ? { ...player, ready: true } : player))
  return { ...state, players, phase: players.every((player) => player.ready) ? 'play' : 'focus' }
}

/** Every other seat agrees to moonlight and this one has not yet */
const lastToAgree = (state: LanternState, player: LanternPlayer): boolean =>
  state.moons > 0 && !player.moonVote && state.players.every((other) => other === player || other.moonVote)

export const lantern: GameModule<LanternState, LanternAction, LanternView, LanternOptions> = {
  ...lanternInfo,

  init(seats, options, rng) {
    const players = seats.map(
      (seat): LanternPlayer => ({ seat: seat.id, hand: [], ready: false, moonVote: false, lit: 0, early: 0 }),
    )
    const lives = startingLives(options.lives, players.length)
    return {
      levelTable: options.levelTable,
      totalLevels: levelsFor(options.levelTable, players.length),
      lives,
      startLives: lives,
      moons: START_MOONS,
      news: [],
      newsId: 0,
      ending: null,
      ...deal({ players }, 1, rng),
    }
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      const player = state.players.find((other) => other.seat === action.seat)
      if (!player) return gameError(ERROR.notAPlayer)
      // A gone player: their hand goes up; in play, their vote completes a moonlight everyone else
      // wants, or else their lowest lantern is lit, when the host decides it is time
      if (state.phase === 'focus') {
        return player.ready ? gameError(ERROR.nothingToSkip) : raiseHand(state, player.seat)
      }
      if (lastToAgree(state, player)) return vote(state, player.seat, true, rng)
      if (player.hand.length > 0) return light(state, player.seat, player.hand[0], rng)
      if (state.moons > 0 && !player.moonVote) return vote(state, player.seat, true, rng)
      return gameError(ERROR.nothingToSkip)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    const player = state.players.find((other) => other.seat === actor)
    if (!player) return gameError(ERROR.notAPlayer)

    switch (action.type) {
      case 'ready':
        if (state.phase !== 'focus') return gameError(ERROR.notFocus)
        if (player.ready) return gameError(ERROR.alreadyReady)
        return raiseHand(state, actor)
      case 'light':
        if (state.phase !== 'play') return gameError(ERROR.notPlaying)
        // A tap that crossed with another player's: the lantern burned or was shown meanwhile
        if (!player.hand.includes(action.card)) return gameError(ERROR.gone)
        if (player.hand[0] !== action.card) return gameError(ERROR.notLowest)
        return light(state, actor, action.card, rng)
      case 'moon':
        if (state.phase !== 'play') return gameError(ERROR.notPlaying)
        if (state.moons <= 0) return gameError(ERROR.noMoon)
        if (player.moonVote === action.on) return gameError(ERROR.sameVote)
        return vote(state, actor, action.on, rng)
    }
  },

  // The only place the hands are cut: rule 4 of types.ts. A seat sees its own lanterns and how many
  // everyone holds; a spectator sees the counts. Whatever is left is shown once the game is over
  view(state, viewer) {
    const seat = viewer !== 'spectator' && state.players.some((player) => player.seat === viewer) ? viewer : null
    const { players, ...open } = state
    return {
      ...open,
      you: seat,
      hand: seat === null ? null : (players.find((player) => player.seat === seat)?.hand ?? []),
      players: players.map(({ hand, ...rest }) => ({ ...rest, count: hand.length })),
      reward: state.level < state.totalLevels ? (REWARDS[state.level] ?? null) : null,
      leftover:
        state.phase === 'over'
          ? players.filter((player) => player.hand.length > 0).map((player) => ({ seat: player.seat, cards: player.hand }))
          : null,
    }
  },

  legalActions(state, seat) {
    const player = state.players.find((other) => other.seat === seat)
    if (!player || state.phase === 'over') return []
    if (state.phase === 'focus') return player.ready ? [] : [{ type: 'ready' }]
    const actions: LanternAction[] = []
    if (player.hand.length > 0) actions.push({ type: 'light', card: player.hand[0] })
    if (state.moons > 0) actions.push({ type: 'moon', on: !player.moonVote })
    return actions
  },

  // The table waits for an absent seat's hand, lanterns and vote until the host covers for it
  skipAction(state, seat) {
    const player = state.players.find((other) => other.seat === seat)
    if (!player || state.phase === 'over') return null
    const waiting =
      state.phase === 'focus'
        ? !player.ready
        : player.hand.length > 0 || (state.moons > 0 && !player.moonVote)
    return waiting ? { type: 'skip', seat } : null
  },

  // A level is played without a word, typed ones included
  chatLocked(state) {
    return state.phase !== 'over'
  },

  isOver(state) {
    return state.phase === 'over'
  },

  // Co-operative: the table wins or loses together; each line says how that seat's lanterns went
  result(state): GameResult {
    const won = state.ending === 'won'
    return {
      summary: {
        key: won ? 'games.lantern.result.won' : 'games.lantern.result.lost',
        params: { level: state.level, levels: state.totalLevels },
      },
      standings: state.players.map((player) => ({
        seat: player.seat,
        rank: 1,
        score: null,
        note: { key: 'games.lantern.note', params: { lit: player.lit, early: player.early } },
      })),
    }
  },
}
