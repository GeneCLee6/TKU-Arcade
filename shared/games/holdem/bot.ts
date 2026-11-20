// A computer player for hold'em (2026-11-20, docs/ARCHITECTURE.md "電腦玩家"). It sees only what its
// seat's browser would: its own two cards, the board, the chips and its legal actions. Before the
// flop it reads its hand off a starting-hand score (the Chen count); after it, it deals out the rest
// of the board and the opponents' cards a few dozen times from the cards it cannot see, to guess how
// often it wins, and weighs that against the price of a call (pot odds). Easy calls a lot, rarely
// raises and never reads the odds; normal folds what it should and raises what it can.
import { bestHand, fullDeck, RANKS, type Card, type Rank } from '../../poker/hand.ts'
import type { Rng, SeatId } from '../types.ts'
import type { HoldemAction, HoldemView } from './types.ts'

/** Deals of the unseen cards per decision after the flop: enough to tell a good hand from a bad one */
const SIMULATIONS = 60
/** Opponents dealt in a simulation at most: more only costs time, the equity is scaled instead */
const SIMULATED_OPPONENTS = 3

const rankIndex = (card: Card) => RANKS.indexOf(card[0] as Rank)

/**
 * The Chen count of two cards: about -1 (seven-two) to 20 (two aces). A well-known public method
 * for sizing up a starting hand: the high card, pairs doubled, suited and connected bonuses
 */
export function chenScore(hole: readonly Card[]): number {
  if (hole.length !== 2) return 0
  const [a, b] = [rankIndex(hole[0]), rankIndex(hole[1])].sort((x, y) => y - x)
  const highPoints = (rank: number) =>
    rank === 12 ? 10 : rank === 11 ? 8 : rank === 10 ? 7 : rank === 9 ? 6 : (rank + 2) / 2
  let score = highPoints(a)
  if (a === b) return Math.max(5, score * 2)
  if (hole[0][1] === hole[1][1]) score += 2
  const gap = a - b - 1
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5
  if (gap <= 1 && a < 10) score += 1
  return Math.ceil(score)
}

/**
 * How often `hole` with `board` wins (ties count half) against `opponents` random hands, from
 * `SIMULATIONS` deals of the cards this seat cannot see
 */
export function equity(
  hole: readonly Card[],
  board: readonly Card[],
  opponents: number,
  rng: Rng,
  simulations = SIMULATIONS,
): number {
  if (hole.length !== 2 || opponents <= 0) return 1
  const dealt = Math.min(opponents, SIMULATED_OPPONENTS)
  const known = new Set<string>([...hole, ...board])
  const unseen = fullDeck().filter((card) => !known.has(card))
  let won = 0
  for (let run = 0; run < simulations; run++) {
    // A partial shuffle: only the cards this deal needs
    const deck = [...unseen]
    const needed = 5 - board.length + dealt * 2
    for (let index = 0; index < needed; index++) {
      const swap = index + rng.int(deck.length - index)
      ;[deck[index], deck[swap]] = [deck[swap], deck[index]]
    }
    const fullBoard = [...board, ...deck.slice(0, 5 - board.length)]
    const mine = bestHand([...hole, ...fullBoard]).score
    let beaten = false
    let tied = 0
    for (let other = 0; other < dealt && !beaten; other++) {
      const at = 5 - board.length + other * 2
      const theirs = bestHand([deck[at], deck[at + 1], ...fullBoard]).score
      if (theirs > mine) beaten = true
      else if (theirs === mine) tied++
    }
    if (!beaten) won += tied > 0 ? 1 / (tied + 1) : 1
  }
  const share = won / simulations
  // Each opponent past the ones dealt is about another such hand to beat
  return dealt === opponents ? share : share ** (opponents / dealt)
}

/** The raise in `legal` whose size is nearest `to` (Infinity: all in); null when none is allowed */
function raiseNear(legal: readonly HoldemAction[], to: number): HoldemAction | null {
  let found: HoldemAction | null = null
  let gap = Infinity
  for (const action of legal) {
    if (action.type !== 'raise') continue
    const distance = to === Infinity ? -action.to : Math.abs(action.to - to)
    if (distance < gap) {
      gap = distance
      found = action
    }
  }
  return found
}

const has = (legal: readonly HoldemAction[], type: HoldemAction['type']) =>
  legal.find((action) => action.type === type) ?? null

