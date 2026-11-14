// 社辦牌陣 (working title Clubroom Tiles; owner's request 2026-11-14). A number-tile rummy for 2–4:
// 106 tiles, 14 each. On your turn you may rearrange the whole table (split, join, move tiles) and
// add tiles from your rack, as long as every set on the table is a group or a run when you end the
// turn and at least one tile came from your rack; otherwise the table goes back and you draw. Your
// first play must be 30 points from your rack alone. Empty your rack to win the round.
//
// The player on turn rearranges a draft that lives here, in the state: every move is an `arrange`
// and everyone sees the table change as it happens. The draft is only checked for tiles (nothing
// left the table, nothing came from anywhere but the rack); the sets are checked when the turn ends.
//
// docs/PRD/e23-clubroom-tiles.md has the rules and every detail decided here.
import { tilesInfo } from './info.ts'
import {
  allTiles,
  checkArrangement,
  checkTurn,
  isTileId,
  RACK_SIZE,
  rackValue,
  TILE_COUNT,
  withoutEmpty,
} from './tiles.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId, type TextRef } from '../types.ts'
import type {
  TilesAction,
  TilesDrawReason,
  TilesOptions,
  TilesRoundResult,
  TilesState,
  TilesView,
  TileTable,
} from './types.ts'

/** How long the score of a round stays up before the next round deals itself */
export const SCORED_MS = 45_000

/** More sets than this cannot be a table of 106 tiles */
const MAX_SETS = TILE_COUNT

const ERROR = {
  badAction: 'games.tiles.error.badAction',
  over: 'games.tiles.error.over',
  notAPlayer: 'games.tiles.error.notAPlayer',
  systemOnly: 'games.tiles.error.systemOnly',
  notYourTurn: 'games.tiles.error.notYourTurn',
  notPlaying: 'games.tiles.error.notPlaying',
  notScored: 'games.tiles.error.notScored',
  nothingToSkip: 'games.tiles.error.nothingToSkip',
} as const

const problemKey = (problem: string) => `games.tiles.error.${problem}`

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** A table off the network: a list of lists of tile numbers, or null */
function parseTable(value: unknown): TileTable | null {
  if (!Array.isArray(value) || value.length > MAX_SETS) return null
  const table: TileTable = []
  for (const set of value) {
    if (!Array.isArray(set) || set.length > TILE_COUNT || !set.every(isTileId)) return null
    table.push([...set])
  }
  return table
}

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): TilesAction | null {
  if (typeof action !== 'object' || action === null || Array.isArray(action)) return null
  const { type, seat, sets } = action as Record<string, unknown>
  switch (type) {
    case 'reset':
    case 'draw':
    case 'timeUp':
    case 'next':
      return { type }
    case 'skip':
      return isSeat(seat) ? { type, seat } : null
    case 'arrange': {
      const table = parseTable(sets)
      return table === null ? null : { type, sets: table }
    }
    case 'commit': {
      if (sets === undefined) return { type }
      const table = parseTable(sets)
      return table === null ? null : { type, sets: table }
    }
    default:
      return null
  }
}

/** The table the player on turn has now */
export const currentTable = (state: Pick<TilesState, 'draft' | 'table'>): TileTable => state.draft ?? state.table

/** A fresh round: shuffle, 14 each, the starter's turn */
function deal(
  state: Pick<TilesState, 'players' | 'firstStarter'>,
  round: number,
  rng: Rng,
): Pick<TilesState, 'phase' | 'round' | 'pool' | 'racks' | 'melded' | 'table' | 'draft' | 'turn' | 'turnNo' | 'passes' | 'last'> {
  const tiles = rng.shuffle(allTiles())
  const count = state.players.length
  return {
    phase: 'play',
    round,
    racks: state.players.map((_, index) => tiles.slice(index * RACK_SIZE, (index + 1) * RACK_SIZE)),
    pool: tiles.slice(count * RACK_SIZE),
    melded: state.players.map(() => false),
    table: [],
    draft: null,
    turn: (state.firstStarter + round - 1) % count,
    turnNo: 1,
    passes: 0,
    last: null,
  }
}

