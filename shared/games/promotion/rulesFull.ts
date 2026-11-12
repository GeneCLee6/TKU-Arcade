// The full edition of promotion (e3-t12): four six-sided dice read as combinations, a birth roll,
// examinations, silver, retirement and exile, and a settlement at the end. Every decision is written
// down in docs/PRD/e3-promotion-board.md, "完整版規則細節", with which ones are tradition and which
// are our reconstruction. rules.ts picks this or the simple edition by the `edition` option.
//
// A turn is one `roll`: the server throws up to MAX_THROWS times until a throw scores, and moves.
// Nothing is hidden; all chance comes from the Rng.
import { gameError, type GameError, type GameResult, type Rng, type Seat, type SeatId } from '../types.ts'
import {
  DISMISSED,
  FULL_DEPARTMENTS,
  FULL_FACES,
  getFullCell,
  gradeOf,
  PIP_FACE,
  type FullFace,
  type Requirement,
} from './boardFull.ts'
import type {
  ComboKind,
  FullEnding,
  FullPlayer,
  FullSettlement,
  FullStep,
  FullThrow,
  PromotionAction,
  PromotionFullState,
  PromotionFullView,
  Transfer,
  TransferReason,
} from './types.ts'

export const FULL_DICE = 4
/** A turn throws again while nothing scores, up to this many times; then it passes without a move */
export const MAX_THROWS = 3
export const START_MONEY = 100
/** What a junior pays a senior on landing in the senior's department (參見) */
export const COURTESY = 5
/** What rank comparison (對品) moves per grade of difference, between every two seats */
export const RANK_STEP = 5
/** The bank's reward for a straight (穿花) */
export const RUN_REWARD = 10
/**
 * The safety net: after this many rounds the game ends and the seats still playing are compared as
 * they stand. The room's `turnLimit` option is for the simple edition; at the default 60 it would
 * cut about one full game in twenty short (scripts/promotion-sim.ts), so the full edition has its own
 */
export const FULL_ROUND_LIMIT = 100

export type Reading = { combo: ComboKind; steps: FullStep[] }

const countFaces = (dice: readonly number[]): Record<FullFace, number> => {
  const counts = { de: 0, cai: 0, gong: 0, liang: 0, rou: 0, zang: 0 }
  for (const die of dice) counts[PIP_FACE[die]] += 1
  return counts
}

/**
 * What a throw of four dice moves, best pattern first:
 *
 * - four of a kind (四同): ennoblement or three de moves (by the cell); four graft (全贓) dismissal
 * - two or more de with any graft (德壓贓): the graft is forgiven, the throw scores nothing, and the
 *   player throws again. Not on the birth roll
 * - a straight, four pips in a row (穿花): one de move and a reward from the bank
 * - two pairs with a de pair (紅二對): two de moves
 * - two pairs without (素二對): one move for each pair, the better face first
 * - three of a kind: two moves by that face
 * - a pair: one move by that face
 * - nothing else scores
 */
export function readThrow(dice: readonly number[], birth = false): Reading {
  const counts = countFaces(dice)
  const groups = FULL_FACES.filter((face) => counts[face] > 0)
  const pairs = FULL_FACES.filter((face) => counts[face] === 2)
  const four = FULL_FACES.find((face) => counts[face] === 4)
  if (four === 'zang') return { combo: 'allGraft', steps: ['dismiss'] }
  if (four !== undefined) return { combo: 'four', steps: ['fengjue'] }
  if (!birth && counts.de >= 2 && counts.zang >= 1) return { combo: 'cancel', steps: [] }
  if (groups.length === 4) {
    const pips = [...dice].sort((a, b) => a - b)
    const straight = pips.every((pip, at) => at === 0 || pip === pips[at - 1] + 1)
    return straight ? { combo: 'run', steps: ['de'] } : { combo: 'none', steps: [] }
  }
  if (pairs.length === 2) {
    return pairs[0] === 'de'
      ? { combo: 'redPairs', steps: ['de', 'de'] }
      : { combo: 'pairs', steps: [pairs[0], pairs[1]] }
  }
  const three = FULL_FACES.find((face) => counts[face] === 3)
  if (three !== undefined) return { combo: 'three', steps: [three, three] }
  if (pairs.length === 1) return { combo: 'pair', steps: [pairs[0]] }
  return { combo: 'none', steps: [] }
}

