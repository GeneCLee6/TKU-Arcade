// The second board (C8's 236 cells) drawn as a traditional square board (C9): rings of department
// blocks from the outside in, as boardFull.ts `FULL_RINGS` lists them, and in the centre the common
// pot (公注) with the ends of a career, the peerage and the ladder of grades the end compares.
//
// Each ring is a frame of four sides. Its departments go round it in order, clockwise from the top
// left corner: along the top left to right, down the right, along the bottom right to left, up the
// left. Every block is drawn as on the column board (fullLayout.ts): an upright plaque on its left,
// then its cells lowest first, left to right and top to bottom. A ring is one or two cells deep.
//
// The whole board is on the screen at once (C5's rule), and a screen is rarely square: the frame takes
// the shape of the box it has (wider on a laptop, taller on a phone held upright), the smallest board
// of that shape every ring and the centre fit in. The rings and their order stay the same whatever
// the shape; only how many departments each side of a ring takes changes. Units are the SVG's.
import type { FullBoard, FullDeptId } from '../../../../shared/games/promotion/boardFull.ts'
import { fullData } from './fullData.ts'
import type {
  Box,
  FullBlockBox,
  FullBlockId,
  FullCellBox,
  FullFit,
  FullLayout,
  FullRungBox,
} from './fullLayout.ts'
import { CELL_H, CELL_W, fitFullBoard, fullLayouts, LADDER } from './fullLayout.ts'

export { CELL_W }

const GAP = 4
const PAD = 3
const PLAQUE_W = 22
const BLOCK_GAP = 6
const RING_GAP = 10
const FRAME = 12
/** The smallest the pot's medallion in the centre may be */
const POT_W = 260
const POT_H = 120
/** How far cells may grow to fill a side that has room to spare; the rest goes between blocks */
const MAX_WIDEN = 1.5
const MAX_HEIGHTEN = 1.5
/**
 * The shapes laid out, width over height, from 0.45 to 3.3, each 8% wider than the one before: the
 * screen takes the one nearest its box (`squareLayout`), each made the first time it is asked for
 */
const ASPECTS: readonly number[] = Array.from(
  { length: 27 },
  (_, at) => Math.round(0.45 * 1.08 ** at * 100) / 100,
)

type Side = 'top' | 'right' | 'bottom' | 'left'
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']
const across = (side: Side) => side === 'top' || side === 'bottom'

interface Dept {
  id: FullBlockId
  /** Cell ids, lowest first; for the ladder its grades */
  entries: readonly string[]
}

/** A block on a side `depth` cells deep: how many columns and rows of cells, along and across */
function grid(count: number, depth: number, side: Side) {
  const deep = Math.min(depth, count)
  const long = Math.ceil(count / deep)
  // Along the top and bottom a block is `deep` rows; on the left and right `deep` columns
  return across(side)
    ? { columns: long, rows: Math.ceil(count / long) }
    : { columns: deep, rows: long }
}

const span = (count: number, size: number) => count * size + (count - 1) * GAP
const blockWidth = (columns: number) => PLAQUE_W + 2 * PAD + span(columns, CELL_W)
const blockHeight = (rows: number) => 2 * PAD + span(rows, CELL_H)

/** How long a block is along its side */
function length(dept: Dept, depth: number, side: Side) {
  const { columns, rows } = grid(dept.entries.length, depth, side)
  return across(side) ? blockWidth(columns) : blockHeight(rows)
}

/** How deep a side of a ring is: a band of cells and padding, the plaque too on the left and right */
const thickness = (depth: number, side: Side) =>
  across(side) ? blockHeight(depth) : blockWidth(depth)

const need = (group: readonly Dept[], depth: number, side: Side) =>
  group.reduce((sum, dept) => sum + length(dept, depth, side), 0) +
  Math.max(0, group.length - 1) * BLOCK_GAP

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Where a ring's sides are, in a frame `rect`, and the room each has along it */
function sidesOf(rect: Rect, depth: number) {
  const top = thickness(depth, 'top')
  const side = thickness(depth, 'left')
  const tall = rect.height - 2 * top - 2 * BLOCK_GAP
  return {
    top: { x: rect.x, y: rect.y, along: rect.width, deep: top },
    bottom: { x: rect.x, y: rect.y + rect.height - top, along: rect.width, deep: top },
    right: { x: rect.x + rect.width - side, y: rect.y + top + BLOCK_GAP, along: tall, deep: side },
    left: { x: rect.x, y: rect.y + top + BLOCK_GAP, along: tall, deep: side },
    inner: {
      x: rect.x + side + RING_GAP,
      y: rect.y + top + RING_GAP,
      width: rect.width - 2 * (side + RING_GAP),
      height: rect.height - 2 * (top + RING_GAP),
    },
  }
}

