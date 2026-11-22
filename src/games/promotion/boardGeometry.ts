// The board's own geometry (e3-t08, e3-t10): where the pieces stand on a cell and the arc they fly
// along, and how a cell's name breaks into lines. Only the board's drawing (PromotionBoard.tsx) needs
// it, so it loads with that, after the screen's first paint (2026-11-23); the blocks' layout, which
// the screen sizes itself by, stays in boardLayout.ts.
import { DEPARTMENTS } from '../../../shared/games/promotion/departments.ts'
import type { BoardLayout, Box } from './boardLayout.ts'

export interface Point {
  x: number
  y: number
}

const PIECE_STEP = 22
const END_PIECE_STEP = 32

/**
 * Where the pieces standing on one cell go, relative to its centre: along the bottom from the right
 * corner, overlapping when there are many, so that the name stays readable and the destination
 * badges at the bottom left mostly stay clear. The end cell lines them up in its middle.
 */
export function pieceOffsets(count: number, box: Box, end = false): Point[] {
  const y = box.height / 2 - 18
  if (end) {
    return Array.from({ length: count }, (_, i) => ({ x: (i - (count - 1) / 2) * END_PIECE_STEP, y }))
  }
  const step = count > 1 ? Math.min(PIECE_STEP, (box.width - 36) / (count - 1)) : 0
  const right = box.width / 2 - 18
  return Array.from({ length: count }, (_, i) => ({ x: right - i * step, y: y - (i % 2) * 4 }))
}

export const centre = (box: Box): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

/** Where every piece is: each cell's pieces share it in seat order */
export function piecePoints(
  pieces: readonly { seat: number; cell: string }[],
  layout: BoardLayout,
): Map<number, Point> {
  const points = new Map<number, Point>()
  const seen = new Map<string, number[]>()
  for (const piece of pieces) seen.set(piece.cell, [...(seen.get(piece.cell) ?? []), piece.seat])
  for (const [cell, seats] of seen) {
    const box = layout.byId.get(cell)
    if (!box) continue
    const middle = centre(box)
    const offsets = pieceOffsets(seats.length, box, cell === DEPARTMENTS.top[0])
    seats.forEach((seat, at) => {
      points.set(seat, { x: middle.x + offsets[at].x, y: middle.y + offsets[at].y })
    })
  }
  return points
}

export interface NameLines {
  lines: string[]
  /** Latin letters are set smaller than CJK */
  latin: boolean
}

const MAX_LATIN_LINE = 11

/**
 * A cell's name in lines. English cells show only the transliteration ("Juren"): the gloss in
 * brackets belongs to the cell's details. Chinese breaks in half, Latin at spaces.
 */
export function cellNameLines(fullName: string): NameLines {
  const name = fullName.split(' (')[0]
  if (!/[a-z]/i.test(name)) {
    const chars = [...name]
    if (chars.length <= 3) return { lines: [name], latin: false }
    const half = Math.ceil(chars.length / 2)
    return { lines: [chars.slice(0, half).join(''), chars.slice(half).join('')], latin: false }
  }
  const lines: string[] = []
  for (const word of name.split(' ')) {
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + word.length <= MAX_LATIN_LINE) {
      lines[lines.length - 1] = `${last} ${word}`
    } else {
      lines.push(word)
    }
  }
  return { lines, latin: true }
}

/** A quadratic curve from one point to another, bowed to the side: how a piece flies */
export function arcControl(from: Point, to: Point): Point {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const [dx, dy] = [to.x - from.x, to.y - from.y]
  const length = Math.hypot(dx, dy) || 1
  const lift = Math.min(160, length * 0.3)
  // Always bowing upward on the screen, whichever way the piece is going
  const side = dx > 0 ? 1 : -1
  return { x: middle.x + (side * dy * lift) / length, y: middle.y - (side * dx * lift) / length }
}

export function arcPoints(from: Point, to: Point, steps: number): Point[] {
  const control = arcControl(from, to)
  return Array.from({ length: steps + 1 }, (_, step) => {
    const t = step / steps
    const [a, b, c] = [(1 - t) ** 2, 2 * t * (1 - t), t ** 2]
    return {
      x: a * from.x + b * control.x + c * to.x,
      y: a * from.y + b * control.y + c * to.y,
    }
  })
}
