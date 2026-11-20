// A computer player for Tamsui Traders (2026-11-20, docs/ARCHITECTURE.md "電腦玩家"). It sees what its
// seat's browser would: the market, the wharf, everyone's tokens, discounts and points, and only its
// own face-down reservations. Normal is greedy with a short look ahead: it buys the best card it can
// afford (points, a discount a waiting patron wants, a discount at all early on); failing that, it
// picks the card it is closest to affording and takes the goods that bring it nearest, and reserves
// that card when taking would not help or its hands are full. Easy buys when it happens to see it
// can and otherwise takes goods more or less at random.
import { best, weighted } from '../tableBots.ts'
import type { Rng } from '../types.ts'
import type { TradersAction, TradersCard, TradersPlayerView, TradersView } from './types.ts'

const GOODS = 5
const GOLD = 5
const TOKEN_LIMIT = 10

/** What `card` still costs this seat once its discounts and tokens are counted, gold covering the rest */
export function shortfall(card: TradersCard, me: TradersPlayerView): number {
  let short = 0
  for (let good = 0; good < GOODS; good++) {
    short += Math.max(0, card.cost[good] - me.bonuses[good] - me.tokens[good])
  }
  return Math.max(0, short - me.tokens[GOLD])
}

/** The goods `card` still needs, one count per good (gold not counted against it) */
function needs(card: TradersCard, me: TradersPlayerView): number[] {
  return card.cost.map((cost, good) => Math.max(0, cost - me.bonuses[good] - me.tokens[good]))
}

/** How much a card is worth to this seat: its points, a patron's want, a lasting discount */
function worth(card: TradersCard, me: TradersPlayerView, view: TradersView): number {
  let patronHelp = 0
  for (const patron of view.patrons) {
    const missing = patron.need.reduce((sum, need, good) => sum + Math.max(0, need - me.bonuses[good]), 0)
    if (missing > 0 && patron.need[card.bonus] > me.bonuses[card.bonus]) patronHelp += patron.points / missing
  }
  // A discount is worth most early, when it pays back on many cards to come
  const engine = me.points < view.target / 2 ? 1 : 0.3
  return card.points * 1.5 + patronHelp + engine
}

const cardOfAction = (action: TradersAction, cards: readonly TradersCard[]) =>
  'card' in action ? (cards.find((card) => card.id === action.card) ?? null) : null

export function tradersBot(
  view: TradersView,
  legal: readonly TradersAction[],
  level: string,
  rng: Rng,
): TradersAction | null {
  const me = view.players.find((player) => player.seat === view.you)
  if (!me || legal.length === 0) return null
  const visible: TradersCard[] = [
    ...view.market.flat().filter((card): card is TradersCard => card !== null),
    ...me.reserved.flatMap((held) => (held.card ? [held.card] : [])),
  ]

  if (view.phase === 'return') {
    // Back to ten: what the best target needs least, gold last
    const target = best(visible, (card) => worth(card, me, view) / (1 + shortfall(card, me)))
    const wanted = target ? target.cost.map((cost, good) => cost - me.bonuses[good]) : [0, 0, 0, 0, 0]
    return best(legal, (action) =>
      action.type !== 'return' ? -Infinity : action.good === GOLD ? -100 : me.tokens[action.good] - (wanted[action.good] ?? 0),
    )
  }

  const buys = legal.filter((action) => action.type === 'buy')
  if (level === 'easy') {
    if (buys.length > 0 && rng.float() < 0.7) return rng.pick(buys)
    const takes = legal.filter((action) => action.type === 'take' || action.type === 'double')
    if (takes.length > 0 && rng.float() < 0.9) return rng.pick(takes)
    return rng.pick(legal)
  }

  if (buys.length > 0) {
    return best(buys, (action) => {
      const card = cardOfAction(action, visible)
      return card ? worth(card, me, view) : 0
    })
  }

  // The card to work towards: worth a lot, little left to pay
  const target = best(visible, (card) => worth(card, me, view) / (1 + shortfall(card, me)) ** 1.5)
  const reserveTarget =
    target && me.reserved.every((held) => held.card?.id !== target.id)
      ? (legal.find((action) => action.type === 'reserve' && action.card === target.id) ?? null)
      : null
  const held = me.tokens.reduce((sum, count) => sum + count, 0)
  if (target) {
    const need = needs(target, me)
    // Each good taken that the target needs counts; a good the next best card needs counts a little
    const second = best(
      visible.filter((card) => card.id !== target.id),
      (card) => worth(card, me, view) / (1 + shortfall(card, me)),
    )
    const later = second ? needs(second, me) : [0, 0, 0, 0, 0]
    const gain = (goods: readonly number[]) => {
      const left = [...need]
      const leftLater = [...later]
      let score = 0
      for (const good of goods) {
        if (left[good] > 0) {
          left[good]--
          score += 1
        } else if (leftLater[good] > 0) {
          leftLater[good]--
          score += 0.3
        }
      }
      return score
    }
    const takes = legal.filter((action) => action.type === 'take' || action.type === 'double')
    const pick = best(takes, (action) =>
      action.type === 'take' ? gain(action.goods) : action.type === 'double' ? gain([action.good, action.good]) + 0.05 : 0,
    )
    const pickGain = pick
      ? pick.type === 'take'
        ? gain(pick.goods)
        : pick.type === 'double'
          ? gain([pick.good, pick.good])
          : 0
      : 0
    // Full hands, or nothing on the wharf helps: hold the card (and a gold) instead
    if (reserveTarget && (pickGain < 1 || held >= TOKEN_LIMIT - 1)) return reserveTarget
    if (pick && pickGain > 0) return pick
  }
  if (reserveTarget) return reserveTarget
  // Nothing aimed: the take that gives most goods, else whatever is legal
  const takes = legal.filter((action) => action.type === 'take' || action.type === 'double')
  return weighted(takes, (action) => (action.type === 'take' ? action.goods.length : 1.5), rng) ?? rng.pick(legal)
}