/**
 * The birth roll (出身): where a seat starts and which household it is. The best pattern decides:
 * a hereditary student for four of a kind, a straight or two pairs with de; a licentiate for de; a
 * purchased studentship for talent (which costs its fee); a candidate for merit, good conduct or two
 * plain pairs; a commoner otherwise. A Banner household (旗籍) when the dice show both a 4 and a 6.
 */
export function birthOf(dice: readonly number[]): { origin: string; banner: boolean } {
  const { combo, steps } = readThrow(dice, true)
  const banner = dice.includes(4) && dice.includes(6)
  const face = steps[0]
  let origin = 'baiding'
  if (combo === 'four' || combo === 'allGraft' || combo === 'run' || combo === 'redPairs') {
    origin = 'yinsheng'
  } else if (combo === 'pairs') origin = 'tongsheng'
  else if (face === 'de') origin = 'shengyuan'
  else if (face === 'cai') origin = 'jiansheng'
  else if (face === 'gong' || face === 'liang') origin = 'tongsheng'
  return { origin, banner }
}

export function meets(player: FullPlayer, requirement: Requirement): boolean {
  switch (requirement) {
    case 'zhengtu':
      return player.degree >= 1
    case 'juren':
      return player.degree >= 2
    case 'jinshi':
      return player.degree >= 3
    case 'banner':
      return player.banner
    case 'guard':
      return player.banner || player.wu
  }
}

/** Where a player lands for `id`: a cell they lack the standing for sends them to its `instead` */
export function resolveCell(player: FullPlayer, id: string): string {
  let at = id
  for (let hop = 0; hop < 8; hop++) {
    const cell = getFullCell(at)
    if (cell.requires === null || meets(player, cell.requires)) return at
    at = cell.instead as string
  }
  throw new Error(`promotion: no way to land for "${id}"`)
}

/** Where one step from the player's cell leads, before any requirement */
export function stepTarget(player: FullPlayer, step: FullFace | 'dismiss'): string {
  if (step === 'dismiss') return DISMISSED
  const cell = getFullCell(player.cell)
  const own = player.banner ? cell.banner?.[step] : undefined
  return own ?? cell.moves[step]
}

/** A turn's working copy: everything a turn changes, changed in place and then frozen into a state */
type Work = {
  players: FullPlayer[]
  bank: number
  transfers: Transfer[]
  path: string[]
}

function pay(work: Work, from: SeatId | null, to: SeatId | null, wanted: number, why: TransferReason) {
  // The bank never goes below nothing; a player may (a debt the end settles)
  const amount = from === null ? Math.min(wanted, work.bank) : wanted
  if (amount <= 0) return
  if (from === null) work.bank -= amount
  else work.players[from].money -= amount
  if (to === null) work.bank += amount
  else work.players[to].money += amount
  work.transfers.push({ from, to, amount, why })
}

function land(work: Work, seat: SeatId, id: string) {
  const player = work.players[seat]
  const cell = getFullCell(id)
  player.cell = id
  if (!cell.keepRank) player.rank = cell.rank
  if (cell.degree > player.degree) player.degree = cell.degree
  if (cell.wu) player.wu = true
  work.path.push(id)
  if (cell.money > 0) pay(work, null, seat, cell.money, 'reward')
  if (cell.money < 0) pay(work, seat, null, -cell.money, 'fee')
  if (cell.retire !== null) {
    player.status = 'retired'
    for (const other of work.players) {
      if (other.seat !== seat && other.status === 'active') pay(work, other.seat, seat, cell.retire, 'congrats')
    }
  }
  if (cell.out) player.status = 'out'
}