type Split = Record<Side, readonly Dept[]>

/**
 * How a ring's departments, in order, are shared among its four sides in a frame `rect`: every side
 * long enough for its blocks, and as evenly filled as can be. Null when no sharing fits
 */
function split(depts: readonly Dept[], rect: Rect, depth: number): Split | null {
  const sides = sidesOf(rect, depth)
  if (sides.inner.width <= 0 || sides.inner.height <= 0) return null
  const n = depts.length
  let best: { split: Split; score: number } | null = null
  // Three cut points, a side may be empty
  for (let a = 0; a <= n; a++) {
    const top = depts.slice(0, a)
    if (need(top, depth, 'top') > sides.top.along) break
    for (let b = a; b <= n; b++) {
      const right = depts.slice(a, b)
      if (need(right, depth, 'right') > sides.right.along) break
      for (let c = b; c <= n; c++) {
        const bottom = depts.slice(b, c)
        if (need(bottom, depth, 'bottom') > sides.bottom.along) break
        const left = depts.slice(c)
        if (need(left, depth, 'left') > sides.left.along) continue
        const groups: Split = { top, right, bottom, left }
        // The emptiest side, as a share of its room: the higher, the more even the ring
        const score = Math.min(
          ...SIDES.map((side) => need(groups[side], depth, side) / sides[side].along),
        )
        if (!best || score > best.score) best = { split: groups, score }
      }
    }
  }
  return best?.split ?? null
}

/** The centre's pieces: the ends of a career, the peerage, the ladder and the pot's medallion */
interface CentrePlan {
  /** Rows from the top; each piece a department and its columns, or the pot */
  rows: readonly (readonly ({ dept: Dept; columns: number } | 'pot')[])[]
}

function centrePlans(centre: readonly Dept[], ladder: Dept): CentrePlan[] {
  const [first, second] = centre
  const both = (columns: number) => [
    { dept: first, columns },
    { dept: second, columns },
  ]
  const ladderOf = (columns: number) => [{ dept: ladder, columns }]
  return [
    { rows: [[{ dept: first, columns: 3 }, 'pot', { dept: second, columns: 3 }, ...ladderOf(7)]] },
    { rows: [[...ladderOf(7), { dept: first, columns: 3 }, 'pot', { dept: second, columns: 3 }]] },
    { rows: [[{ dept: first, columns: 5 }, 'pot', { dept: second, columns: 5 }], ladderOf(14)] },
    { rows: [both(5), ['pot'], ladderOf(14)] },
    { rows: [both(5), ['pot'], ladderOf(7)] },
    { rows: [[{ dept: first, columns: 3 }, 'pot', { dept: second, columns: 3 }], ladderOf(7)] },
    { rows: [both(3), ['pot'], ladderOf(7)] },
    { rows: [ladderOf(7), [{ dept: first, columns: 5 }], ['pot'], [{ dept: second, columns: 5 }]] },
    { rows: [[{ dept: first, columns: 5 }], ['pot'], [{ dept: second, columns: 5 }], ladderOf(5)] },
    { rows: [both(3), ['pot'], ladderOf(5)] },
  ]
}

const pieceWidth = (piece: CentrePlan['rows'][number][number]) =>
  piece === 'pot' ? POT_W : blockWidth(piece.columns)
const pieceHeight = (piece: CentrePlan['rows'][number][number]) =>
  piece === 'pot' ? POT_H : blockHeight(Math.ceil(piece.dept.entries.length / piece.columns))
const rowWidth = (row: CentrePlan['rows'][number]) =>
  row.reduce((sum, piece) => sum + pieceWidth(piece), 0) + (row.length - 1) * BLOCK_GAP
const rowHeight = (row: CentrePlan['rows'][number]) => Math.max(...row.map(pieceHeight))
const planSize = (plan: CentrePlan) => ({
  width: Math.max(...plan.rows.map(rowWidth)),
  height:
    plan.rows.reduce((sum, row) => sum + rowHeight(row), 0) + (plan.rows.length - 1) * BLOCK_GAP,
})

