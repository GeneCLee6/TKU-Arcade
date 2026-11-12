// Moving round the full board with a keyboard (e3-t14), as on the simple one (boardKeys.ts): the
// arrows go by what is on the screen, Home and End to where a career starts and where it ends best.
import { FULL_START, FULL_TOP } from '../../../../shared/games/promotion/fullFaces.ts'
import type { FullCellBox, FullLayout } from './fullLayout.ts'

export { FULL_TOP }

type Axis = { main: 'x' | 'y'; size: 'width' | 'height'; sign: 1 | -1 }

const ARROWS: Partial<Record<string, Axis>> = {
  ArrowRight: { main: 'x', size: 'width', sign: 1 },
  ArrowLeft: { main: 'x', size: 'width', sign: -1 },
  ArrowDown: { main: 'y', size: 'height', sign: 1 },
  ArrowUp: { main: 'y', size: 'height', sign: -1 },
}

const middle = (box: FullCellBox, axis: 'x' | 'y') =>
  axis === 'x' ? box.x + box.width / 2 : box.y + box.height / 2

/**
 * Where a key takes the focus from cell `id`: the nearest cell that way in the same row or column,
 * else the nearest that way at all, a step to the side counting double; `id` itself at the edge, and
 * null for a key that does not move round the board
 */
export function fullCellForKey(layout: FullLayout, id: string, key: string): string | null {
  if (key === 'Home') return FULL_START
  if (key === 'End') return FULL_TOP
  const axis = ARROWS[key]
  if (!axis) return null
  const from = layout.byId.get(id)
  if (!from) return null
  const { main, size, sign } = axis
  const cross = main === 'x' ? 'y' : 'x'
  const crossSize = main === 'x' ? 'height' : 'width'
  let best: { id: string; overlaps: boolean; score: number } | null = null
  for (const box of layout.cells) {
    const edge = sign === 1 ? box[main] - from[main] - from[size] : from[main] - box[main] - box[size]
    if (edge < 0) continue
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
