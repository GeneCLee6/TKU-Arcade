// `npm run sim:traders [-- --games <n>] [--seed <n>]`: plays Tamsui Traders with greedy bots through
// the real module (shared/games/traders/rules.ts) and reports how long games last, how they end and
// how often each place in the turn order wins. The card set's balance numbers in
// docs/PRD/e22-tamsui-traders.md come from this script.
//
// The bot is deliberately simple: buy the best card it can afford; otherwise pick the card it is
// closest to (points and patron progress per missing token) and take the goods it lacks; reserve a
// strong card when the goods on offer do not help or its hand is nearly full of tokens.
import { parseArgs } from 'node:util'
import { createRng } from '../shared/games/rng.ts'
import { makeSeats } from '../shared/games/match.ts'
import { isGameError, type Rng } from '../shared/games/types.ts'
import { bonusesOf, cardOf, GOLD, patronOf, pointsOf, traders } from '../shared/games/traders/rules.ts'
import type { TradersAction, TradersCard, TradersPlayer, TradersState } from '../shared/games/traders/types.ts'

const { values } = parseArgs({ options: { games: { type: 'string' }, seed: { type: 'string' } } })
const GAMES = Number(values.games ?? 2000)
const SEED = Number(values.seed ?? 1)

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

/** Tokens still missing for `card`, after bonuses, tokens and gold */
function shortfall(card: TradersCard, player: TradersPlayer): number[] {
  const bonuses = bonusesOf(player)
  return card.cost.map((cost, good) => Math.max(0, cost - bonuses[good] - player.tokens[good]))
}

/** How much a card is worth to this seat: points, plus how much closer it brings a patron */
function worth(state: TradersState, player: TradersPlayer, card: TradersCard): number {
  const bonuses = bonusesOf(player)
  const helpsPatron = state.patrons.some((id) => patronOf(id).need[card.bonus] > bonuses[card.bonus])
  return card.points * 1.6 + (helpsPatron ? 0.9 : 0.4) + (pointsOf(player) < 6 ? 0.3 : 0)
}

/** The card this seat should save up for: worth per missing token, gold counted */
function target(state: TradersState, player: TradersPlayer): TradersCard | null {
  const cards = [
    ...state.market.flat().filter((id): id is string => id !== null),
    ...player.reserved.map((held) => held.id),
  ].map(cardOf)
  let best: TradersCard | null = null
  let bestScore = -Infinity
  for (const card of cards) {
    const missing = Math.max(0, sum(shortfall(card, player)) - player.tokens[GOLD])
    const score = worth(state, player, card) / (missing + 1.5)
    if (score > bestScore) {
      best = card
      bestScore = score
    }
  }
  return best
}