/** The plan for the centre that fits `rect`, the one leaving the pot the most room */
function centreFor(plans: readonly CentrePlan[], rect: Rect): CentrePlan | null {
  let best: { plan: CentrePlan; spare: number } | null = null
  for (const plan of plans) {
    const size = planSize(plan)
    if (size.width > rect.width || size.height > rect.height) continue
    const spare = Math.min(rect.width - size.width, rect.height - size.height)
    if (!best || spare > best.spare) best = { plan, spare }
  }
  return best?.plan ?? null
}

interface Plan {
  rect: Rect
  rings: { rect: Rect; depth: number; split: Split }[]
  centre: { rect: Rect; plan: CentrePlan }
}

/** The rings and the centre in a board `width` by `height`, with these depths; null if they do not fit */
function plan(
  rings: readonly (readonly Dept[])[],
  depths: readonly number[],
  plans: readonly CentrePlan[],
  width: number,
  height: number,
): Plan | null {
  let rect: Rect = { x: FRAME, y: FRAME, width: width - 2 * FRAME, height: height - 2 * FRAME }
  const placed: Plan['rings'] = []
  for (const [at, depts] of rings.entries()) {
    const depth = depths[at]
    const shared = split(depts, rect, depth)
    if (!shared) return null
    placed.push({ rect, depth, split: shared })
    rect = sidesOf(rect, depth).inner
  }
  const centre = centreFor(plans, rect)
  return centre
    ? { rect: { x: 0, y: 0, width, height }, rings: placed, centre: { rect, plan: centre } }
    : null
}

/** The smallest board of this shape every ring fits in, trying each ring one and two cells deep */
function smallest(
  rings: readonly (readonly Dept[])[],
  plans: readonly CentrePlan[],
  aspect: number,
): Plan {
  let best: Plan | null = null
  const count = rings.length
  for (let mask = 0; mask < 1 << count; mask++) {
    const depths = rings.map((_, at) => ((mask >> at) & 1 ? 2 : 1))
    // Grow until it fits, then halve back to the edge
    let low = 400
    let high = 400
    while (!plan(rings, depths, plans, high, high / aspect)) {
      low = high
      high *= 1.25
      if (high > 20_000) break
    }
    if (high > 20_000 || (best && high / 1.25 >= best.rect.width)) continue
    for (let step = 0; step < 18; step++) {
      const middle = (low + high) / 2
      if (plan(rings, depths, plans, middle, middle / aspect)) high = middle
      else low = middle
    }
    const found = plan(rings, depths, plans, Math.ceil(high), Math.ceil(high) / aspect) as Plan
    if (!best || found.rect.width < best.rect.width) best = found
  }
  if (!best) throw new Error('promotion: the square board fits no frame')
  return best
}

/**
 * Lays a block's cells out in a box of its side: the plaque on the left, the cells lowest first,
 * grown up to MAX_WIDEN and MAX_HEIGHTEN to fill it and centred in what is left
 */
function placeBlock(
  dept: Dept,
  columns: number,
  rows: number,
  box: Rect,
  cells: FullCellBox[],
  rungs: FullRungBox[],
): FullBlockBox {
  const roomW = box.width - PLAQUE_W - 2 * PAD - (columns - 1) * GAP
  const roomH = box.height - 2 * PAD - (rows - 1) * GAP
  const cellWidth = Math.min(CELL_W * MAX_WIDEN, roomW / columns)
  const cellHeight = Math.min(CELL_H * MAX_HEIGHTEN, roomH / rows)
  const used = PLAQUE_W + 2 * PAD + span(columns, cellWidth)
  const usedH = 2 * PAD + span(rows, cellHeight)
  // A block that cannot grow as far as its box sits in the middle of it
  const x = box.x + (box.width - used) / 2
  const y = box.y + (box.height - usedH) / 2
  const left = x + PLAQUE_W + PAD
  const top = y + PAD
  dept.entries.forEach((entry, at) => {
    const cell = {
      x: left + (at % columns) * (cellWidth + GAP),
      y: top + Math.floor(at / columns) * (cellHeight + GAP),
      width: cellWidth,
      height: cellHeight,
    }
    if (dept.id === 'ladder') rungs.push({ ...cell, grade: Number(entry) })
    else cells.push({ ...cell, id: entry })
  })
  return {
    id: dept.id,
    x,
    y,
    width: used,
    height: usedH,
    plaque: { x: x + 1, y: y + 1, width: PLAQUE_W - 2, height: usedH - 2 },
  }
}

