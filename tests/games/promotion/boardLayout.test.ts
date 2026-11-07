import { describe, expect, it } from 'vitest'
import { BOARD, END_CELL } from '../../../shared/games/promotion/board.ts'
import {
  arcPoints,
  BOARD_LAYOUTS,
  cellNameLines,
  centre,
  piecePoints,
  pieceOffsets,
  spiral,
  type BoardShape,
  type CellBox,
} from '../../../src/games/promotion/boardLayout.ts'

const SHAPES: BoardShape[] = ['portrait', 'landscape']

const overlap = (a: CellBox, b: CellBox) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe.each(SHAPES)('the %s layout', (shape) => {
  const layout = BOARD_LAYOUTS[shape]

  it('lays out every BOARD id exactly once, in order', () => {
    expect(layout.cells.map((cell) => cell.id)).toEqual(BOARD.map((cell) => cell.id))
    expect(layout.byId.size).toBe(BOARD.length)
  })

  it('gives every cell unique coordinates inside the viewBox', () => {
    const corners = new Set(layout.cells.map((cell) => `${cell.x},${cell.y}`))
    expect(corners.size).toBe(BOARD.length)
    for (const cell of layout.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.x + cell.width).toBeLessThanOrEqual(layout.width)
      expect(cell.y + cell.height).toBeLessThanOrEqual(layout.height)
    }
  })

  it('has no two cells overlapping', () => {
    layout.cells.forEach((a, i) => {
      for (const b of layout.cells.slice(i + 1))
        expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false)
    })
  })

  it('winds on from each cell to a neighbour, so the ladder reads as a path', () => {
    const rings = layout.cells.slice(0, -1)
    rings.slice(1).forEach((cell, i) => {
      const before = rings[i]
      const steps = Math.abs(cell.x - before.x) + Math.abs(cell.y - before.y)
      expect(steps, `${before.id} to ${cell.id}`).toBeLessThanOrEqual(
        Math.max(cell.width, cell.height) + 8,
      )
    })
  })

  it('starts in the bottom left corner and ends with the big cell in the middle', () => {
    const [first] = layout.cells
    expect(first.x).toBe(Math.min(...layout.cells.map((cell) => cell.x)))
    expect(first.y + first.height).toBe(Math.max(...layout.cells.map((c) => c.y + c.height)))

    const end = layout.byId.get(END_CELL) as CellBox
    expect(end.width * end.height).toBeGreaterThan(first.width * first.height * 4)
    const middle = centre(end)
    expect(middle.x).toBeCloseTo(layout.width / 2)
    expect(middle.y).toBeCloseTo(layout.height / 2)
  })

  it('keeps up to six pieces apart, inside their cell', () => {
    const cell = layout.cells[0]
    for (let count = 1; count <= 6; count++) {
      const offsets = pieceOffsets(count, cell)
      expect(offsets).toHaveLength(count)
      expect(new Set(offsets.map(({ x, y }) => `${x},${y}`)).size).toBe(count)
      for (const { x, y } of offsets) {
        expect(Math.abs(x)).toBeLessThan(cell.width / 2)
        expect(Math.abs(y)).toBeLessThan(cell.height / 2)
      }
    }
  })
})

describe('the shapes', () => {
  it('is taller than wide for a phone held upright, and wider than tall for a wide screen', () => {
    expect(BOARD_LAYOUTS.portrait.height).toBeGreaterThan(BOARD_LAYOUTS.portrait.width)
    expect(BOARD_LAYOUTS.landscape.width).toBeGreaterThan(BOARD_LAYOUTS.landscape.height)
  })

  it('leaves a cell at least 50px wide when the portrait board fills a 390px phone', () => {
    const scale = (390 - 16) / BOARD_LAYOUTS.portrait.width
    expect(BOARD_LAYOUTS.portrait.cells[0].width * scale).toBeGreaterThanOrEqual(50)
  })
})

describe('spiral', () => {
  it('goes right, up, left and down, then one ring in', () => {
    expect(spiral(3, 3, 9)).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 1],
      [2, 0],
      [1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ])
  })

  it('never repeats a square and stops at the count', () => {
    const squares = spiral(7, 12, 78)
    expect(squares).toHaveLength(78)
    expect(new Set(squares.map(String)).size).toBe(78)
  })
})

describe('piecePoints', () => {
  it('puts pieces on one cell apart and in seat order, others on their own cells', () => {
    const layout = BOARD_LAYOUTS.portrait
    const points = piecePoints(
      [
        { seat: 0, cell: 'baiding' },
        { seat: 1, cell: 'baiding' },
        { seat: 2, cell: END_CELL },
      ],
      layout,
    )
    expect(points.get(0)?.x).toBeLessThan(points.get(1)?.x as number)
    expect(points.get(2)?.x).toBeCloseTo(centre(layout.byId.get(END_CELL) as CellBox).x)
  })

  it('leaves out a cell it does not know, rather than draw it at the corner', () => {
    expect(piecePoints([{ seat: 0, cell: 'nowhere' }], BOARD_LAYOUTS.portrait).size).toBe(0)
  })
})

describe('cellNameLines', () => {
  it('drops the gloss and breaks Latin at spaces', () => {
    expect(cellNameLines('Juren (Provincial Graduate)')).toEqual({ lines: ['Juren'], latin: true })
    expect(cellNameLines('Ling Shiwei Neidachen (x)')).toEqual({
      lines: ['Ling Shiwei', 'Neidachen'],
      latin: true,
    })
  })

  it('keeps short Chinese whole and breaks long Chinese in half, longer half first', () => {
    expect(cellNameLines('白丁')).toEqual({ lines: ['白丁'], latin: false })
    expect(cellNameLines('額外外委').lines).toEqual(['額外', '外委'])
    expect(cellNameLines('左副都御史').lines).toEqual(['左副都', '御史'])
  })

  it('never makes more than three lines of any name on the board', () => {
    for (const cell of BOARD) {
      expect(cellNameLines(cell.name.en).lines.length).toBeLessThanOrEqual(2)
      expect(cellNameLines(cell.name['zh-TW']).lines.length).toBeLessThanOrEqual(2)
    }
  })
})

describe('arcPoints', () => {
  const from = { x: 0, y: 500 }
  const to = { x: 400, y: 500 }

  it('runs from the start to the end', () => {
    const points = arcPoints(from, to, 16)
    expect(points).toHaveLength(17)
    expect(points[0]).toEqual(from)
    expect(points.at(-1)).toEqual(to)
  })

  it('bows upward on the screen going either way', () => {
    expect(arcPoints(from, to, 2)[1].y).toBeLessThan(from.y)
    expect(arcPoints(to, from, 2)[1].y).toBeLessThan(from.y)
  })

  it('survives a piece that does not go anywhere', () => {
    expect(arcPoints(from, from, 2)[1]).toEqual(from)
  })
})
