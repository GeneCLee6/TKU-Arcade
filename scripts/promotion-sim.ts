// `npm run sim:promotion -- [--games <n>] [--seats 2,4,6] [--seconds 15] [--accept 0.7] [--buy 0.6]
// [--decide 8] [--rules 1|2] [--no-buying] [--end-at-dahe]`: plays many seeded games of
// promotion's full edition and prints how long they run and how the board is used: rounds, turns and
// minutes per game, how careers end, origins, silver at the end, how often each cell is reached, the
// longest any seat stood still, and (the second rules, C8) how often each choice and event comes up.
// The tuning in docs/PRD/e3-promotion-board.md ("完整版規則細節") comes from this script. Seeds run
// 1..n, so a run can be repeated exactly.
//
// The bots (C8): an offered post is accepted with probability `--accept`; at a minor post a bot buys
// with probability `--buy`, the dearest office it can pay for keeping 30 silver back, else takes the
// post. A decision counts as `--decide` seconds more on the clock.
import { parseArgs } from 'node:util'
import { applyAction, makeSeats, startMatch, type Match } from '../shared/games/match.ts'
import { fullBoard } from '../shared/games/promotion/boardFull.ts'
import { DEFAULT_TURN_LIMIT, promotion } from '../shared/games/promotion/rules.ts'
import { initFullV1 } from '../shared/games/promotion/rulesFull.ts'
import type {
  PromotionAction,
  PromotionAnyState,
  PromotionFullState,
  PromotionOptions,
} from '../shared/games/promotion/types.ts'
import { createRng, type SeededRng } from '../shared/games/rng.ts'
import { isGameError } from '../shared/games/types.ts'

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '400' },
    seats: { type: 'string', default: '2,3,4,5,6' },
    seconds: { type: 'string', default: '15' },
    accept: { type: 'string', default: '0.7' },
    buy: { type: 'string', default: '0.6' },
    decide: { type: 'string', default: '8' },
    rules: { type: 'string', default: '2' },
    'no-buying': { type: 'boolean', default: false },
    'end-at-dahe': { type: 'boolean', default: false },
  },
})
const GAMES = Number(values.games)
const SEATS = values.seats.split(',').map(Number)
const SECONDS = Number(values.seconds)
const ACCEPT = Number(values.accept)
const BUY = Number(values.buy)
const DECIDE_SECONDS = Number(values.decide)
const VERSION = values.rules === '1' ? 1 : 2
const BOARD = fullBoard(VERSION)
const KEEP_BACK = 30