/** Check if it costs nothing, else fold */
const giveUp = (legal: readonly HoldemAction[]) => has(legal, 'check') ?? has(legal, 'fold')
/** Check or call, whichever is the way to stay in */
const stayIn = (legal: readonly HoldemAction[]) => has(legal, 'check') ?? has(legal, 'call')

/** The vote to stop: a computer player agrees as soon as someone else wants to, and only then */
function vote(view: HoldemView, you: SeatId): HoldemAction | null {
  const others = view.endVotes.some((seat) => seat !== you)
  const mine = view.endVotes.includes(you)
  if (others && !mine) return { type: 'endVote', on: true }
  if (!others && mine) return { type: 'endVote', on: false }
  return null
}

export function holdemBot(
  view: HoldemView,
  legal: readonly HoldemAction[],
  level: string,
  rng: Rng,
): HoldemAction | null {
  const you = view.you
  const me = view.players.find((player) => player.seat === you)
  if (you === null || !me || me.out || view.phase.kind === 'over') return null
  // Sat out by the turn clock (the room waits for someone to watch before it moves a computer
  // seat, and the clock does not): back in at once, turn or no turn
  if (me.away) return { type: 'away', away: false }
  if (legal.length === 0) return null
  const voting = vote(view, you)
  if (voting) return voting
  const toCall = Math.max(0, view.currentBet - me.bet)
  const pot = view.pot
  const opponents = view.players.filter((player) => player.seat !== you && player.inHand).length
  const preflop = view.board.length === 0
  const bigBlinds = (me.stack + me.bet) / Math.max(1, view.bb)

  if (level === 'easy') {
    // Plays its cards face up and sticks around: raises with a strong hand now and then, calls most
    // things, folds only a weak hand to a big bet
    const strong = preflop
      ? chenScore(view.hole) >= 11
      : bestHand([...view.hole, ...view.board]).category !== 'highCard'
    const big = toCall > me.stack / 3 || toCall > pot
    if (strong && rng.float() < 0.35) {
      return raiseNear(legal, view.currentBet + Math.max(view.bb * 2, Math.floor(pot / 2))) ?? stayIn(legal)
    }
    if (!strong && big && rng.float() < 0.7) return giveUp(legal)
    if (rng.float() < 0.08) return giveUp(legal)
    return stayIn(legal)
  }

  if (preflop) {
    const chen = chenScore(view.hole)
    // Short of chips: all in with anything decent, fold the rest
    if (bigBlinds <= 10) {
      if (chen >= 8) return raiseNear(legal, Infinity) ?? stayIn(legal)
      return toCall === 0 ? giveUp(legal) : chen >= 6 && toCall <= view.bb ? stayIn(legal) : giveUp(legal)
    }
    const opened = view.currentBet > view.bb
    if (chen >= 12) {
      const target = opened ? view.currentBet * 3 : view.bb * 3
      return raiseNear(legal, target) ?? stayIn(legal)
    }
    if (chen >= 9) {
      if (!opened && rng.float() < 0.6) return raiseNear(legal, view.bb * 3) ?? stayIn(legal)
      return toCall <= view.bb * 6 ? stayIn(legal) : giveUp(legal)
    }
    if (chen >= 6) return toCall <= view.bb * 2 ? stayIn(legal) : giveUp(legal)
    // A bad hand: free to see a flop, or a small blind's half, else gone
    return toCall === 0 || (toCall * 2 <= view.bb && rng.float() < 0.5) ? stayIn(legal) : giveUp(legal)
  }

  const chance = equity(view.hole, view.board, opponents, rng)
  const odds = toCall / (pot + toCall)
  if (chance >= 0.75) {
    // Very strong: bet for value, all in now and then
    const target = rng.float() < 0.2 ? Infinity : view.currentBet + pot
    return raiseNear(legal, target) ?? stayIn(legal)
  }
  if (chance >= 0.55) {
    if (toCall === 0 && rng.float() < 0.6) {
      return raiseNear(legal, view.currentBet + Math.floor(pot / 2)) ?? stayIn(legal)
    }
    return stayIn(legal)
  }
  if (toCall === 0) {
    // A bluff, seldom, into few players
    if (opponents <= 2 && rng.float() < 0.08) {
      return raiseNear(legal, Math.floor(pot / 2)) ?? stayIn(legal)
    }
    return giveUp(legal)
  }
  return chance > odds + 0.05 ? stayIn(legal) : giveUp(legal)
}