/** The moves of a reading from where the player stands: four of a kind may become three de moves */
function expand(player: FullPlayer, steps: readonly FullStep[]): (FullFace | 'dismiss' | 'fengjue')[] {
  if (steps[0] !== 'fengjue') return [...steps]
  return getFullCell(player.cell).fengjue === null ? ['de', 'de', 'de'] : ['fengjue']
}

function move(work: Work, seat: SeatId, steps: readonly FullStep[]) {
  const player = work.players[seat]
  for (const step of expand(player, steps)) {
    if (player.status !== 'active') return
    const raw = step === 'fengjue' ? (getFullCell(player.cell).fengjue as string) : stepTarget(player, step)
    land(work, seat, resolveCell(player, raw))
  }
}

/** A junior landing where a senior serves pays the senior; once per senior, for the final cell */
function courtesy(work: Work, seat: SeatId) {
  const player = work.players[seat]
  if (player.status !== 'active') return
  const dept = getFullCell(player.cell).dept
  if (!FULL_DEPARTMENTS[dept].courtesy) return
  for (const other of work.players) {
    if (other.seat === seat || other.status !== 'active') continue
    if (getFullCell(other.cell).dept !== dept || other.rank === player.rank) continue
    if (other.rank > player.rank) pay(work, seat, other.seat, COURTESY, 'courtesy')
    else pay(work, other.seat, seat, COURTESY, 'courtesy')
  }
}

const throwDice = (rng: Rng) => Array.from({ length: FULL_DICE }, () => rng.int(6) + 1)

/** The grade a seat is compared at in the end: nothing for one put out */
export const finalGrade = (player: FullPlayer) => (player.status === 'out' ? 0 : gradeOf(player.rank))

/** Rank comparison between every two seats, then the bank split evenly, the remainder to the poorest */
function settle(players: FullPlayer[], bank: number): { players: FullPlayer[]; settlement: FullSettlement } {
  const after = players.map((player) => ({ ...player }))
  const duipin = players.map(() => 0)
  for (let a = 0; a < players.length; a++) {
    for (let b = a + 1; b < players.length; b++) {
      const gap = finalGrade(players[a]) - finalGrade(players[b])
      duipin[a] += gap * RANK_STEP
      duipin[b] -= gap * RANK_STEP
    }
  }
  after.forEach((player, at) => (player.money += duipin[at]))
  const share = Math.floor(bank / players.length)
  const rest = bank - share * players.length
  after.forEach((player) => (player.money += share))
  let remainder: FullSettlement['remainder'] = null
  if (rest > 0) {
    // The poorest after the comparison; the lowest seat among equals
    const poorest = after.reduce((low, player) => (player.money < low.money ? player : low))
    poorest.money += rest
    remainder = { seat: poorest.seat, amount: rest }
  }
  return {
    players: after,
    settlement: {
      lines: players.map((player, at) => ({
        seat: player.seat,
        grade: finalGrade(player),
        before: player.money,
        duipin: duipin[at],
        share: share + (remainder?.seat === player.seat ? rest : 0),
        after: after[at].money,
      })),
      remainder,
    },
  }
}

function finish(state: PromotionFullState, ending: FullEnding): PromotionFullState {
  const { players, settlement } = settle(state.players, state.bank)
  return { ...state, players, bank: 0, turn: null, ending, settlement }
}

/** Hands the turn on to the next seat still playing, or ends the game */
function advance(state: PromotionFullState, from: SeatId): PromotionFullState {
  const active = state.players.filter((player) => player.status === 'active')
  if (active.length <= 1) return finish(state, 'oneLeft')
  const n = state.players.length
  // Rounds count from the first seat, so that every seat gets the same number of turns
  const place = (seat: SeatId) => (seat - state.first + n) % n
  let next = from
  for (let step = 1; step <= n; step++) {
    next = (from + step) % n
    if (state.players[next].status === 'active') break
  }
  const round = place(next) <= place(from) ? state.round + 1 : state.round
  if (round > state.turnLimit) return finish(state, 'turnLimit')
  return { ...state, turn: next, round }
}

