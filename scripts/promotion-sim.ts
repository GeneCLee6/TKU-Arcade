// `npm run sim:promotion -- [--games <n>] [--seats 2,4,6] [--seconds 15]`: plays many seeded games
// of promotion's full edition (C6) and prints how long they run and how the board is used: rounds,
// turns and minutes per game, how careers end, origins, silver at the end, how often each cell is
// reached, and the longest any seat stood still. The tuning in docs/PRD/e3-promotion-board.md
// ("完整版規則細節") comes from this script. Seeds run 1..n, so a run can be repeated exactly.
import { parseArgs } from 'node:util'
import { applyAction, makeSeats, startMatch, type Match } from '../shared/games/match.ts'
import { BOARD_FULL } from '../shared/games/promotion/boardFull.ts'
import { DEFAULT_TURN_LIMIT, promotion } from '../shared/games/promotion/rules.ts'
import type { PromotionAnyState, PromotionFullState } from '../shared/games/promotion/types.ts'
import { isGameError } from '../shared/games/types.ts'

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '400' },
    seats: { type: 'string', default: '2,3,4,5,6' },
    seconds: { type: 'string', default: '15' },
  },
})
const GAMES = Number(values.games)
const SEATS = values.seats.split(',').map(Number)
const SECONDS = Number(values.seconds)

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
const sortNum = (list: number[]) => [...list].sort((a, b) => a - b)
const spread = (list: number[]) => {
  const s = sortNum(list)
  return `p10 ${pct(s, 0.1)} · median ${pct(s, 0.5)} · p90 ${pct(s, 0.9)} · max ${s[s.length - 1]}`
}
const share = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`

type Game = {
  state: PromotionFullState
  turns: number
  longestStill: number
  sumBroken: boolean
}

function play(seats: number, seed: number): Game {
  let match: Match<PromotionAnyState> = startMatch(
    promotion,
    makeSeats(seats),
    { dice: 'six-sided', turnLimit: DEFAULT_TURN_LIMIT, edition: 'full' },
    seed,
  )
  const total = 200 * seats
  let turns = 0
  let longestStill = 0
  let sumBroken = false
  const still = new Map<number, { cell: string; turns: number }>()
  while (!promotion.isOver(match.state)) {
    const seat = match.state.turn as number
    const next = applyAction(promotion, match, { type: 'roll' }, seat)
    if (isGameError(next)) throw new Error(`seed ${seed}: ${next.gameError}`)
    match = next
    turns += 1
    const state = match.state as PromotionFullState
    const sum = state.bank + state.players.reduce((all, player) => all + player.money, 0)
    if (sum !== total) sumBroken = true
    const cell = state.players[seat].cell
    const before = still.get(seat)
    const run = before && before.cell === cell ? before.turns + 1 : 1
    still.set(seat, { cell, turns: run })
    longestStill = Math.max(longestStill, run)
  }
  return { state: match.state as PromotionFullState, turns, longestStill, sumBroken }
}

const reached = new Map<string, number>(BOARD_FULL.map((cell) => [cell.id, 0]))
const origins = new Map<string, number>()
let banner = 0
let seatsSeen = 0

console.log(`promotion, full edition: ${GAMES} games per table, ${SECONDS} s a turn\n`)
for (const seats of SEATS) {
  const games: Game[] = []
  for (let seed = 1; seed <= GAMES; seed++) {
    const game = play(seats, seed)
    games.push(game)
  }
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
  const minutes = turns.map((count) => Math.round((count * SECONDS) / 60))
  console.log(`── ${seats} seats ──`)
  console.log(`  rounds          ${spread(rounds)}`)
  console.log(`  turns           ${spread(turns)}`)
  console.log(`  minutes         ${spread(minutes)}`)
  console.log(`  career (rolls)  ${spread(careers)}`)
  console.log(`  longest still   ${spread(games.map((game) => game.longestStill))}`)
  console.log(`  round limit     ${share(atLimit, games.length)} of games`)
  console.log(`  silver at end   ${spread(money)} · min ${Math.min(...money)}`)
  console.log(`  winner's margin ${spread(margins)}`)
  console.log(`  money conserved ${broken === 0 ? 'yes, every turn of every game' : `NO in ${broken} games`}`)
  const total = [...ends.values()].reduce((a, b) => a + b, 0)
  console.log(
    `  careers end     ${[...ends.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([end, count]) => `${end} ${share(count, total)}`)
      .join(' · ')}`,
  )
  console.log('')
}

// Cell reach: replay a fresh set at 4 seats, counting every cell landed on
let landings = 0
for (let seed = 1; seed <= GAMES; seed++) {
  let match: Match<PromotionAnyState> = startMatch(
    promotion,
    makeSeats(4),
    { dice: 'six-sided', turnLimit: DEFAULT_TURN_LIMIT, edition: 'full' },
    seed + 1_000_000,
  )
  while (!promotion.isOver(match.state)) {
    const next = applyAction(promotion, match, { type: 'roll' }, match.state.turn as number)
    if (isGameError(next)) throw new Error(next.gameError)
    match = next
    const last = (match.state as PromotionFullState).last
    for (const id of last?.path ?? []) {
      reached.set(id, (reached.get(id) ?? 0) + 1)
      landings += 1
    }
  }
}
const byCount = [...reached.entries()].sort((a, b) => a[1] - b[1])
const never = byCount.filter(([, count]) => count === 0).map(([id]) => id)
console.log(`── cells (${BOARD_FULL.length}), 4 seats, ${GAMES} games, ${landings} landings ──`)
console.log(`  never reached   ${never.length === 0 ? 'none' : never.join(', ')}`)
console.log(`  rarest 12       ${byCount.slice(0, 12).map(([id, count]) => `${id} ${count}`).join(' · ')}`)
console.log(`  busiest 8       ${byCount.slice(-8).reverse().map(([id, count]) => `${id} ${count}`).join(' · ')}`)
console.log(
  `  origins         ${[...origins.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${id} ${share(count, seatsSeen)}`)
    .join(' · ')} · Banner ${share(banner, seatsSeen)}`,
)
