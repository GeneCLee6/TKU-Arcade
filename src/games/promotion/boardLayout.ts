// Where each cell of the promotion board goes (e3-t08, e3-t10). BOARD has no coordinates and
// departments.ts only says which block a cell is in; this lays the eight blocks out, each a grid of its
// cells, most senior first, under a plaque with the department's name.
//
// The whole board is always on the screen at once (C5), so there are two arrangements of the same
// blocks, and the screen takes whichever fills the space it has best (`fitBoard`):
//
//   landscape (about 5:3)                  portrait (about 3:5)
//   guard | hanlin | top    | capital      top     | guard
//   army  | wuke   | exam   | local        hanlin  | army
//                                          capital | local
//                                          exam    | wuke
//
// (C4's three columns, about 7:8, fitted neither a desktop's screen nor a phone's.)
// Units are the SVG's: the board is scaled to fit its box.
import { DEPARTMENTS, type DepartmentId } from '../../../shared/games/promotion/departments.ts'

export type BoardShape = 'landscape' | 'portrait'

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
const FRAME = 24

interface Spec {
  id: DepartmentId
  columns: number
}

const blockWidth = (columns: number) =>
  2 * BLOCK_PADDING + columns * CELL_WIDTH + (columns - 1) * GAP

/** The cells of a block below the end cell: all of them except in the top block */
const ladderOf = (id: DepartmentId) => (id === 'top' ? DEPARTMENTS.top.slice(1) : DEPARTMENTS[id])

const rowsOf = ({ id, columns }: Spec) => Math.ceil(ladderOf(id).length / columns)

/** How tall a block is with its cells at their own size */
function naturalHeight({ id, columns }: Spec): number {
  const rows = rowsOf({ id, columns })
  const end = id === 'top' ? END_HEIGHT + GAP : 0
  return 2 * BLOCK_PADDING + HEAD + end + rows * CELL_HEIGHT + (rows - 1) * GAP
}

interface Placed {
  block: BlockBox
  cells: CellBox[]
}

/**
 * One block in the space it is given. More height makes its cells taller, up to a point; in the top
 * block the end cell takes whatever there is to spare. More width makes them wider.
 */
function placeBlock(
  { id, columns }: Spec,
  x: number,
  y: number,
  height: number,
  width = blockWidth(columns),
): Placed {
  const ladder = ladderOf(id)
  const cellWidth = (width - 2 * BLOCK_PADDING - (columns - 1) * GAP) / columns
  const rows = rowsOf({ id, columns })
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
      x: left + (at % columns) * (cellWidth + GAP),
      y: top + Math.floor(at / columns) * (cellHeight + GAP),
      width: cellWidth,
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

/**
 * Lines of blocks: rows of them side by side (`across`), or columns of them one under another. The
 * blocks of a row are as tall as its tallest, and a row shorter than the longest is stretched, its
 * blocks sharing the difference by their columns of cells; columns likewise, by their rows of cells
 */
function linesLayout(shape: BoardShape, lines: readonly (readonly Spec[])[], across: boolean) {
  const along = (spec: Spec) => (across ? blockWidth(spec.columns) : naturalHeight(spec))
  const thick = (spec: Spec) => (across ? naturalHeight(spec) : blockWidth(spec.columns))
  const weight = (spec: Spec) => (across ? spec.columns : rowsOf(spec))
  const sum = (line: readonly Spec[], of: (spec: Spec) => number) =>
    line.reduce((total, spec) => total + of(spec), 0)
  const lengths = lines.map((line) => sum(line, along) + (line.length - 1) * BLOCK_GAP)
  const length = Math.max(...lengths)
  let side = FRAME
  const placed = lines.flatMap((line, at) => {
    const size = Math.max(...line.map(thick))
    const extra = (length - lengths[at]) / sum(line, weight)
    let pos = FRAME
    const entries = line.map((spec) => {
      const own = along(spec) + extra * weight(spec)
      const entry = across
        ? placeBlock(spec, pos, side, size, own)
        : placeBlock(spec, side, pos, own, size)
      pos += own + BLOCK_GAP
      return entry
    })
    side += size + BLOCK_GAP
    return entries
  })
  const breadth = side - BLOCK_GAP + FRAME
  const span = length + 2 * FRAME
  return finish(shape, across ? span : breadth, across ? breadth : span, placed)
}

// Two rows of four rows of cells each: the military down the left, the end of the game above the
// examinations where it all starts
const LANDSCAPE: readonly (readonly Spec[])[] = [
  [
    { id: 'guard', columns: 2 },
    { id: 'hanlin', columns: 3 },
    { id: 'top', columns: 4 },
    { id: 'capital', columns: 4 },
  ],
  [
    { id: 'army', columns: 4 },
    { id: 'wuke', columns: 2 },
    { id: 'exam', columns: 3 },
    { id: 'local', columns: 5 },
  ],
]

// Two columns four cells wide: the civil ladder on the left, from the top down to the examinations;
// guard, army, provinces and the military examinations on the right
const PORTRAIT: readonly (readonly Spec[])[] = [
  [
    { id: 'top', columns: 4 },
    { id: 'hanlin', columns: 4 },
    { id: 'capital', columns: 4 },
    { id: 'exam', columns: 4 },
  ],
  [
    { id: 'guard', columns: 4 },
    { id: 'army', columns: 4 },
    { id: 'local', columns: 4 },
    { id: 'wuke', columns: 4 },
  ],
]

export const BOARD_LAYOUTS: Record<BoardShape, BoardLayout> = {
  landscape: linesLayout('landscape', LANDSCAPE, true),
  portrait: linesLayout('portrait', PORTRAIT, false),
}

export interface BoardFit {
  layout: BoardLayout
  /** CSS pixels per unit of the layout, with the whole board in the box */
  scale: number
}

/** The arrangement that shows the board biggest in a box of this many CSS pixels, and how big */
export function fitBoard(width: number, height: number): BoardFit {
  let best: BoardFit | null = null
  for (const layout of Object.values(BOARD_LAYOUTS)) {
    const scale = Math.min(width / layout.width, height / layout.height)
    if (!best || scale > best.scale) best = { layout, scale }
  }
  return best as BoardFit
}

// Where the pieces stand and fly, and how a cell's name breaks: boardGeometry.ts, which only the
// board's drawing needs (2026-11-23: out of the screen's first load with it)