export function initFull(seats: readonly Seat[], rng: Rng): PromotionFullState {
  const first = rng.pick(seats).id
  return {
    edition: 'full',
    players: seats.map((seat) => ({
      seat: seat.id,
      cell: 'baiding',
      rank: 0,
      money: START_MONEY,
      degree: 0,
      wu: false,
      banner: false,
      origin: null,
      status: 'active',
      rolls: 0,
    })),
    turn: first,
    first,
    round: 1,
    turnLimit: FULL_ROUND_LIMIT,
    bank: START_MONEY * seats.length,
    last: null,
    ending: null,
    settlement: null,
  }
}

export function reduceFull(
  state: PromotionFullState,
  action: PromotionAction,
  actor: SeatId | 'system',
  rng: Rng,
): PromotionFullState | GameError {
  if (state.turn === null) return gameError('games.promotion.error.over')
  if (action.type === 'pass') {
    if (actor !== 'system') return gameError('games.promotion.error.notYourTurn')
    return advance(state, state.turn)
  }
  if (actor !== state.turn) return gameError('games.promotion.error.notYourTurn')

  const seat = actor
  const work: Work = {
    players: state.players.map((player) => ({ ...player })),
    bank: state.bank,
    transfers: [],
    path: [],
  }
  const player = work.players[seat]
  const from = player.cell
  const throws: FullThrow[] = []
  const birth = player.origin === null
  player.rolls += 1

  if (birth) {
    const dice = throwDice(rng)
    const { combo } = readThrow(dice, true)
    const { origin, banner } = birthOf(dice)
    throws.push({ dice, combo, steps: [] })
    player.origin = origin
    player.banner = banner
    land(work, seat, origin)
  } else {
    for (let at = 0; at < MAX_THROWS; at++) {
      const dice = throwDice(rng)
      const { combo, steps } = readThrow(dice)
      throws.push({ dice, combo, steps })
      if (steps.length === 0) continue
      move(work, seat, steps)
      if (combo === 'run') pay(work, null, seat, RUN_REWARD, 'run')
      courtesy(work, seat)
      break
    }
  }

  const next: PromotionFullState = {
    ...state,
    players: work.players,
    bank: work.bank,
    last: { seat, birth, throws, from, path: work.path, transfers: work.transfers },
  }
  return advance(next, seat)
}

export const viewFull = (state: PromotionFullState, you: SeatId | null): PromotionFullView => ({
  ...state,
  you,
})

/** The one sentence about a seat at the end */
function noteKey(player: FullPlayer): string {
  if (player.status === 'out') return 'games.promotion.full.note.out'
  if (player.status === 'retired') {
    return player.cell === 'dahe' ? 'games.promotion.full.note.dahe' : 'games.promotion.full.note.retired'
  }
  return 'games.promotion.full.note.active'
}

/** The most silver wins; then seniority; seats equal on both share a place */
export function resultFull(state: PromotionFullState): GameResult {
  const better = (a: FullPlayer, b: FullPlayer) => b.money - a.money || b.rank - a.rank
  const ordered = [...state.players].sort((a, b) => better(a, b) || a.seat - b.seat)
  return {
    summary: {
      key: `games.promotion.full.result.${state.ending ?? 'oneLeft'}`,
      params: { rounds: state.round },
    },
    standings: ordered.map((player) => ({
      seat: player.seat,
      rank: 1 + ordered.filter((other) => better(other, player) < 0).length,
      score: player.money,
      note: { key: noteKey(player), params: { rolls: player.rolls, money: player.money } },
    })),
  }
}