/** The next player's turn, with the table as it is now */
const nextTurn = (state: TilesState): TilesState => ({
  ...state,
  draft: null,
  turn: (state.turn + 1) % state.players.length,
  turnNo: state.turnNo + 1,
})

/**
 * The round's score. Someone went out: each other player loses what is left in their rack (a
 * wildcard 30) and the winner gains it all. The pool ran out: the lowest rack wins (tied, they share
 * the gain, rounded down), the others lose their own racks
 */
export function scoreRound(racks: readonly (readonly number[])[], out: number | null): { winners: number[]; deltas: number[] } {
  const values = racks.map((rack) => rackValue(rack))
  const low = Math.min(...values)
  const winners = out !== null ? [out] : values.flatMap((value, index) => (value === low ? [index] : []))
  const lost = values.reduce((sum, value, index) => (winners.includes(index) ? sum : sum + value), 0)
  const share = Math.floor(lost / winners.length)
  return { winners, deltas: values.map((value, index) => (winners.includes(index) ? share : -value)) }
}

/** The round ends: scores, history, and either the score screen or the end */
function endRound(state: TilesState, out: number | null): TilesState {
  const { winners, deltas } = scoreRound(state.racks, out)
  const result: TilesRoundResult = {
    round: state.round,
    winners: winners.map((index) => state.players[index]),
    out: out !== null,
    racks: state.racks,
    deltas,
  }
  return {
    ...state,
    phase: state.round >= state.totalRounds ? 'over' : 'scored',
    draft: null,
    scores: state.scores.map((score, index) => score + deltas[index]),
    history: [...state.history, result],
  }
}

/** The turn ends without a play: the table goes back, a tile is drawn, or with none left a pass */
function drawOrPass(state: TilesState, why: TilesDrawReason): TilesState {
  const seat = state.players[state.turn]
  if (state.pool.length === 0) {
    const passes = state.passes + 1
    const passed: TilesState = { ...state, draft: null, passes, last: { kind: 'passed', seat, why } }
    // Everyone in a row has had nothing to play and nothing to draw: the round is stuck
    return passes >= state.players.length ? endRound(passed, null) : nextTurn(passed)
  }
  const [top, ...pool] = state.pool
  const racks = state.racks.map((rack, index) => (index === state.turn ? [...rack, top] : rack))
  return nextTurn({ ...state, pool, racks, last: { kind: 'drew', seat, why } })
}

/** The turn ends with `draft` as the table, already checked */
function play(state: TilesState, draft: TileTable, added: readonly number[]): TilesState {
  const seat = state.players[state.turn]
  const gone = new Set(added)
  const rack = state.racks[state.turn].filter((tile) => !gone.has(tile))
  const played: TilesState = {
    ...state,
    table: draft,
    draft: null,
    racks: state.racks.map((other, index) => (index === state.turn ? rack : other)),
    melded: state.melded.map((done, index) => done || index === state.turn),
    passes: 0,
    last: { kind: 'played', seat, tiles: added.length, first: !state.melded[state.turn] },
  }
  return rack.length === 0 ? endRound(played, state.turn) : nextTurn(played)
}

