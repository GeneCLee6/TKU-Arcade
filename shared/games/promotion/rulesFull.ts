// The full edition of promotion (e3-t12, C8): four six-sided dice read as combinations, a birth roll,
// examinations, silver, retirement and exile, and a settlement at the end. Every decision is written
// down in docs/PRD/e3-promotion-board.md, "完整版規則細節", with which ones are tradition and which
// are our reconstruction. rules.ts picks this or the simple edition by the `edition` option.
//
// Two versions of these rules live here, each on its own board (boardFull.ts `fullBoard`):
//
// - 1, C6's: a turn is one `roll`, the server throws up to MAX_THROWS times until a throw scores, and
//   moves. A game started before C8 has no `rulesVersion` and plays on under these, exactly as before
//   (tests/games/promotion/full.test.ts holds a fingerprint of them).
// - 2, C8's: the same, and the players decide some things. A move to an offered post (謄錄, ...)
//   waits for its seat to accept or decline; a move to a minor technical post waits for its seat to
//   take it or buy a regular office instead (捐納). Event zones (京察, ...) throw a second time to
//   decide the outcome; a dismissal (革職) waits for restoration (開復) or exile the same way.
//   Commissions are fined for graft, 大賀 is 30 from everyone not out of it, honorary titles count
//   in the comparison, and no move ever leads back to an origin (擁有者 2026-11-12).
//
// Nothing is hidden; all chance comes from the Rng.
import { gameError, type GameError, type GameResult, type Rng, type Seat, type SeatId } from '../types.ts'
import {
  BUY_CAPITAL,
  BUY_PROVINCES,
  DISMISSED,
  FULL_DEPARTMENTS,
  FULL_FACES,
  FULL_START,
  fullBoard,
  gradeOf,
  LATEST_RULES,
  PIP_FACE,
  type FullBoard,
  type FullCell,
  type FullFace,
  type Requirement,
} from './boardFull.ts'
import type {
  ComboKind,
  FullDecision,
  FullEnding,
  FullLastTurn,
  FullPending,
  FullPlayer,
  FullRules,
  FullSettlement,
  FullStep,
  FullThrow,
  PromotionAction,
  PromotionFullState,
  PromotionFullView,
  PromotionOptions,
  Transfer,
  TransferReason,
} from './types.ts'

export const FULL_DICE = 4
/** A turn throws again while nothing scores, up to this many times; then it passes without a move */
export const MAX_THROWS = 3
/**
 * Since C8 a turn is one throw, as tradition plays it: no combination, no move. C6's three throws made
 * games too short once the second board's events and restorations came in (scripts/promotion-sim.ts)
 */
export const THROWS_V2 = 1
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

// ── C8 (rulesVersion 2) ──
/** What everyone not out of it pays the one who reaches grand congratulations (大賀), by tradition: the second board's `retire` */
export const DAHE_GIFT = 30
/** A purchased office costs this much a rank step (捐納), to the bank */
export const BUY_STEP = 5
/** What a capital official saves buying a provincial post, down to BUY_STEP at least */
export const BUY_DISCOUNT = 5
/** Honorary titles (兼銜) a seat may hold at once; each is a grade more in the comparison */
export const MAX_TITLES = 2
/** The rank below which a seat has no standing to buy office: a licentiate or a purchased studentship */
export const BUY_STANDING = 2
export const DEFAULT_DECISION_SECONDS = 30

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
 * The face a throw decides an event zone by (C8): its first move, four of a kind as de and four graft
 * as graft; null for a throw that scores nothing, after which the seat waits
 */
