// Moving around the board with a keyboard. The arrows go by what is on the screen, not along the
// spiral: on a board that winds inwards, "next in the path" would look like a jump half of the time.
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
 */
export function cellForKey(layout: BoardLayout, id: string, key: string): string | null {
  if (key === 'Home') return layout.cells[0].id
  if (key === 'End') return layout.cells[layout.cells.length - 1].id
  const axis = ARROWS[key]
  if (!axis) return null
  const from = layout.byId.get(id)
  if (!from) return null

  const { main, size, sign } = axis
  const cross = main === 'x' ? 'y' : 'x'
  const crossSize = main === 'x' ? 'height' : 'width'
  let best: { id: string; gap: number; off: number } | null = null
  for (const box of layout.cells) {
    const gap = (middle(box, main) - middle(from, main)) * sign
    if (gap <= 0) continue
    // In the same row or column: the end cell spans several, so it is a neighbour of all of them
    const overlaps =
      box[cross] < from[cross] + from[crossSize] && from[cross] < box[cross] + box[crossSize]
    if (!overlaps) continue
    const edge = (sign === 1 ? box[main] - from[main] - from[size] : from[main] - box[main] - box[size])
    const off = Math.abs(middle(box, cross) - middle(from, cross))
    if (!best || edge < best.gap || (edge === best.gap && off < best.off)) {
      best = { id: box.id, gap: edge, off }
    }
  }
  return best?.id ?? id
}
