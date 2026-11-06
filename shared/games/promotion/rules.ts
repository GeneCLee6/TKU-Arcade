// Promotion (e3-t02, e3-t03): every seat starts as a commoner and takes turns rolling; the cell they
// stand on says where each result leads (board.ts). The first to reach the end cell wins at once;
// if nobody has after `turnLimit` rounds, the game ends and seniority decides.
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import { END_CELL, FACES, getCell, START_CELL, type Face } from './board.ts'
import type {
  PromotionAction,
  PromotionOptions,
  PromotionPlayer,
  PromotionState,
  PromotionView,
} from './types.ts'

/** Rarely reached (see tests/games/promotion.test.ts): it caps a long game, it does not end most */
export const DEFAULT_TURN_LIMIT = 60

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
function isRoll(action: unknown): action is PromotionAction {
  return (
    typeof action === 'object' && action !== null && (action as { type?: unknown }).type === 'roll'
  )
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

export const promotion: GameModule<
  PromotionState,
  PromotionAction,
  PromotionView,
  PromotionOptions
> = {
  id: 'promotion',
  meta: { minPlayers: 2, maxPlayers: 6, minutes: 20, i18nKey: 'games.promotion' },

  options: {
    dice: {
      kind: 'select',
      labelKey: 'games.promotion.option.dice',
      choices: [
        { value: 'four-sided', labelKey: 'games.promotion.option.dice.fourSided' },
        { value: 'six-sided', labelKey: 'games.promotion.option.dice.sixSided' },
      ],
      default: 'four-sided',
    },
    turnLimit: {
      kind: 'int',
      labelKey: 'games.promotion.option.turnLimit',
      min: 10,
      max: 200,
      default: DEFAULT_TURN_LIMIT,
    },
  },

  init(seats, options, rng) {
    const first = rng.pick(seats).id
    return {
      players: seats.map((seat) => ({ seat: seat.id, cell: START_CELL, rolls: 0, demotions: 0 })),
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
    if (!isRoll(action)) return gameError('games.promotion.error.badAction')
    if (state.turn === null) return gameError('games.promotion.error.over')
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
