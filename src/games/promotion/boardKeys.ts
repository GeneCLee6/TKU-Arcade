// Moving around the board with a keyboard. The arrows go by what is on the screen, not along the
// ladder: next in seniority is often in another department, which would look like a jump.
import { END_CELL, START_CELL } from '../../../shared/games/promotion/board.ts'
import type { BoardLayout, CellBox } from './boardLayout.ts'

type Axis = { main: 'x' | 'y'; size: 'width' | 'height'; sign: 1 | -1 }

const ARROWS: Partial<Record<string, Axis>> = {
  ArrowRight: { main: 'x', size: 'width', sign: 1 },
  ArrowLeft: { main: 'x', size: 'width', sign: -1 },
  ArrowDown: { main: 'y', size: 'height', sign: 1 },
  ArrowUp: { main: 'y', size: 'height', sign: -1 },
}

const middle = (box: CellBox, axis: 'x' | 'y') =>
  axis === 'x' ? box.x + box.width / 2 : box.y + box.height / 2

/**
 * Where a key takes the focus from cell `id`: `id` itself at the edge of the board, and null for a
 * key that does not move around the board. Home and End are the two ends of the game.
 *
 * The nearest cell that way in the same row or column wins. The blocks do not line up, so when no
 * cell overlaps (a row that faces another block's plaque) the nearest cell that way at all does,
 * with a step to the side counting double.
 */
export function cellForKey(layout: BoardLayout, id: string, key: string): string | null {
  if (key === 'Home') return START_CELL
  if (key === 'End') return END_CELL
  const axis = ARROWS[key]
  if (!axis) return null
  const from = layout.byId.get(id)
  if (!from) return null

  const { main, size, sign } = axis
  const cross = main === 'x' ? 'y' : 'x'
  const crossSize = main === 'x' ? 'height' : 'width'
  let best: { id: string; overlaps: boolean; score: number } | null = null
  for (const box of layout.cells) {
    // Wholly that way: cells of different heights side by side are not above one another
    const edge = sign === 1 ? box[main] - from[main] - from[size] : from[main] - box[main] - box[size]
    if (edge < 0) continue
    // In the same row or column: a wide cell is a neighbour of all of those it spans
    const overlaps =
      box[cross] < from[cross] + from[crossSize] && from[cross] < box[cross] + box[crossSize]
    const off = Math.abs(middle(box, cross) - middle(from, cross))
    const score = overlaps ? edge + off / 1000 : edge + 2 * off
    if (!best || (overlaps && !best.overlaps) || (overlaps === best.overlaps && score < best.score)) {
      best = { id: box.id, overlaps, score }
    }
  }
  return best?.id ?? id
}