export function eventFace(reading: Reading): FullFace | null {
  const [first] = reading.steps
  if (first === undefined) return null
  if (first === 'fengjue') return 'de'
  if (first === 'dismiss') return 'zang'
  return first
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

/**
 * Whether a player holds what a cell requires. Since C8 a purchased office (捐班) is an irregular
 * route: it does not count as the regular route, whatever tribute degree came before it.
 */
export function meets(player: FullPlayer, requirement: Requirement): boolean {
  switch (requirement) {
    case 'zhengtu':
      return player.degree >= 1 && player.bought !== true
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
export function resolveCell(board: FullBoard, player: FullPlayer, id: string): string {
  let at = id
  for (let hop = 0; hop < 8; hop++) {
    const cell = board.get(at)
    if (cell.requires === null || meets(player, cell.requires)) return at
    at = cell.instead as string
  }
  throw new Error(`promotion: no way to land for "${id}"`)
}

/** Where one step from `from` (the player's cell unless given) leads, before any requirement */
export function stepTarget(
  board: FullBoard,
  player: FullPlayer,
  step: FullFace | 'dismiss',
  from: string = player.cell,
): string {
  if (step === 'dismiss') return DISMISSED
  const cell = board.get(from)
  const own = player.banner ? cell.banner?.[step] : undefined
  return own ?? cell.moves[step]
}

/** The rules a game since C8 plays by: its room options, with the defaults for anything missing */
export function fullRules(options: Partial<PromotionOptions>): FullRules {
  const seconds = options.decisionSeconds ?? DEFAULT_DECISION_SECONDS
  return {
    decisionMs: Math.round(seconds) * 1000,
    buying: options.buying ?? true,
    endAtDahe: options.endAtDahe ?? false,
  }
}

/** A turn's working copy: everything a turn changes, changed in place and then frozen into a state */
type Work = {
  board: FullBoard
  /** The second rules; null for a game from before C8 */
  rules: FullRules | null
  players: FullPlayer[]
  bank: number
  transfers: Transfer[]
  path: string[]
  throws: FullThrow[]
  pending: FullPending | null
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

/** Who pays a seat retiring here: since C8, 大賀 is owed by the exiled too, never by the dismissed */
function congratulates(work: Work, cell: FullCell, other: FullPlayer): boolean {
  if (work.rules === null || cell.id !== 'dahe') return other.status === 'active'
  if (other.status === 'out') return true
  return other.status === 'active' && other.cell !== DISMISSED
}

function land(work: Work, seat: SeatId, id: string) {
  const player = work.players[seat]
  const cell = work.board.get(id)
  // A dismissal remembers the post it took away, for the restoration; from an event zone, the post
  // the zone was reckoning
  if (work.rules !== null && id === DISMISSED) {
    player.post = work.board.get(player.cell).event !== null ? (player.post ?? player.cell) : player.cell
  }
  player.cell = id
  if (!cell.keepRank) player.rank = cell.rank
  if (cell.degree > player.degree) player.degree = cell.degree
  if (cell.wu) player.wu = true
  work.path.push(id)
  if (cell.money > 0) pay(work, null, seat, cell.money, 'reward')
  if (cell.money < 0) pay(work, seat, null, -cell.money, 'fee')
  if (work.rules !== null) {
    if (cell.title) player.titles = Math.min(MAX_TITLES, (player.titles ?? 0) + 1)
    if (id === 'juanban') player.bought = true
  }
  if (cell.retire !== null) {
    player.status = 'retired'
    for (const other of work.players) {
      if (other.seat !== seat && congratulates(work, cell, other)) pay(work, other.seat, seat, cell.retire, 'congrats')
    }
  }
  if (cell.out) {
    player.status = 'out'
    if (work.rules !== null) player.post = null
  }
}

/** The moves of a reading from where the player stands: four of a kind may become three de moves */
function expand(
  board: FullBoard,
  player: FullPlayer,
  steps: readonly FullStep[],
): (FullFace | 'dismiss' | 'fengjue')[] {
  if (steps[0] !== 'fengjue') return [...steps]
  return board.get(player.cell).fengjue === null ? ['de', 'de', 'de'] : ['fengjue']
}

/** Whether a seat may buy office (C8): a licentiate, a purchased studentship or better */
export const hasStanding = (player: FullPlayer): boolean =>
  player.rank >= BUY_STANDING || player.degree >= 1

/**
 * What a seat sent to the minor post `minor` from `from` could buy instead (捐納, C8): every office
 * on the two lists above the minor post, at BUY_STEP a rank step from it, a capital official saving
 * BUY_DISCOUNT on a provincial post; only what the seat can pay for now
 */
export function buyChoices(
  board: FullBoard,
  player: FullPlayer,
  minor: string,
  from: string,
): { cell: string; price: number }[] {
  if (!hasStanding(player)) return []
  const base = board.get(minor).rank
  const capital = FULL_DEPARTMENTS[board.get(from).dept].section === 'capital'
  const choices: { cell: string; price: number }[] = []
  for (const id of [...BUY_CAPITAL, ...BUY_PROVINCES]) {
    const rank = board.get(id).rank
    if (rank <= base) continue
    let price = BUY_STEP * (rank - base)
    if (capital && BUY_PROVINCES.includes(id)) price = Math.max(BUY_STEP, price - BUY_DISCOUNT)
    if (price <= player.money) choices.push({ cell: id, price })
  }
  return choices
}

/**
 * Where a dismissed seat is restored to (開復) by talent: the next post down in the post's own
 * department, at most a grade (two ranks) lower; the post itself when there is none
 */
export function lowerPost(board: FullBoard, post: string): string {
  const held = board.get(post)
  const below = board.cells.filter(
    (entry) => entry.dept === held.dept && entry.rank < held.rank && entry.rank >= held.rank - 2,
  )
  return below.reduce<FullCell | null>((best, entry) => (best && best.rank >= entry.rank ? best : entry), null)
    ?.id ?? post
}

/**
 * The second rules' restoration (開復) for a dismissed seat: up to `throws` throws until one scores.
 * Virtue restores the post held, talent the next post down (`lowerPost`), three or four graft send
 * the seat to the frontier (長戍, out); anything else keeps it waiting for its next turn
 */
function restore(work: Work, seat: SeatId, rng: Rng, throws: number) {
  const player = work.players[seat]
  const post = player.post ?? null
  for (let at = 0; at < throws; at++) {
    const dice = throwDice(rng)
    const reading = readThrow(dice)
    const face = eventFace(reading)
    work.throws.push({ ...reading, dice, event: { cell: DISMISSED, face } })
    if (face === null) continue
    if (face === 'zang') {
      // A pair of graft is only more waiting; three or four of them, exile
      if (reading.combo === 'three' || reading.combo === 'allGraft') {
        land(work, seat, stepTarget(work.board, player, 'zang'))
      }
    } else if ((face === 'de' || face === 'cai') && post !== null) {
      player.post = null
      const target = face === 'de' ? post : lowerPost(work.board, post)
      land(work, seat, resolveCell(work.board, player, target))
    }
    return
  }
}

/**
 * The second rules' throw for an event zone, from the post held: up to `throws` throws until one
 * scores, whose face's outcome then applies. Nothing scoring leaves the seat waiting in the zone
 */
function decideEvent(work: Work, seat: SeatId, rng: Rng, throws: number) {
  const player = work.players[seat]
  const zone = work.board.get(player.cell)
  const post = player.post ?? FULL_START
  for (let at = 0; at < throws; at++) {
    const dice = throwDice(rng)
    const reading = readThrow(dice)
    const face = eventFace(reading)
    work.throws.push({ ...reading, dice, event: { cell: zone.id, face } })
    if (face === null) continue
    const outcome = (zone.event as NonNullable<FullCell['event']>)[face]
    const held = work.board.get(post)
    let target: string
    switch (outcome.go) {
      case 'up2':
        target = stepTarget(work.board, player, 'de', post)
        break
      case 'up1':
        target = stepTarget(work.board, player, 'cai', post)
        break
      case 'stay':
        target = post
        break
      case 'down':
        target = held.demote ?? stepTarget(work.board, player, 'zang', post)
        break
      case 'dismiss':
        target = DISMISSED
        break
    }
    // An outcome never leads into another zone: back to the post instead
    if (work.board.get(target).event !== null) target = post
    if (outcome.money > 0) pay(work, null, seat, outcome.money, 'reward')
    if (outcome.title) player.titles = Math.min(MAX_TITLES, (player.titles ?? 0) + 1)
    // A dismissal keeps the post for its restoration (`land`)
    if (target !== DISMISSED) player.post = null
    land(work, seat, resolveCell(work.board, player, target))
    return
  }
}

/**
 * Moves a reading's steps. Under the second rules a step stops the move when it reaches an event
 * zone (thrown for at once), an offered post from anywhere but another offered post, or a minor post
 * from another department that the seat could buy its way out of (both then wait for an answer)
 */
function move(work: Work, seat: SeatId, steps: readonly FullStep[], rng: Rng) {
  const player = work.players[seat]
  const { board, rules } = work
  for (const step of expand(board, player, steps)) {
    if (player.status !== 'active') return
    // Nobody is dismissed from an origin: there is no post to take away, and no way back to one
    if (rules !== null && step === 'dismiss' && board.get(player.cell).dept === 'origin') return
    const raw = step === 'fengjue' ? (board.get(player.cell).fengjue as string) : stepTarget(board, player, step)
    const id = resolveCell(board, player, raw)
    if (rules !== null) {
      const cell = board.get(id)
      const here = board.get(player.cell)
      if (cell.event !== null) {
        player.post = player.cell
        land(work, seat, id)
        decideEvent(work, seat, rng, 1)
        return
      }
      if (cell.offer && !here.offer) {
        work.pending = { kind: 'offer', seat, cell: id, from: player.cell }
        return
      }
      if (cell.minor && rules.buying && cell.dept !== here.dept) {
        const choices = buyChoices(board, player, id, player.cell)
        if (choices.length > 0) {
          work.pending = { kind: 'buy', seat, cell: id, from: player.cell, choices }
          return
        }
      }
    }
    land(work, seat, id)
    if (player.cell !== id) return
  }
}

/** A junior landing where a senior serves pays the senior; once per senior, for the final cell */
function courtesy(work: Work, seat: SeatId) {
  const player = work.players[seat]
  if (player.status !== 'active') return
  const dept = work.board.get(player.cell).dept
  if (!FULL_DEPARTMENTS[dept].courtesy) return
  for (const other of work.players) {
    if (other.seat === seat || other.status !== 'active') continue
    if (work.board.get(other.cell).dept !== dept || other.rank === player.rank) continue
    if (other.rank > player.rank) pay(work, seat, other.seat, COURTESY, 'courtesy')
    else pay(work, other.seat, seat, COURTESY, 'courtesy')
  }
}

const throwDice = (rng: Rng) => Array.from({ length: FULL_DICE }, () => rng.int(6) + 1)

/**
 * The grade a seat is compared at in the end: nothing for one put out. Since C8 each honorary title
 * adds one, below grand congratulations
 */
export function finalGrade(player: FullPlayer, version: number | undefined = 1): number {
  if (player.status === 'out') return 0
  const grade = gradeOf(player.rank)
  if (version !== 2 || grade >= 13) return grade
  return Math.min(12, grade + (player.titles ?? 0))
}

/** Rank comparison between every two seats, then the bank split evenly, the remainder to the poorest */
function settle(
  players: FullPlayer[],
  bank: number,
  version: number | undefined,
): { players: FullPlayer[]; settlement: FullSettlement } {
  const after = players.map((player) => ({ ...player }))
  const duipin = players.map(() => 0)
  const grades = players.map((player) => finalGrade(player, version))
  for (let a = 0; a < players.length; a++) {
    for (let b = a + 1; b < players.length; b++) {
      const gap = grades[a] - grades[b]
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
        grade: grades[at],
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
  const { players, settlement } = settle(state.players, state.bank, state.rulesVersion)
  return { ...state, players, bank: 0, turn: null, ending, settlement }
}

/** Hands the turn on to the next seat still playing, or ends the game */
function advance(state: PromotionFullState, from: SeatId): PromotionFullState {
  if (state.rules?.endAtDahe && state.players.some((player) => player.cell === 'dahe')) {
    return finish(state, 'dahe')
  }
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

function newPlayers(seats: readonly Seat[]): FullPlayer[] {
  return seats.map((seat) => ({
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
  }))
}

/**
 * A game under C6's rules, as every game before C8 started: no longer made by the room (`initFull`
 * makes the second rules'), but what the tests start a first-rules game with
 */
export function initFullV1(seats: readonly Seat[], rng: Rng): PromotionFullState {
  const first = rng.pick(seats).id
  return {
    edition: 'full',
    players: newPlayers(seats),
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

/** A new full-edition game: the latest rules, with the room's full-edition options */
export function initFull(
  seats: readonly Seat[],
  rng: Rng,
  options: Partial<PromotionOptions> = {},
): PromotionFullState {
  const state = initFullV1(seats, rng)
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, bought: false, titles: 0, post: null })),
    rulesVersion: LATEST_RULES,
    rules: fullRules(options),
    pending: null,
    decisions: 0,
    acts: 0,
  }
}

const work = (state: PromotionFullState): Work => ({
  board: fullBoard(state.rulesVersion),
  rules: state.rulesVersion === 2 ? (state.rules ?? fullRules({})) : null,
  players: state.players.map((player) => ({ ...player })),
  bank: state.bank,
  transfers: [],
  path: [],
  throws: [],
  pending: null,
})

/** What the room does for a seat that does not answer: the post is declined, the minor post taken */
export function defaultDecision(pending: FullPending): PromotionAction {
  return pending.kind === 'offer' ? { type: 'decline' } : { type: 'skip' }
}

/** The answers a decision takes */
export function decisionActions(pending: FullPending): PromotionAction[] {
  return pending.kind === 'offer'
    ? [{ type: 'accept' }, { type: 'decline' }]
    : [{ type: 'skip' }, ...pending.choices.map((choice) => ({ type: 'buy' as const, cell: choice.cell }))]
}

/** The answer to the pending decision: checked, then played, then the turn is handed on */
function decide(
  state: PromotionFullState,
  pending: FullPending,
  action: PromotionAction,
  actor: SeatId | 'system',
): PromotionFullState | GameError {
  const timedOut = actor === 'system'
  // The room only ever answers with the default (a timer, or a seat covered for)
  const answer = action.type === 'pass' ? defaultDecision(pending) : action
  if (timedOut && answer.type !== defaultDecision(pending).type) {
    return gameError('games.promotion.error.notYourTurn')
  }
  if (!timedOut && actor !== pending.seat) return gameError('games.promotion.error.notYourTurn')

  const w = work(state)
  const seat = pending.seat
  const player = w.players[seat]
  const from = player.cell
  let decision: FullDecision
  if (pending.kind === 'offer') {
    if (answer.type !== 'accept' && answer.type !== 'decline') {
      return gameError('games.promotion.error.decide')
    }
    if (answer.type === 'accept') land(w, seat, resolveCell(w.board, player, pending.cell))
    decision = { kind: answer.type, cell: pending.cell, price: 0, timedOut }
  } else if (answer.type === 'skip') {
    land(w, seat, pending.cell)
    decision = { kind: 'skip', cell: pending.cell, price: 0, timedOut }
  } else if (answer.type === 'buy') {
    const choice = pending.choices.find((entry) => entry.cell === answer.cell)
    if (choice === undefined) return gameError('games.promotion.error.badBuy')
    if (choice.price > player.money) return gameError('games.promotion.error.cannotAfford')
    pay(w, seat, null, choice.price, 'buy')
    player.bought = true
    land(w, seat, resolveCell(w.board, player, choice.cell))
    decision = { kind: 'buy', cell: choice.cell, price: choice.price, timedOut }
  } else {
    return gameError('games.promotion.error.decide')
  }
  courtesy(w, seat)
  const last: FullLastTurn = {
    seat,
    birth: false,
    throws: [],
    from,
    path: w.path,
    transfers: w.transfers,
    decision,
  }
  const next: PromotionFullState = {
    ...state,
    players: w.players,
    bank: w.bank,
    last,
    pending: null,
    acts: (state.acts ?? 0) + 1,
  }
  return advance(next, seat)
}

const DECISIONS = new Set(['accept', 'decline', 'skip', 'buy'])

export function reduceFull(
  state: PromotionFullState,
  action: PromotionAction,
  actor: SeatId | 'system',
  rng: Rng,
): PromotionFullState | GameError {
  if (state.turn === null) return gameError('games.promotion.error.over')
  const pending = state.pending ?? null
  if (pending !== null && (action.type === 'pass' || DECISIONS.has(action.type))) {
    return decide(state, pending, action, actor)
  }
  if (DECISIONS.has(action.type)) return gameError('games.promotion.error.nothingToDecide')
  if (action.type === 'pass') {
    if (actor !== 'system') return gameError('games.promotion.error.notYourTurn')
    return advance(state, state.turn)
  }
  if (actor !== state.turn) return gameError('games.promotion.error.notYourTurn')
  if (pending !== null) return gameError('games.promotion.error.decide')

  const seat = actor
  const w = work(state)
  const player = w.players[seat]
  const from = player.cell
  const held = w.board.get(from)
  const birth = player.origin === null
  player.rolls += 1

  if (birth) {
    const dice = throwDice(rng)
    const { combo } = readThrow(dice, true)
    const { origin, banner } = birthOf(dice)
    w.throws.push({ dice, combo, steps: [] })
    player.origin = origin
    player.banner = banner
    land(w, seat, origin)
  } else if (w.rules !== null && held.event !== null) {
    // Waiting in an event zone: this turn's throws decide it
    decideEvent(w, seat, rng, THROWS_V2)
    courtesy(w, seat)
  } else if (w.rules !== null && from === DISMISSED) {
    restore(w, seat, rng, THROWS_V2)
    courtesy(w, seat)
  } else {
    const tries = w.rules === null ? MAX_THROWS : THROWS_V2
    for (let at = 0; at < tries; at++) {
      const dice = throwDice(rng)
      const reading = readThrow(dice)
      w.throws.push({ dice, ...reading })
      if (reading.steps.length === 0) continue
      // Graft while holding a commission costs its fine (C8)
      if (w.rules !== null && held.fine > 0 && reading.steps.some((s) => s === 'zang' || s === 'dismiss')) {
        pay(w, seat, null, held.fine, 'fine')
      }
      move(w, seat, reading.steps, rng)
      if (reading.combo === 'run') pay(w, null, seat, RUN_REWARD, 'run')
      if (w.pending === null) courtesy(w, seat)
      break
    }
  }

  // C6's `last` had no `decision`, and its throws no `event`: a first-rules game keeps that shape
  const throws = w.rules === null ? w.throws.map(({ dice, combo, steps }) => ({ dice, combo, steps })) : w.throws
  const next: PromotionFullState = {
    ...state,
    players: w.players,
    bank: w.bank,
    last: { seat, birth, throws, from, path: w.path, transfers: w.transfers },
  }
  if (w.rules === null) return advance(next, seat)
  const counted = { ...next, acts: (state.acts ?? 0) + 1 }
  if (w.pending !== null) {
    return { ...counted, pending: w.pending, decisions: (state.decisions ?? 0) + 1 }
  }
  return advance(counted, seat)
}

export const viewFull = (state: PromotionFullState, you: SeatId | null): PromotionFullView => ({
  ...state,
  you,
})

/** What `seat` may do: answer its decision, or roll on its turn */
export function legalFull(state: PromotionFullState, seat: SeatId): PromotionAction[] {
  if (state.turn === null) return []
  const pending = state.pending ?? null
  if (pending !== null) return pending.seat === seat ? decisionActions(pending) : []
  return state.turn === seat ? [{ type: 'roll' }] : []
}

/** The countdown for a decision: when it runs out, the room answers with the default */
export function timersFull(state: PromotionFullState) {
  const pending = state.pending ?? null
  if (pending === null || state.turn === null) return []
  return [
    {
      id: `decide-${state.decisions ?? 0}`,
      ms: (state.rules ?? fullRules({})).decisionMs,
      action: defaultDecision(pending),
    },
  ]
}

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