/**
 * Lays one side's blocks along it: the space to spare goes first into the cells along the side, as
 * far as they may grow, then between the blocks. The bottom runs right to left and the left bottom
 * to top, so that a ring reads round clockwise
 */
function placeSide(
  group: readonly Dept[],
  depth: number,
  side: Side,
  where: { x: number; y: number; along: number; deep: number },
  out: { blocks: FullBlockBox[]; cells: FullCellBox[]; rungs: FullRungBox[] },
) {
  if (group.length === 0) return
  const grids = group.map((dept) => grid(dept.entries.length, depth, side))
  const units = grids.reduce((sum, g) => sum + (across(side) ? g.columns : g.rows), 0)
  const spare = where.along - need(group, depth, side)
  const cellSize = across(side) ? CELL_W : CELL_H
  const growth = (across(side) ? MAX_WIDEN : MAX_HEIGHTEN) - 1
  const perUnit = Math.min(spare / units, cellSize * growth)
  const between = group.length > 1 ? (spare - perUnit * units) / (group.length - 1) : 0
  const lead = group.length > 1 ? 0 : (spare - perUnit * units) / 2
  let at = lead
  const reversed = side === 'bottom' || side === 'left'
  group.forEach((dept, index) => {
    const g = grids[index]
    const long = length(dept, depth, side) + perUnit * (across(side) ? g.columns : g.rows)
    const start = reversed ? where.along - at - long : at
    const box = across(side)
      ? { x: where.x + start, y: where.y, width: long, height: where.deep }
      : { x: where.x, y: where.y + start, width: where.deep, height: long }
    out.blocks.push(placeBlock(dept, g.columns, g.rows, box, out.cells, out.rungs))
    at += long + BLOCK_GAP + between
  })
}

/**
 * Lays the centre's rows out in its rect: the row with the pot's medallion grows into the height the
 * others leave (up to twice its least), the medallion into the width its row leaves
 */
function placeCentre(
  centre: Plan['centre'],
  out: { blocks: FullBlockBox[]; cells: FullCellBox[]; rungs: FullRungBox[] },
): Box {
  const {
    rect,
    plan: { rows },
  } = centre
  const least = rows.map(rowHeight)
  const free = rect.height - least.reduce((sum, h) => sum + h, 0) - (rows.length - 1) * BLOCK_GAP
  const heights = rows.map((row, at) =>
    row.includes('pot') ? least[at] + Math.min(free, POT_H) : least[at],
  )
  const total = heights.reduce((sum, h) => sum + h, 0) + (rows.length - 1) * BLOCK_GAP
  let y = rect.y + (rect.height - total) / 2
  let pot: Box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  rows.forEach((row, index) => {
    const tall = heights[index]
    const blocksWidth = row.reduce(
      (sum, piece) => sum + (piece === 'pot' ? 0 : pieceWidth(piece)),
      0,
    )
    const gaps = (row.length - 1) * BLOCK_GAP
    const potWidth = row.includes('pot')
      ? Math.min(rect.width - blocksWidth - gaps, Math.max(POT_W, tall * 3))
      : 0
    const width = blocksWidth + potWidth + gaps
    let x = rect.x + (rect.width - width) / 2
    for (const piece of row) {
      if (piece === 'pot') {
        pot = { x, y, width: potWidth, height: tall }
        x += potWidth + BLOCK_GAP
        continue
      }
      const rowsOf = Math.ceil(piece.dept.entries.length / piece.columns)
      const box = {
        x,
        y: y + (tall - pieceHeight(piece)) / 2,
        width: pieceWidth(piece),
        height: pieceHeight(piece),
      }
      out.blocks.push(placeBlock(piece.dept, piece.columns, rowsOf, box, out.cells, out.rungs))
      x += box.width + BLOCK_GAP
    }
    y += tall + BLOCK_GAP
  })
  return pot
}

