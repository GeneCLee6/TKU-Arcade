// Promotion (e3-t02, e3-t03): every seat starts as a commoner and takes turns rolling; the cell they
// stand on says where each result leads (board.ts). The first to reach the end cell wins at once;
// if nobody has after `turnLimit` rounds, the game ends and seniority decides.
//
// That is the simple edition, and the default. The room option `edition: 'full'` plays the full
// edition instead (C6, rulesFull.ts): `promotion` at the bottom of this file picks one at `init` and
// tells their states apart by the full one's `edition` field.
import { DEFAULT_TURN_LIMIT, promotionInfo } from './info.ts'
import {
  gameError,
  type GameModule,
  type GameResult,
  type OptionsSchema,
  type Rng,
  type SeatId,
} from '../types.ts'
import { END_CELL, FACES, getCell, START_CELL, type Face } from './board.ts'
import {
  defaultDecision,
  initFull,
  legalFull,
  reduceFull,
  resultFull,
  timersFull,
  viewFull,
} from './rulesFull.ts'
import type {
  PromotionAction,
  PromotionAnyState,
  PromotionAnyView,
  PromotionFullState,
  PromotionOptions,
  PromotionPlayer,
  PromotionState,
  PromotionView,
} from './types.ts'

/** Rarely reached (see tests/games/promotion.test.ts): it caps a long game, it does not end most */
export { DEFAULT_TURN_LIMIT }

/**
 * Four six-sided dice to one result: how many of them show a red face (1 or 4, the faces Chinese
 * dice paint red), as an index into this table. Our own table, not a historical one: more reds
 * mean a better result, and 3 and 4 reds share a line.
 *
 *   reds   ways of 81   result
 *   0      16 (19.8%)   zang
 *   1      32 (39.5%)   gong
 *   2      24 (29.6%)   cai
 *   3-4     9 (11.1%)   de
 */
export const SIX_SIDED_TABLE: readonly Face[] = ['zang', 'gong', 'cai', 'de', 'de']

export const DICE_PER_ROLL = 4

const RED_FACES: readonly number[] = [1, 4]

export function faceFromDice(dice: readonly number[]): Face {
  const reds = dice.filter((die) => RED_FACES.includes(die)).length
  return SIX_SIDED_TABLE[reds]
}

function roll(kind: PromotionOptions['dice'], rng: Rng): { face: Face; dice: number[] | null } {
  if (kind === 'four-sided') return { face: rng.pick(FACES), dice: null }
  const dice = Array.from({ length: DICE_PER_ROLL }, () => rng.int(6) + 1)
  return { face: faceFromDice(dice), dice }
}

/** `action` comes off the network: its static type promises nothing at run time */
const hasType = (action: unknown, type: string) =>
  typeof action === 'object' && action !== null && (action as { type?: unknown }).type === type

function isRoll(action: unknown): action is { type: 'roll' } {
  return hasType(action, 'roll')
}

function isPass(action: unknown): action is { type: 'pass' } {
  return hasType(action, 'pass')
}

/** The full edition's answers to a decision (C8): `buy` names an office by id */
function isDecision(action: unknown): action is PromotionAction {
  if (hasType(action, 'accept') || hasType(action, 'decline') || hasType(action, 'skip')) return true
  return hasType(action, 'buy') && typeof (action as { cell?: unknown }).cell === 'string'
}

const rankOf = (player: PromotionPlayer) => getCell(player.cell).rank

/** The one sentence about a seat, by how far they got. Thresholds: see rank in board.ts */
function noteKey(player: PromotionPlayer): string {
  const rank = rankOf(player)
  if (player.cell === END_CELL) return 'games.promotion.note.retired'
  if (rank >= 19) return 'games.promotion.note.minister'
  if (rank >= 11) return 'games.promotion.note.official'
  if (rank >= 5) return 'games.promotion.note.clerk'
  if (rank >= 1) return 'games.promotion.note.student'
  return 'games.promotion.note.commoner'
}

/** Every option, `edition` (C6, shown since C7) among them: info.ts, as the waiting room has them */
export const PROMOTION_OPTIONS: OptionsSchema<PromotionOptions> = promotionInfo.options

/** The simple edition alone: what every promotion game was before C6, and is still by default */
export const promotionSimple: GameModule<
  PromotionState,
  PromotionAction,
  PromotionView,
  PromotionOptions
