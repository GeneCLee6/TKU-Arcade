// A computer player for Promotion (2026-11-20, docs/ARCHITECTURE.md "電腦玩家"). Nothing is hidden in
// this game, and most turns are a roll; the full edition's decisions are where a player chooses. An
// offered post is taken when it stands better than where the seat is now (its rank, and where the
// dice lead from it); a minor post is bought out of when an office it can afford, keeping some
// silver back, stands clearly better. Easy decides those on a coin flip.
import { fullBoard, FULL_FACES, type FullBoard } from './boardFull.ts'
import type { Rng } from '../types.ts'
import type { PromotionAction, PromotionAnyView, PromotionFullView } from './types.ts'

const isFull = (view: PromotionAnyView): view is PromotionFullView =>
  (view as { edition?: unknown }).edition === 'full'

/** How good a cell is to stand on: its rank, and half the average rank one roll leads to from it */
export function standing(board: FullBoard, id: string): number {
  if (!board.has(id)) return 0
  const cell = board.get(id)
  const ahead = FULL_FACES.map((face) => (board.has(cell.moves[face]) ? board.get(cell.moves[face]).rank : cell.rank))
  return cell.rank + ahead.reduce((sum, rank) => sum + rank, 0) / ahead.length / 2
}

export function promotionBot(
  view: PromotionAnyView,
  legal: readonly PromotionAction[],
  level: string,
  rng: Rng,
): PromotionAction | null {
  if (legal.length === 0) return null
  const roll = legal.find((action) => action.type === 'roll')
  if (roll) return roll
  const pending = isFull(view) ? (view.pending ?? null) : null
  if (!isFull(view) || pending === null || pending.seat !== view.you) return null
  if (level === 'easy') return rng.pick(legal)

  const board = fullBoard(view.rulesVersion)
  if (pending.kind === 'offer') {
    const take = standing(board, pending.cell) >= standing(board, pending.from)
    return { type: take ? 'accept' : 'decline' }
  }
  const me = view.players.find((player) => player.seat === view.you)
  const money = me?.money ?? 0
  const minor = standing(board, pending.cell)
  // Keep at least a third of the silver: it is the score at the end
  const affordable = pending.choices.filter((choice) => choice.price <= (money * 2) / 3)
  let pick: { cell: string; gain: number } | null = null
  for (const choice of affordable) {
    const gain = standing(board, choice.cell) - minor
    if (gain > 2 && (pick === null || gain > pick.gain)) pick = { cell: choice.cell, gain }
  }
  return pick ? { type: 'buy', cell: pick.cell } : { type: 'skip' }
}