const OPTIONS: PromotionOptions = {
  dice: 'six-sided',
  turnLimit: DEFAULT_TURN_LIMIT,
  edition: 'full',
  decisionSeconds: 30,
  buying: !values['no-buying'],
  endAtDahe: values['end-at-dahe'],
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
const sortNum = (list: number[]) => [...list].sort((a, b) => a - b)
const spread = (list: number[]) => {
  const s = sortNum(list)
  return `p10 ${pct(s, 0.1)} · median ${pct(s, 0.5)} · p90 ${pct(s, 0.9)} · max ${s[s.length - 1]}`
}
const share = (part: number, whole: number) => `${((part / Math.max(whole, 1)) * 100).toFixed(1)}%`

/** How often each choice and event came up, over a set of games */
type Tally = Record<string, number>
const bump = (tally: Tally, key: string, by = 1) => (tally[key] = (tally[key] ?? 0) + by)

type Game = {
  state: PromotionFullState
  turns: number
  decisions: number
  longestStill: number
  sumBroken: boolean
}

function start(seats: number, seed: number): Match<PromotionAnyState> {
  if (VERSION === 2) return startMatch(promotion, makeSeats(seats), OPTIONS, seed)
  const rng = createRng(seed)
  const state = initFullV1(makeSeats(seats), rng)
  return { state, rngState: rng.state() }
}

/** What a bot answers, or rolls */
function botAction(state: PromotionFullState, bots: SeededRng): PromotionAction {
  const pending = state.pending ?? null
  if (pending === null) return { type: 'roll' }
  if (pending.kind === 'offer') return bots.float() < ACCEPT ? { type: 'accept' } : { type: 'decline' }
  const money = state.players[pending.seat].money
  const affordable = pending.choices.filter((choice) => choice.price <= money - KEEP_BACK)
  if (affordable.length > 0 && bots.float() < BUY) {
    return { type: 'buy', cell: (affordable.at(-1) as { cell: string }).cell }
  }
  return { type: 'skip' }
}

function play(seats: number, seed: number, tally: Tally, reached?: Map<string, number>): Game {
  let match = start(seats, seed)
  const bots = createRng(seed * 7919 + 13)
  const total = 200 * seats
  let turns = 0
  let decisions = 0
  let longestStill = 0
  let sumBroken = false
  const still = new Map<number, { cell: string; turns: number }>()
  while (!promotion.isOver(match.state)) {
    const before = match.state as PromotionFullState
    const pending = before.pending ?? null
    const seat = pending?.seat ?? (before.turn as number)
    const action = botAction(before, bots)
    const next = applyAction(promotion, match, action, seat)
    if (isGameError(next)) throw new Error(`seed ${seed}: ${next.gameError}`)
    match = next
    const state = match.state as PromotionFullState
    const sum = state.bank + state.players.reduce((all, player) => all + player.money, 0)
    if (sum !== total) sumBroken = true
    const last = state.last
    for (const id of last?.path ?? []) reached?.set(id, (reached.get(id) ?? 0) + 1)
    for (const transfer of last?.transfers ?? []) {
      if (transfer.why === 'fine') bump(tally, 'commission fines')
    }
    if (action.type === 'roll') {
      turns += 1
      const cell = state.players[seat].cell
      const was = still.get(seat)
      const run = was && was.cell === cell ? was.turns + 1 : 1
      still.set(seat, { cell, turns: run })
      longestStill = Math.max(longestStill, run)
      for (const thrown of last?.throws ?? []) {
        if (!thrown.event) continue
        bump(tally, `event throws at ${thrown.event.cell}`)
        if (thrown.event.face === null) bump(tally, `waits at ${thrown.event.cell}`)
      }
      if (state.pending) bump(tally, `asked: ${state.pending.kind} (${state.pending.cell})`)
    } else {
      decisions += 1
      bump(tally, `answered: ${action.type}`)
    }
  }
  const state = match.state as PromotionFullState
  for (const player of state.players) {
    bump(tally, `titles held at the end: ${player.titles ?? 0}`)
    if (player.bought) bump(tally, 'seats ending on a bought office (捐班)')
  }
  return { state, turns, decisions, longestStill, sumBroken }
}

const origins = new Map<string, number>()
let banner = 0
let seatsSeen = 0

console.log(
  `promotion, full edition (rules ${VERSION}): ${GAMES} games per table, ${SECONDS} s a turn, ` +
    `${DECIDE_SECONDS} s a decision; bots accept ${ACCEPT}, buy ${BUY}; ` +
    `buying ${OPTIONS.buying ? 'on' : 'off'}` +
    `${OPTIONS.endAtDahe ? ', ends at the first 大賀' : ''}\n`,
)
for (const seats of SEATS) {
  const games: Game[] = []
  const tally: Tally = {}
  for (let seed = 1; seed <= GAMES; seed++) games.push(play(seats, seed, tally))
  const ends = new Map<string, number>()
  const careers: number[] = []
  const money: number[] = []
  const margins: number[] = []
  let atLimit = 0
  let broken = 0
  for (const { state, sumBroken } of games) {
    if (state.ending === 'turnLimit') atLimit += 1
    if (sumBroken) broken += 1
    const finals = sortNum(state.players.map((player) => player.money)).reverse()
    margins.push(finals[0] - finals[1])
    for (const player of state.players) {
      seatsSeen += 1
      if (player.banner) banner += 1
      origins.set(player.origin ?? 'none', (origins.get(player.origin ?? 'none') ?? 0) + 1)
      const end =
        player.status === 'active' ? 'still playing' : player.status === 'out' ? 'exiled' : player.cell
      ends.set(end, (ends.get(end) ?? 0) + 1)
      if (player.status !== 'active') careers.push(player.rolls)
      money.push(player.money)
    }
  }
  const rounds = games.map((game) => game.state.round)
  const turns = games.map((game) => game.turns)
  const minutes = games.map((game) => Math.round((game.turns * SECONDS + game.decisions * DECIDE_SECONDS) / 60))
  console.log(`── ${seats} seats ──`)
  console.log(`  rounds          ${spread(rounds)}`)
  console.log(`  turns           ${spread(turns)}`)
  console.log(`  minutes         ${spread(minutes)}`)
  console.log(`  career (rolls)  ${careers.length > 0 ? spread(careers) : 'nobody retired'}`)
  console.log(`  longest still   ${spread(games.map((game) => game.longestStill))}`)
  console.log(`  round limit     ${share(atLimit, games.length)} of games`)
  console.log(`  silver at end   ${spread(money)} · min ${Math.min(...money)}`)
  console.log(`  winner's margin ${spread(margins)}`)
  console.log(`  money conserved ${broken === 0 ? 'yes, every action of every game' : `NO in ${broken} games`}`)
  const total = [...ends.values()].reduce((a, b) => a + b, 0)
  console.log(
    `  careers end     ${[...ends.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([end, count]) => `${end} ${share(count, total)}`)
      .join(' · ')}`,
  )
  if (VERSION === 2) {
    const perGame = (key: string) => ((tally[key] ?? 0) / games.length).toFixed(2)
    const keys = Object.keys(tally).sort()
    const asked = keys.filter((key) => key.startsWith('asked: '))
    const sum = (list: string[]) => list.reduce((all, key) => all + (tally[key] ?? 0), 0)
    const kind = (name: string) => (sum(asked.filter((key) => key.startsWith(`asked: ${name}`))) / games.length).toFixed(2)
    console.log(`  choices and events, per game:`)
    console.log(
      `    offers ${kind('offer')} (accepted ${perGame('answered: accept')}, declined ${perGame('answered: decline')})` +
        ` · buy prompts ${kind('buy')} (bought ${perGame('answered: buy')}, took the post ${perGame('answered: skip')})`,
    )
    console.log(`    by cell: ${asked.map((key) => `${key.slice(7)} ${perGame(key)}`).join(' · ')}`)
    const events = keys.filter((key) => key.startsWith('event throws at '))
    console.log(
      `    event throws: ${events
        .map((key) => {
          const cell = key.slice('event throws at '.length)
          return `${cell} ${perGame(key)} (waits ${perGame(`waits at ${cell}`)})`
        })
        .join(' · ')}`,
    )
    console.log(
      `    commission fines ${perGame('commission fines')} · ` +
        `seats on a bought office at the end ${perGame('seats ending on a bought office (捐班)')} · ` +
        `titles at the end ${[0, 1, 2].map((n) => `${n}: ${perGame(`titles held at the end: ${n}`)}`).join(', ')}`,
    )
  }
  console.log('')
}

// Cell reach: a fresh set at 4 seats, counting every cell landed on
const reached = new Map<string, number>(BOARD.cells.map((cell) => [cell.id, 0]))
for (let seed = 1; seed <= GAMES; seed++) play(4, seed + 1_000_000, {}, reached)
const landings = [...reached.values()].reduce((a, b) => a + b, 0)
const byCount = [...reached.entries()].sort((a, b) => a[1] - b[1])
const never = byCount.filter(([, count]) => count === 0).map(([id]) => id)
console.log(`── cells (${BOARD.cells.length}), 4 seats, ${GAMES} games, ${landings} landings ──`)
console.log(`  never reached   ${never.length === 0 ? 'none' : never.join(', ')}`)
console.log(`  rarest 12       ${byCount.slice(0, 12).map(([id, count]) => `${id} ${count}`).join(' · ')}`)
console.log(`  busiest 8       ${byCount.slice(-8).reverse().map(([id, count]) => `${id} ${count}`).join(' · ')}`)
console.log(
  `  origins         ${[...origins.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${id} ${share(count, seatsSeen)}`)
    .join(' · ')} · Banner ${share(banner, seatsSeen)}`,
)
