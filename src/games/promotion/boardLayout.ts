// Where each cell of the promotion board goes (e3-t08). BOARD has no coordinates and departments.ts
// only says which block a cell is in; this lays the eight blocks out, each a grid of its cells, most
// senior first, under a plaque with the department's name.
//
// Wide screens get the traditional sheet, three columns of blocks:
//
//   guard | top     | hanlin
//   army  | capital | local
//   wuke  | exam    | local      (local runs down both rows)
//
// A phone gets the same blocks one under another, from the top (and the end of the game) down to
// the examinations: a long board to scroll down, but never sideways, and every cell big enough to
// read at the width of the phone. Units are the SVG's: the board is scaled to fit its box.
import { DEPARTMENTS, type DepartmentId } from '../../../shared/games/promotion/departments.ts'

export type BoardShape = 'wide' | 'stacked'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface CellBox extends Box {
  id: string
}

export interface BlockBox extends Box {
  id: DepartmentId
  /** The middle of the plaque with the department's name */
  plaqueX: number
  plaqueY: number
}

export interface BoardLayout {
  shape: BoardShape
  width: number
  height: number
  blocks: readonly BlockBox[]
  /** Block by block, each in its own reading order */
  cells: readonly CellBox[]
  byId: ReadonlyMap<string, CellBox>
}

export const CELL_WIDTH = 96
export const CELL_HEIGHT = 88
const GAP = 8
const BLOCK_PADDING = 12
export const PLAQUE_HEIGHT = 36
const HEAD = PLAQUE_HEIGHT + 14
const BLOCK_GAP = 14
/** The end of the game: a wide golden cell across the top block */
const END_HEIGHT = 132
/** How far a cell may stretch to fill a block that has room to spare */
const MAX_STRETCH = 1.15
const FRAME = { wide: 24, stacked: 14 } as const

interface Spec {
  id: DepartmentId
  columns: number
}

const blockWidth = (columns: number) =>
  2 * BLOCK_PADDING + columns * CELL_WIDTH + (columns - 1) * GAP

/** The cells of a block below the end cell: all of them except in the top block */
const ladderOf = (id: DepartmentId) => (id === 'top' ? DEPARTMENTS.top.slice(1) : DEPARTMENTS[id])

/** How tall a block is with its cells at their own size */
function naturalHeight({ id, columns }: Spec): number {
  const rows = Math.ceil(ladderOf(id).length / columns)
  const end = id === 'top' ? END_HEIGHT + GAP : 0
  return 2 * BLOCK_PADDING + HEAD + end + rows * CELL_HEIGHT + (rows - 1) * GAP
}

interface Placed {
  block: BlockBox
  cells: CellBox[]
}

/**
 * One block in the space it is given. More height makes its cells taller, up to a point; in the top
 * block the end cell takes whatever there is to spare.
 */
function placeBlock({ id, columns }: Spec, x: number, y: number, height: number): Placed {
  const width = blockWidth(columns)
  const ladder = ladderOf(id)
  const rows = Math.ceil(ladder.length / columns)
  const spare = Math.max(0, height - naturalHeight({ id, columns }))
  const cellHeight =
    id === 'top' ? CELL_HEIGHT : Math.min(CELL_HEIGHT * MAX_STRETCH, CELL_HEIGHT + spare / rows)
  const left = x + BLOCK_PADDING
  let top = y + BLOCK_PADDING + HEAD
  const cells: CellBox[] = []
  if (id === 'top') {
    const endHeight = END_HEIGHT + spare
    const inner = width - 2 * BLOCK_PADDING
    cells.push({ id: DEPARTMENTS.top[0], x: left, y: top, width: inner, height: endHeight })
    top += endHeight + GAP
  }
  ladder.forEach((cell, at) => {
    cells.push({
      id: cell,
      x: left + (at % columns) * (CELL_WIDTH + GAP),
      y: top + Math.floor(at / columns) * (cellHeight + GAP),
      width: CELL_WIDTH,
      height: cellHeight,
    })
  })
  const plaqueY = y + BLOCK_PADDING + PLAQUE_HEIGHT / 2
  return { block: { id, x, y, width, height, plaqueX: x + width / 2, plaqueY }, cells }
}

function finish(shape: BoardShape, width: number, height: number, placed: Placed[]): BoardLayout {
  const cells = placed.flatMap((entry) => entry.cells)
  return {
    shape,
    width,
    height,
    blocks: placed.map((entry) => entry.block),
    cells,
    byId: new Map(cells.map((cell) => [cell.id, cell])),
  }
}

// Three cells across at the sides and four in the middle, where the top block keeps its four
// highest offices in one row under the end cell
const WIDE = {
  left: [
    { id: 'guard', columns: 3 },
    { id: 'army', columns: 3 },
    { id: 'wuke', columns: 3 },
  ],
  middle: [
    { id: 'top', columns: 4 },
    { id: 'capital', columns: 4 },
    { id: 'exam', columns: 4 },
  ],
  right: [
    { id: 'hanlin', columns: 3 },
    { id: 'local', columns: 3 },
  ],
} as const satisfies Record<string, readonly Spec[]>

function wideLayout(): BoardLayout {
  const frame = FRAME.wide
  const { left, middle, right } = WIDE
  const first = Math.max(naturalHeight(left[0]), naturalHeight(middle[0]), naturalHeight(right[0]))
  const third = Math.max(naturalHeight(left[2]), naturalHeight(middle[2]))
  // The local block runs down the second and third rows; if it is the tallest, the second row grows
  const lower = Math.max(
    Math.max(naturalHeight(left[1]), naturalHeight(middle[1])) + BLOCK_GAP + third,
    naturalHeight(right[1]),
  )
  const second = lower - BLOCK_GAP - third

  const x0 = frame
  const x1 = x0 + blockWidth(left[0].columns) + BLOCK_GAP
  const x2 = x1 + blockWidth(middle[0].columns) + BLOCK_GAP
  const y0 = frame
  const y1 = y0 + first + BLOCK_GAP
  const y2 = y1 + second + BLOCK_GAP
  const placed = [
    placeBlock(left[0], x0, y0, first),
    placeBlock(middle[0], x1, y0, first),
    placeBlock(right[0], x2, y0, first),
    placeBlock(left[1], x0, y1, second),
    placeBlock(middle[1], x1, y1, second),
    placeBlock(right[1], x2, y1, lower),
    placeBlock(left[2], x0, y2, third),
    placeBlock(middle[2], x1, y2, third),
  ]
  return finish('wide', x2 + blockWidth(right[0].columns) + frame, y1 + lower + frame, placed)
}

/** The phone's order: from the top of the ladder down, as the wide sheet reads row by row */
const STACKED_ORDER: readonly DepartmentId[] = [
  'top',
  'guard',
  'hanlin',
  'army',
  'capital',
  'local',
  'wuke',
  'exam',
]
const STACKED_COLUMNS = 4

function stackedLayout(): BoardLayout {
  const frame = FRAME.stacked
  let y = frame
  const placed = STACKED_ORDER.map((id) => {
    const spec = { id, columns: STACKED_COLUMNS }
    const height = naturalHeight(spec)
    const entry = placeBlock(spec, frame, y, height)
    y += height + BLOCK_GAP
    return entry
  })
  return finish('stacked', 2 * frame + blockWidth(STACKED_COLUMNS), y - BLOCK_GAP + frame, placed)
}

export const BOARD_LAYOUTS: Record<BoardShape, BoardLayout> = {
  wide: wideLayout(),
  stacked: stackedLayout(),
}

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