export const tiles: GameModule<TilesState, TilesAction, TilesView, TilesOptions> = {
  ...tilesInfo,

  init(seats, options, rng) {
    const players = seats.map((seat) => seat.id)
    const base = {
      clock: options.clock,
      players,
      totalRounds: options.rounds,
      firstStarter: rng.int(players.length),
      scores: players.map(() => 0),
      history: [],
    }
    return { ...base, ...deal(base, 1, rng) }
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'next') {
      if (actor !== 'system' && !state.players.includes(actor)) return gameError(ERROR.notAPlayer)
      if (state.phase !== 'scored') return gameError(ERROR.notScored)
      return { ...state, ...deal(state, state.round + 1, rng) }
    }

    if (action.type === 'timeUp' || action.type === 'skip') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (state.phase !== 'play') return gameError(ERROR.notPlaying)
      if (action.type === 'skip' && action.seat !== state.players[state.turn]) return gameError(ERROR.nothingToSkip)
      return drawOrPass(state, action.type === 'timeUp' ? 'timeUp' : 'skipped')
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (!state.players.includes(actor)) return gameError(ERROR.notAPlayer)
    if (state.phase !== 'play') return gameError(ERROR.notPlaying)
    if (actor !== state.players[state.turn]) return gameError(ERROR.notYourTurn)
    const rack = state.racks[state.turn]

    switch (action.type) {
      case 'reset':
        return { ...state, draft: null }
      case 'draw':
        return drawOrPass(state, 'chose')
      case 'arrange': {
        const draft = withoutEmpty(action.sets)
        const check = checkArrangement(state.table, draft, rack)
        if (!check.ok) return gameError(problemKey(check.problem))
        return { ...state, draft }
      }
      case 'commit': {
        const draft = action.sets === undefined ? currentTable(state) : withoutEmpty(action.sets)
        const check = checkTurn(state.table, draft, rack, state.melded[state.turn])
        if (!check.ok) return gameError(problemKey(check.problem))
        return play(state, draft, check.added)
      }
    }
  },

  // The racks and the pool's order are the secrets; the table, the draft and the counts are open,
  // as at a real table, where everyone watches the player on turn move the tiles
  view(state, viewer) {
    const index = viewer === 'spectator' ? -1 : state.players.indexOf(viewer)
    return {
      phase: state.phase,
      clock: state.clock,
      players: state.players,
      round: state.round,
      totalRounds: state.totalRounds,
      table: state.table,
      draft: state.draft,
      turn: state.players[state.turn],
      turnNo: state.turnNo,
      pool: state.pool.length,
      passes: state.passes,
      seats: state.players.map((seat, at) => ({
        seat,
        tiles: state.racks[at].length,
        melded: state.melded[at],
        score: state.scores[at],
      })),
      you: index >= 0 ? state.players[index] : null,
      rack: index >= 0 ? state.racks[index] : null,
      last: state.last,
      history: state.history,
    }
  },

  // No hint: `commit` is listed only once the draft would pass, never a play the rack could make
  legalActions(state, seat) {
    if (state.phase === 'scored') return state.players.includes(seat) ? [{ type: 'next' }] : []
    if (state.phase !== 'play' || seat !== state.players[state.turn]) return []
    const table = currentTable(state)
    const actions: TilesAction[] = [{ type: 'draw' }, { type: 'arrange', sets: table }]
    if (state.draft !== null) actions.push({ type: 'reset' })
    if (checkTurn(state.table, table, state.racks[state.turn], state.melded[state.turn]).ok) {
      actions.push({ type: 'commit' })
    }
    return actions
  },

  // A gone player's turn: as if the clock ran out
  skipAction(state, seat) {
    return state.phase === 'play' && seat === state.players[state.turn] ? { type: 'skip', seat } : null
  },

  timers(state) {
    if (state.phase === 'scored') return [{ id: `scored-${state.round}`, ms: SCORED_MS, action: { type: 'next' } }]
    if (state.phase !== 'play' || state.clock === 0) return []
    return [{ id: `turn-${state.round}-${state.turnNo}`, ms: state.clock * 1000, action: { type: 'timeUp' } }]
  },

  isOver(state) {
    return state.phase === 'over'
  },

  result(state): GameResult {
    const top = Math.max(...state.scores)
    const winners = state.scores.filter((score) => score === top).length
    const single = state.totalRounds === 1
    const last = state.history.at(-1)
    const ordered = state.players
      .map((seat, index) => ({ seat, index, score: state.scores[index] }))
      .sort((a, b) => b.score - a.score || a.seat - b.seat)
    return {
      summary: {
        key: winners > 1 ? 'games.tiles.result.tie' : single ? 'games.tiles.result.won' : 'games.tiles.result.wonRounds',
        params: { score: top, rounds: state.history.length, winners },
      },
      standings: ordered.map((player) => {
        const rack = last?.racks[player.index] ?? []
        const wins = state.history.filter((round) => round.winners.includes(player.seat)).length
        const note: TextRef = !single
          ? { key: 'games.tiles.note.wins', params: { wins } }
          : rack.length === 0
            ? { key: 'games.tiles.note.out' }
            : { key: 'games.tiles.note.left', params: { tiles: rack.length, points: rackValue(rack) } }
        return {
          seat: player.seat,
          rank: 1 + ordered.filter((other) => other.score > player.score).length,
          score: player.score,
          note,
        }
      }),
    }
  },
}
