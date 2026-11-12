// Where each of the full edition's 182 cells goes (e3-t14). boardFull.ts has no coordinates: this lays
// its 37 departments out as blocks, each a lacquer plaque standing on the left of its cells, which run
// from the lowest office to the highest, left to right. Blocks sit side by side in rows, rows stack in
// columns, and columns stand side by side.
//
// The whole board is on the screen at once (C5's rule), so there are two arrangements of the same
// blocks and the screen takes whichever shows the cells biggest in the box it has (`fitFullBoard`):
// wide (about 2:1) for a desktop or a phone on its side, tall (about 1:2) for a phone upright.
// In every one the summit (retirement, peerage, the highest titles) is at the top and the origins and
// examinations, where every career starts, at the bottom of the middle; the military to one side.
// Units are the SVG's: the board is scaled to fit its box.
import {
  BOARD_FULL,
  FULL_DEPARTMENTS,
  type FullCell,
  type FullDeptId,
} from '../../../../shared/games/promotion/boardFull.ts'

export type FullShape = 'wide' | 'tall'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface FullCellBox extends Box {
  id: string
}

export interface FullBlockBox extends Box {
  id: FullDeptId
  /** The plaque on the block's left */
  plaque: Box
}

export interface FullLayout {
  shape: FullShape
  width: number
  height: number
  blocks: readonly FullBlockBox[]
  /** Block by block, each lowest office first */
  cells: readonly FullCellBox[]
  byId: ReadonlyMap<string, FullCellBox>
}

export const CELL_W = 70
export const CELL_H = 58
const GAP = 4
export const PLAQUE_W = 24
const PAD = 4
const BLOCK_GAP = 8
const COLUMN_GAP = 14
const FRAME = 16
/** How far cells may grow to fill a row or a column that has room to spare */
const MAX_WIDEN = 1.6
const MAX_HEIGHTEN = 1.35

/** A department and how many cells wide its block is */
type Block = readonly [FullDeptId, number]
type Row = readonly Block[]
type Column = readonly Row[]

const cellsOf = (id: FullDeptId): FullCell[] => BOARD_FULL.filter((cell) => cell.dept === id)

const COUNT: ReadonlyMap<FullDeptId, number> = new Map(
  (Object.keys(FULL_DEPARTMENTS) as FullDeptId[]).map((id) => [id, cellsOf(id).length]),
)

const rowsOf = ([id, columns]: Block) => Math.ceil((COUNT.get(id) ?? 0) / columns)
const blockWidth = ([, columns]: Block) =>
  PLAQUE_W + 2 * PAD + columns * CELL_W + (columns - 1) * GAP
const blockHeight = (block: Block) => {
  const rows = rowsOf(block)
  return 2 * PAD + rows * CELL_H + (rows - 1) * GAP
}
const rowWidth = (row: Row) =>
  row.reduce((sum, block) => sum + blockWidth(block), 0) + (row.length - 1) * BLOCK_GAP
const rowHeight = (row: Row) => Math.max(...row.map(blockHeight))
/** Rows of cells a row of blocks spans: the weight it grows by when its column has room */
const rowCells = (row: Row) => Math.max(...row.map(rowsOf))
const columnHeight = (column: Column) =>
  column.reduce((sum, row) => sum + rowHeight(row), 0) + (column.length - 1) * BLOCK_GAP
const columnWidth = (column: Column) => Math.max(...column.map(rowWidth))

function placeBlock(
  block: Block,
  x: number,
  y: number,
  width: number,
  height: number,
  cells: FullCellBox[],
): FullBlockBox {
  const [id, columns] = block
  const rows = rowsOf(block)
  const cellWidth = Math.min(
    CELL_W * MAX_WIDEN,
    (width - PLAQUE_W - 2 * PAD - (columns - 1) * GAP) / columns,
  )
  const cellHeight = Math.min(CELL_H * MAX_HEIGHTEN, (height - 2 * PAD - (rows - 1) * GAP) / rows)
  const left = x + PLAQUE_W + PAD
  // What the cells do not take is left round them, the plaque keeping the block's whole height
  const top = y + (height - (rows * cellHeight + (rows - 1) * GAP)) / 2
  cellsOf(id).forEach((cell, at) => {
    cells.push({
      id: cell.id,
      x: left + (at % columns) * (cellWidth + GAP),
      y: top + Math.floor(at / columns) * (cellHeight + GAP),
      width: cellWidth,
      height: cellHeight,
    })
  })
  const used = PLAQUE_W + 2 * PAD + columns * cellWidth + (columns - 1) * GAP
  return {
    id,
    x,
    y,
    width: used,
    height,
    plaque: { x: x + 1, y: y + 1, width: PLAQUE_W - 2, height: height - 2 },
  }
}

