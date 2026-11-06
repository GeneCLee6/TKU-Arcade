// Where each cell of the promotion board goes. BOARD has no coordinates: it is a list in order of
// seniority, and this winds it into a rectangle from the outside in, the traditional way round, with
// the end of the game in the middle.
//
// 79 cells have to read on a portrait phone, so the shape is what decides. 7 columns by 12 rows is
// three rings of 34, 26 and 18 cells, which is exactly the 78 cells before the end, and leaves a
// 1 by 6 hole in the middle for the end cell. Seven columns also gives the widest cell that still
// leaves a phone's screen some room for the dock. On a wide screen the same spiral lies on its side.
import { BOARD, type BoardCell } from '../../../shared/games/promotion/board.ts'

export type BoardShape = 'portrait' | 'landscape'

export interface CellBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface BoardLayout {
  shape: BoardShape
  width: number
  height: number
  cells: readonly CellBox[]
  byId: ReadonlyMap<string, CellBox>
}

const PADDING = 4
const GAP = 4

const SHAPES: Record<BoardShape, { columns: number; rows: number; cell: [number, number] }> = {
  // The height that leaves all twelve rows above the dock on a 390 by 844 phone
  portrait: { columns: 7, rows: 12, cell: [100, 76] },
  landscape: { columns: 12, rows: 7, cell: [100, 74] },
}

/**
 * The grid squares of a columns by rows rectangle, from its bottom left corner: right along the
 * bottom, up, left along the top, down, then the next ring in; `count` of them at most.
 */
export function spiral(columns: number, rows: number, count: number): [number, number][] {
  const squares: [number, number][] = []
  let [left, right, top, bottom] = [0, columns - 1, 0, rows - 1]
  while (squares.length < count && left <= right && top <= bottom) {
    for (let x = left; x <= right; x++) squares.push([x, bottom])
    for (let y = bottom - 1; y >= top; y--) squares.push([right, y])
    if (top < bottom) for (let x = right - 1; x >= left; x--) squares.push([x, top])
    if (left < right) for (let y = top + 1; y < bottom; y++) squares.push([left, y])
    left++
    right--
    top++
    bottom--
  }
  return squares.slice(0, count)
}

function makeLayout(shape: BoardShape, board: readonly BoardCell[]): BoardLayout {
  const {
    columns,
    rows,
    cell: [cellWidth, cellHeight],
  } = SHAPES[shape]
  const rings = board.length - 1
  const squares = spiral(columns, rows, rings)
  const taken = new Set(squares.map(([x, y]) => `${x},${y}`))
  const box = (id: string, x: number, y: number, across = 1, down = 1): CellBox => ({
    id,
    x: PADDING + x * (cellWidth + GAP),
    y: PADDING + y * (cellHeight + GAP),
    width: across * cellWidth + (across - 1) * GAP,
    height: down * cellHeight + (down - 1) * GAP,
  })
  const cells = squares.map(([x, y], index) => box(board[index].id, x, y))

  // The end cell is whatever the rings leave in the middle
  const left: [number, number][] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) if (!taken.has(`${x},${y}`)) left.push([x, y])
  }
  const xs = left.map(([x]) => x)
  const ys = left.map(([, y]) => y)
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)]
  cells.push(
    box(board[rings].id, minX, minY, Math.max(...xs) - minX + 1, Math.max(...ys) - minY + 1),
  )

  return {
    shape,
    width: 2 * PADDING + columns * cellWidth + (columns - 1) * GAP,
    height: 2 * PADDING + rows * cellHeight + (rows - 1) * GAP,
    cells,
    byId: new Map(cells.map((cell) => [cell.id, cell])),
  }
}

export const BOARD_LAYOUTS: Record<BoardShape, BoardLayout> = {
  portrait: makeLayout('portrait', BOARD),
  landscape: makeLayout('landscape', BOARD),
}

export interface Point {
  x: number
  y: number
}

const PIECE_SPREAD = 33

/**
 * Where the pieces standing on one cell go, relative to its centre: up to three in a row along the
 * bottom, so the name stays readable; a second row above that for more.
 */
export function pieceOffsets(count: number, box: CellBox): Point[] {
  const lower = box.height / 2 - 17
  const upper = lower - 32
  const row = (n: number, y: number) =>
    Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * PIECE_SPREAD * 0.86, y }))
  if (count <= 3) return row(count, lower)
  const below = Math.ceil(count / 2)
  return [...row(below, lower), ...row(count - below, upper)]
}

export const centre = (box: CellBox): Point => ({
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
    const offsets = pieceOffsets(seats.length, box)
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
 * brackets belongs to the detail panel. Chinese breaks in half, Latin at spaces.
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
