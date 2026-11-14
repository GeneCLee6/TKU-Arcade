// What the screen makes of a view: the move a selection stands for, whether the room would take it,
// and what to tell whom. Kept apart from the looks so that it can be tested without a browser. It
// only reads `view` and `legal`: the rules are the server's, and a button is enabled only for a
// move the server listed.
import type { SeatId } from '../../../shared/games/types.ts'
import type {
  TradersAction,
  TradersCard,
  TradersGoods,
  TradersPlayerView,
  TradersView,
} from '../../../shared/games/traders/types.ts'
import type { TextKey } from '../../i18n/t.ts'

/** What the player has tapped so far on their turn */
export type Selection =
  | { kind: 'none' }
  | { kind: 'goods'; goods: number[] }
  | { kind: 'card'; id: string }
  | { kind: 'deck'; tier: number }

export const NOTHING: Selection = { kind: 'none' }

const sameAction = (a: TradersAction, b: TradersAction) => JSON.stringify(a) === JSON.stringify(b)

/** Whether the room listed this very move */
export const isLegal = (legal: readonly TradersAction[], action: TradersAction | null): action is TradersAction =>
  action !== null && legal.some((option) => sameAction(option, action))

/**
 * A good tapped on the wharf: a new one joins (up to three); the only one picked, tapped again,
 * asks for two of it; a picked one tapped again leaves
 */
export function tapGood(selection: Selection, good: number): Selection {
  const goods = selection.kind === 'goods' ? selection.goods : []
  const count = goods.filter((picked) => picked === good).length
  let next: number[]
  if (count === 0) {
    const double = goods.length === 2 && goods[0] === goods[1]
    next = double ? [good] : goods.length < 3 ? [...goods, good] : goods
  } else if (count === 1 && goods.length === 1) next = [good, good]
  else next = goods.filter((picked) => picked !== good)
  return next.length === 0 ? NOTHING : { kind: 'goods', goods: next }
}

/** The take a set of goods stands for: two of one good, or different goods in order */
export function takeOf(goods: readonly number[]): TradersAction | null {
  if (goods.length === 0) return null
  if (goods.length === 2 && goods[0] === goods[1]) return { type: 'double', good: goods[0] }
  return { type: 'take', goods: [...goods].sort((a, b) => a - b) }
}

/** The player whose view this is, or null for a spectator */
export const mine = (view: TradersView): TradersPlayerView | null =>
  view.players.find((player) => player.seat === view.you) ?? null

/** What a card still costs after `bonuses`, good by good */
export const netCost = (card: TradersCard, bonuses: TradersGoods): number[] =>
  card.cost.map((cost, good) => Math.max(0, cost - (bonuses[good] ?? 0)))

const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0)

/** Every card that can be selected: face up, and the viewer's own reserved ones */
export function findCard(view: TradersView, id: string): TradersCard | null {
  for (const row of view.market) for (const card of row) if (card?.id === id) return card
  for (const held of mine(view)?.reserved ?? []) if (held.card?.id === id) return held.card
  return null
}

export type Prompt = { key: TextKey; params?: Record<string, string | number> }

/** The dock's main line: what you should be doing now */
export function promptOf(
  view: TradersView,
  legal: readonly TradersAction[],
  selection: Selection,
  nameOf: (seat: SeatId) => string,
): Prompt {
  if (view.phase === 'over' || view.turn === null) return { key: 'games.traders.ui.prompt.over' }
  const yours = view.you !== null && view.turn === view.you
  if (!yours) {
    return {
      key: view.phase === 'return' ? 'games.traders.ui.prompt.waitingReturn' : 'games.traders.ui.prompt.waiting',
      params: { name: nameOf(view.turn) },
    }
  }
  if (view.phase === 'return') {
    const count = total(mine(view)?.tokens ?? [])
    return { key: 'games.traders.ui.prompt.return', params: { count, over: count - 10 } }
  }
  if (legal.length === 1 && legal[0].type === 'pass') return { key: 'games.traders.ui.prompt.pass' }
  switch (selection.kind) {
    case 'goods':
      return {
        key: isLegal(legal, takeOf(selection.goods)) ? 'games.traders.ui.prompt.take' : 'games.traders.ui.prompt.takeBad',
      }
    case 'card': {
      const can = legal.some(
        (action) => (action.type === 'buy' || action.type === 'reserve') && action.card === selection.id,
      )
      return { key: can ? 'games.traders.ui.prompt.card' : 'games.traders.ui.prompt.cannot' }
    }
    case 'deck':
      return { key: 'games.traders.ui.prompt.deck' }
    default:
      return { key: 'games.traders.ui.prompt.yours' }
  }
}

/**
 * What a button press waits on: the room's answer changes the turn, the phase or the tokens (a
 * return changes only the tokens)
 */
export const answerKey = (view: TradersView, legal: unknown): string =>
  JSON.stringify([view.round, view.turn, view.phase, mine(view)?.tokens ?? null, legal])