function choose(state: TradersState, legal: TradersAction[], rng: Rng): TradersAction {
  const player = state.players[state.turn]
  if (legal.length === 1) return legal[0]

  if (state.phase === 'return') {
    const goal = target(state, player)
    const need = goal === null ? [0, 0, 0, 0, 0] : shortfall(goal, { ...player, tokens: [0, 0, 0, 0, 0, 0] })
    // Put back what the goal needs least; gold last
    const scored = legal
      .filter((action): action is Extract<TradersAction, { type: 'return' }> => action.type === 'return')
      .map((action) => ({
        action,
        surplus: action.good === GOLD ? -99 : player.tokens[action.good] - (need[action.good] ?? 0),
      }))
    scored.sort((a, b) => b.surplus - a.surplus)
    return scored[0].action
  }

  const buys = legal.filter((action): action is Extract<TradersAction, { type: 'buy' }> => action.type === 'buy')
  if (buys.length > 0) {
    const scored = buys.map((action) => {
      const card = cardOf(action.card)
      return { action, score: worth(state, player, card) - sum(card.cost) * 0.05 }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored[0].action
  }

  const goal = target(state, player)
  const need = goal === null ? [0, 0, 0, 0, 0] : shortfall(goal, player)
  const tokens = sum(player.tokens)

  const reserveGoal =
    goal !== null &&
    player.reserved.length < 3 &&
    !player.reserved.some((held) => held.id === goal.id) &&
    legal.find((action) => action.type === 'reserve' && action.card === goal.id)

  const takes = legal.filter((action) => action.type === 'take' || action.type === 'double')
  const useful = (action: TradersAction): number => {
    const goods = action.type === 'take' ? action.goods : action.type === 'double' ? [action.good, action.good] : []
    let gain = 0
    const left = [...need]
    for (const good of goods) {
      if (left[good] > 0) {
        gain += 1
        left[good] -= 1
      } else gain += 0.15
    }
    return gain + rng.float() * 0.01
  }
  const bestTake = takes.reduce<TradersAction | null>(
    (best, action) => (best === null || useful(action) > useful(best) ? action : best),
    null,
  )

  if (reserveGoal && (tokens >= 8 || bestTake === null || useful(bestTake) < 1.1) && goal !== null && goal.points >= 2) {
    return reserveGoal
  }
  if (bestTake !== null && useful(bestTake) >= 1) return bestTake
  if (reserveGoal) return reserveGoal
  if (bestTake !== null) return bestTake
  return rng.pick(legal)
}

type Report = { rounds: number[]; wins: number[]; ends: Record<string, number>; winnerPoints: number[]; patrons: number }

function play(players: number, seed: number, report: Report) {
  const rng = createRng(seed)
  const botRng = createRng(seed ^ 0x5bd1e995)
  let state = traders.init(makeSeats(players), { target: 15 }, rng)
  for (let step = 0; step < 5000 && !traders.isOver(state); step++) {
    const seat = state.order[state.turn]
    const legal = traders.legalActions(state, seat)
    const next = traders.reduce(state, choose(state, legal, botRng), seat, rng)
    if (isGameError(next)) throw new Error(`seed ${seed}: refused ${next.gameError}`)
    state = next
  }
  if (!traders.isOver(state)) throw new Error(`seed ${seed}: did not end`)
  const result = traders.result(state)
  report.rounds.push(Math.min(state.round - 1, 60))
  report.ends[state.end ?? 'none'] = (report.ends[state.end ?? 'none'] ?? 0) + 1
  const winners = result.standings.filter((line) => line.rank === 1)
  for (const line of winners) report.wins[state.order.indexOf(line.seat)] += 1 / winners.length
  report.winnerPoints.push(winners[0].score ?? 0)
  report.patrons += sum(state.players.map((player) => player.patrons.length))
}

const pct = (part: number, whole: number) => `${((100 * part) / whole).toFixed(1)}%`
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]

console.log(`Tamsui Traders: ${GAMES} games per player count, greedy bots, seeds from ${SEED}`)
for (const players of [2, 3, 4]) {
  const report: Report = { rounds: [], wins: Array(players).fill(0), ends: {}, winnerPoints: [], patrons: 0 }
  for (let game = 0; game < GAMES; game++) play(players, SEED + game * 7919 + players, report)
  const sorted = [...report.rounds].sort((a, b) => a - b)
  console.log(`\n${players} players`)
  console.log(
    `  rounds: mean ${(sum(sorted) / sorted.length).toFixed(1)}, median ${quantile(sorted, 0.5)}, ` +
      `10%–90% ${quantile(sorted, 0.1)}–${quantile(sorted, 0.9)}, min ${sorted[0]}, max ${sorted[sorted.length - 1]}`,
  )
  console.log(`  ends: ${Object.entries(report.ends).map(([end, count]) => `${end} ${pct(count, GAMES)}`).join(', ')}`)
  console.log(`  wins by turn order: ${report.wins.map((wins, place) => `#${place + 1} ${pct(wins, GAMES)}`).join(', ')} (fair: ${pct(1, players)})`)
  console.log(`  winner's points: mean ${(sum(report.winnerPoints) / GAMES).toFixed(1)}; patrons won per game: ${(report.patrons / GAMES).toFixed(2)}`)
}