> = {
  id: promotionInfo.id,
  meta: promotionInfo.meta,
  options: PROMOTION_OPTIONS,

  init(seats, options, rng) {
    const first = rng.pick(seats).id
    return {
      players: seats.map((seat) => ({
        seat: seat.id,
        cell: START_CELL,
        rolls: 0,
        demotions: 0,
        route: [],
      })),
      turn: first,
      first,
      round: 1,
      turnLimit: options.turnLimit,
      dice: options.dice,
      last: null,
      ending: null,
      winner: null,
    }
  },

  reduce(state, action, actor, rng) {
    if (!isRoll(action) && !isPass(action)) return gameError('games.promotion.error.badAction')
    if (state.turn === null) return gameError('games.promotion.error.over')

    if (isPass(action)) {
      // Only the room passes a turn, for someone who is gone (`skipAction`)
      if (actor !== 'system') return gameError('games.promotion.error.notYourTurn')
      const at = state.players.findIndex((player) => player.seat === state.turn)
      const after: SeatId = state.players[(at + 1) % state.players.length].seat
      const nextRound = after === state.first ? state.round + 1 : state.round
      if (nextRound > state.turnLimit) return { ...state, turn: null, ending: 'turnLimit' }
      return { ...state, turn: after, round: nextRound }
    }

    if (actor !== state.turn) return gameError('games.promotion.error.notYourTurn')

    const index = state.players.findIndex((player) => player.seat === actor)
    const mover = state.players[index]
    const { face, dice } = roll(state.dice, rng)
    const to = getCell(mover.cell).moves[face]
    const players = state.players.map((player, at) =>
      at === index
        ? {
            ...player,
            cell: to,
            rolls: player.rolls + 1,
            demotions: player.demotions + (face === 'zang' ? 1 : 0),
            // A game from before the route was kept has none, and keeps none
            ...(player.route && { route: [...player.route, { round: state.round, face, to }] }),
          }
        : player,
    )
    const last = { seat: actor, face, dice, from: mover.cell, to }

    if (to === END_CELL) {
      return { ...state, players, turn: null, last, ending: 'retired', winner: actor }
    }
    const next: SeatId = state.players[(index + 1) % state.players.length].seat
    const round = next === state.first ? state.round + 1 : state.round
    if (round > state.turnLimit) {
      return { ...state, players, turn: null, last, ending: 'turnLimit' }
    }
    return { ...state, players, turn: next, round, last }
  },

  // Nothing is hidden, so this only adds `you`
  view(state, viewer) {
    return { ...state, you: viewer === 'spectator' ? null : viewer }
  },

  legalActions(state, seat) {
    return state.turn === seat ? [{ type: 'roll' }] : []
  },

  skipAction() {
    return { type: 'pass' }
  },

  isOver(state) {
    return state.turn === null
  },

  result(state): GameResult {
    // Seniority decides, the end cell being the highest rank; equal seniority shares a place
    const ordered = [...state.players].sort((a, b) => rankOf(b) - rankOf(a) || a.seat - b.seat)
    return {
      summary: {
        key:
          state.ending === 'retired'
            ? 'games.promotion.result.retired'
            : 'games.promotion.result.turnLimit',
        params: { rounds: state.round },
      },
      standings: ordered.map((player) => ({
        seat: player.seat,
        rank: 1 + ordered.filter((other) => rankOf(other) > rankOf(player)).length,
        score: rankOf(player),
        note: { key: noteKey(player), params: { rolls: player.rolls } },
      })),
    }
  },
}

const isFull = (state: PromotionAnyState): state is PromotionFullState =>
  (state as { edition?: unknown }).edition === 'full'

/** The registered module: either edition, by the `edition` option */
export const promotion: GameModule<
  PromotionAnyState,
  PromotionAction,
  PromotionAnyView,
  PromotionOptions
> = {
  id: promotionInfo.id,
  meta: promotionInfo.meta,
  options: PROMOTION_OPTIONS,

  init(seats, options, rng) {
    // An option missing (a room from before C6) is the simple edition. A full game starts on the
    // latest rules; one from before C8 has no `rulesVersion` and plays on under the first (rulesFull.ts)
    return options.edition === 'full'
      ? initFull(seats, rng, options)
      : promotionSimple.init(seats, options, rng)
  },

  reduce(state, action, actor, rng) {
    if (!isFull(state)) return promotionSimple.reduce(state, action, actor, rng)
    const decision = state.rulesVersion === 2 && isDecision(action)
    if (!isRoll(action) && !isPass(action) && !decision) return gameError('games.promotion.error.badAction')
    return reduceFull(state, action, actor, rng)
  },

  view(state, viewer) {
    const you = viewer === 'spectator' ? null : viewer
    return isFull(state) ? viewFull(state, you) : promotionSimple.view(state, viewer)
  },

  legalActions(state, seat) {
    if (isFull(state)) return legalFull(state, seat)
    return state.turn === seat ? [{ type: 'roll' }] : []
  },

  // A seat whose player is gone: a turn is passed, a decision gets its default answer
  skipAction(state) {
    const pending = isFull(state) ? (state.pending ?? null) : null
    return pending === null ? { type: 'pass' } : defaultDecision(pending)
  },

  // Covering for a seat rolls for it, but never decides for it: a decision gets the default
  proxyActions(state, seat) {
    const pending = isFull(state) ? (state.pending ?? null) : null
    return pending === null ? this.legalActions(state, seat) : [defaultDecision(pending)]
  },

  timers(state) {
    return isFull(state) ? timersFull(state) : []
  },

  isOver(state) {
    return state.turn === null
  },

  result(state) {
    return isFull(state) ? resultFull(state) : promotionSimple.result(state)
  },
}