function build(shape: FullShape, columns: readonly Column[]): FullLayout {
  const height = Math.max(...columns.map(columnHeight))
  const blocks: FullBlockBox[] = []
  const cells: FullCellBox[] = []
  let x = FRAME
  for (const column of columns) {
    const width = columnWidth(column)
    const weight = column.reduce((sum, row) => sum + rowCells(row), 0)
    const extraPerRow = (height - columnHeight(column)) / weight
    let y = FRAME
    for (const row of column) {
      const tall = rowHeight(row) + extraPerRow * rowCells(row)
      const across = row.reduce((sum, [, count]) => sum + count, 0)
      const extraPerCell = (width - rowWidth(row)) / across
      let left = x
      for (const block of row) {
        const wide = blockWidth(block) + extraPerCell * block[1]
        blocks.push(placeBlock(block, left, y, wide, tall, cells))
        left += wide + BLOCK_GAP
      }
      y += tall + BLOCK_GAP
    }
    x += width + COLUMN_GAP
  }
  return {
    shape,
    width: x - COLUMN_GAP + FRAME,
    height: height + 2 * FRAME,
    blocks,
    cells,
    byId: new Map(cells.map((cell) => [cell.id, cell])),
  }
}

// The six ministries one under another: from secretary to minister, the same five steps in each
const MINISTRIES: readonly Row[] = [
  [['personnel', 5]],
  [['revenue', 5]],
  [['rites', 5]],
  [['war', 5]],
  [['justice', 5]],
  [['works', 5]],
]

const MILITARY: readonly Row[] = [
  [['qitong', 4], ['wuke', 4]],
  [['shiwei', 7]],
  [['zhen', 7]],
  [['qiying', 6]],
  [['ying', 5]],
]

const PROVINCES: readonly Row[] = [
  [['dufu', 4], ['sansi', 2]],
  [['dao', 3], ['jiaozhi', 4]],
  [['fu', 4], ['zhou', 4]],
  [['xian', 6]],
]

/** The capital's courts below the ministries, two to a row */
const COURTS: readonly Row[] = [
  [['zhanshifu', 5], ['taipusi', 2]],
  [['duchayuan', 4], ['guozijian', 3]],
  [['dalisi', 4], ['taichangsi', 3]],
  [['guanglusi', 3], ['honglusi', 3]],
  [['tongzhengsi', 3]],
]

/**
 * Wide (about 2:1): the military and the provinces on the left; in the middle the summit, the Grand
 * Council, the Grand Secretariat and the Hanlin Academy over the examinations and origins; the
 * ministries and the other courts of the capital on the right
 */
const WIDE: readonly Column[] = [
  [...MILITARY, ...PROVINCES],
  [
    [['end', 5]],
    [['jue', 5]],
    [['gongxian', 6]],
    [['daxueshi', 6]],
    [['junji', 3], ['neige', 3]],
    [['hanlin', 5]],
    [['exam', 6]],
    [['origin', 6]],
  ],
  [...MINISTRIES, ...COURTS],
]

/** Tall (about 1:2), for a phone held upright: the civil career on the left, the rest on the right */
const TALL: readonly Column[] = [
  [
    [['end', 5]],
    [['jue', 5]],
    [['gongxian', 3], ['junji', 2]],
    [['daxueshi', 3], ['neige', 2]],
    [['hanlin', 5]],
    ...MINISTRIES,
    [['exam', 4], ['guozijian', 1]],
    [['origin', 3], ['taipusi', 2]],
  ],
  [
    [['qitong', 4]],
    [['wuke', 4]],
    [['shiwei', 4]],
    [['zhen', 4]],
    [['qiying', 3], ['sansi', 2]],
    [['ying', 5]],
    [['dufu', 4]],
    [['xian', 3], ['dao', 2]],
    [['jiaozhi', 4]],
    [['fu', 4]],
    [['zhou', 4]],
    [['zhanshifu', 5]],
    [['duchayuan', 4]],
    [['dalisi', 4]],
    [['taichangsi', 3], ['tongzhengsi', 2]],
    [['guanglusi', 3], ['honglusi', 2]],
  ],
]

export const FULL_LAYOUTS: Record<FullShape, FullLayout> = {
  wide: build('wide', WIDE),
  tall: build('tall', TALL),
}

export interface FullFit {
  layout: FullLayout
  /** CSS pixels per unit of the layout, with the whole board in the box */
  scale: number
}

/** The arrangement that shows the board biggest in a box of this many CSS pixels, and how big */
export function fitFullBoard(width: number, height: number): FullFit {
  let best: FullFit | null = null
  for (const layout of Object.values(FULL_LAYOUTS)) {
    const scale = Math.min(width / layout.width, height / layout.height)
    if (!best || scale > best.scale) best = { layout, scale }
  }
  return best as FullFit
}