/** The square board's extras on a layout: its rings' frames, the centre and the pot's medallion */
export interface SquareParts {
  /** Each ring's band, outside in: its outer edge and the hole inside it, halfway into the gaps */
  rings: readonly { outer: Box; inner: Box }[]
  /** The centre, inside the innermost ring */
  centre: Box
  /** The pot's medallion in the centre */
  pot: Box
  /** Inside the outer ring: a card over this never hides an outer ring's cell */
  inner: Box
}

export type SquareLayout = FullLayout & { square: SquareParts }

const grow = (box: Rect, by: number): Rect => ({
  x: box.x - by,
  y: box.y - by,
  width: box.width + 2 * by,
  height: box.height + 2 * by,
})

/** The departments of each ring and the centre, with their cells, from the board */
function ringsOf(
  board: FullBoard,
  ringIds: readonly (readonly FullDeptId[])[],
  centreIds: readonly FullDeptId[],
) {
  const byDept = new Map<FullDeptId, string[]>()
  for (const cell of board.cells) byDept.set(cell.dept, [...(byDept.get(cell.dept) ?? []), cell.id])
  const dept = (id: FullDeptId): Dept => ({ id, entries: byDept.get(id) ?? [] })
  return {
    rings: ringIds.map((ring) => ring.map(dept)),
    centre: centreIds.map(dept),
    ladder: { id: 'ladder' as const, entries: LADDER.map(String) },
  }
}

/**
 * The square board of exactly this shape. The rings are boardFull.ts's `FULL_RINGS` and `FULL_CENTRE`
 * (loaded with the board, fullData.ts) but for trying others out
 */
export function buildSquare(
  board: FullBoard,
  aspect: number,
  ringIds: readonly (readonly FullDeptId[])[] = fullData().FULL_RINGS,
  centreIds: readonly FullDeptId[] = fullData().FULL_CENTRE,
): SquareLayout {
  const { rings, centre, ladder } = ringsOf(board, ringIds, centreIds)
  const plans = centrePlans(centre, ladder)
  const found = smallest(rings, plans, aspect)
  const out = {
    blocks: [] as FullBlockBox[],
    cells: [] as FullCellBox[],
    rungs: [] as FullRungBox[],
  }
  for (const ring of found.rings) {
    const sides = sidesOf(ring.rect, ring.depth)
    for (const side of SIDES) placeSide(ring.split[side], ring.depth, side, sides[side], out)
  }
  const pot = placeCentre(found.centre, out)
  const { width, height } = found.rect
  return {
    shape: 'square',
    width,
    height,
    blocks: out.blocks,
    cells: out.cells,
    byId: new Map(out.cells.map((cell) => [cell.id, cell])),
    rungs: out.rungs,
    square: {
      rings: found.rings.map((ring) => ({
        outer: grow(ring.rect, RING_GAP / 2),
        inner: grow(sidesOf(ring.rect, ring.depth).inner, RING_GAP / 2),
      })),
      centre: found.centre.rect,
      pot,
      inner: sidesOf(found.rings[0].rect, found.rings[0].depth).inner,
    },
  }
}

const built = new Map<string, SquareLayout>()

/** The square board of a shape near `aspect` (width over height), made once per shape */
export function squareLayout(board: FullBoard, aspect: number): SquareLayout {
  const nearest = ASPECTS.reduce((best, each) =>
    Math.abs(Math.log(each / aspect)) < Math.abs(Math.log(best / aspect)) ? each : best,
  )
  const key = `${board.version}:${nearest}`
  const known = built.get(key)
  if (known) return known
  const layout = buildSquare(board, nearest)
  built.set(key, layout)
  return layout
}

/** Every shape the square board comes in, for tests */
export const SQUARE_ASPECTS: readonly number[] = ASPECTS

/**
 * The board drawn biggest in a box of this many CSS pixels: the second board (rules version 2) as a
 * square board of the box's shape, the first (games from before C8) in its columns as in C7
 */
export function fitBoard(board: FullBoard, width: number, height: number): FullFit {
  if (board.version !== 2) return fitFullBoard(fullLayouts(board), width, height)
  const layout = squareLayout(board, width / height)
  return { layout, scale: Math.min(width / layout.width, height / layout.height) }
}

/** What to draw before the box is measured */
export const unfitted = (board: FullBoard): FullLayout =>
  board.version === 2 ? squareLayout(board, 2) : fullLayouts(board).wide
