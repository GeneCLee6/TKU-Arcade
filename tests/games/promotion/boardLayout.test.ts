import { describe, expect, it } from 'vitest'
import { BOARD, END_CELL, START_CELL } from '../../../shared/games/promotion/board.ts'
import { DEPARTMENTS, DEPARTMENT_IDS } from '../../../shared/games/promotion/departments.ts'
import {
  arcPoints,
  BOARD_LAYOUTS,
  cellNameLines,
  centre,
  piecePoints,
  pieceOffsets,
  type BoardShape,
  type Box,
  type CellBox,
} from '../../../src/games/promotion/boardLayout.ts'

const SHAPES: BoardShape[] = ['wide', 'stacked']

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-9

describe.each(SHAPES)('the %s layout', (shape) => {
  const layout = BOARD_LAYOUTS[shape]

  it('lays out every BOARD id exactly once', () => {
    expect(layout.cells.map((cell) => cell.id).sort()).toEqual(BOARD.map((cell) => cell.id).sort())
    expect(layout.byId.size).toBe(BOARD.length)
  })

  it('has the eight departments, none overlapping, all inside the frame', () => {
    expect(layout.blocks.map((block) => block.id).sort()).toEqual([...DEPARTMENT_IDS].sort())
    const frame = { x: 0, y: 0, width: layout.width, height: layout.height }
    layout.blocks.forEach((a, i) => {
      expect(inside(a, frame), a.id).toBe(true)
      for (const b of layout.blocks.slice(i + 1)) {
        expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false)
      }
    })
  })

  it('puts each cell inside its own department, under the plaque, and no two cells overlap', () => {
    for (const block of layout.blocks) {
      for (const id of DEPARTMENTS[block.id]) {
        const cell = layout.byId.get(id) as CellBox
        expect(inside(cell, block), `${id} in ${block.id}`).toBe(true)
        expect(cell.y).toBeGreaterThan(block.plaqueY + 18)
      }
    }
    layout.cells.forEach((a, i) => {
      for (const b of layout.cells.slice(i + 1)) {
        expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false)
      }
    })
  })

  it('reads each department from its most senior office, left to right, then down', () => {
    for (const id of DEPARTMENT_IDS) {
      const boxes = DEPARTMENTS[id].map((cell) => layout.byId.get(cell) as CellBox)
      boxes.slice(1).forEach((box, at) => {
        const before = boxes[at]
        const later = box.y > before.y || (box.y === before.y && box.x > before.x)
        expect(later, `${before.id} before ${box.id}`).toBe(true)
      })
    }
  })

  it('makes the end cell the big one across the top of the top block', () => {
    const end = layout.byId.get(END_CELL) as CellBox
    const top = layout.blocks.find((block) => block.id === 'top') as Box
    const first = layout.byId.get(DEPARTMENTS.top[1]) as CellBox
    expect(end.width).toBeGreaterThan(first.width * 3)
    expect(end.height).toBeGreaterThan(first.height)
    expect(end.y).toBeLessThan(first.y)
    expect(inside(end, top)).toBe(true)
  })

  it('keeps up to six pieces apart, inside their cell', () => {
    for (const id of [START_CELL, END_CELL]) {
      const cell = layout.byId.get(id) as CellBox
      for (let count = 1; count <= 6; count++) {
        const offsets = pieceOffsets(count, cell, id === END_CELL)
        expect(offsets).toHaveLength(count)
        expect(new Set(offsets.map(({ x, y }) => `${x},${y}`)).size).toBe(count)
        for (const { x, y } of offsets) {
          expect(Math.abs(x)).toBeLessThan(cell.width / 2)
          expect(Math.abs(y)).toBeLessThan(cell.height / 2)
        }
      }
    }
  })
})

describe('the shapes', () => {
  it('is the traditional sheet on a wide screen: guard, top, hanlin across the first row', () => {
    const { blocks } = BOARD_LAYOUTS.wide
    const at = (id: string) => blocks.find((block) => block.id === id) as Box
    expect(at('guard').x).toBeLessThan(at('top').x)
    expect(at('top').x).toBeLessThan(at('hanlin').x)
    expect(at('guard').y).toBe(at('top').y)
    expect(at('army').y).toBe(at('capital').y)
    expect(at('wuke').y).toBe(at('exam').y)
    // The local block runs down beside both lower rows
    expect(at('local').y).toBe(at('army').y)
    expect(at('local').y + at('local').height).toBe(at('exam').y + at('exam').height)
  })

  it('stacks the blocks in one column on a phone, from the top block down to the examinations', () => {
    const { blocks } = BOARD_LAYOUTS.stacked
    expect(blocks.map((block) => block.id)).toEqual([
      'top',
      'guard',
      'hanlin',
      'army',
      'capital',
      'local',
      'wuke',
      'exam',
    ])
    expect(new Set(blocks.map((block) => block.x)).size).toBe(1)
    blocks.slice(1).forEach((block, at) => expect(block.y).toBeGreaterThan(blocks[at].y))
  })

  it('leaves a phone cell at least 70px wide when the stacked board fills a 390px screen', () => {
    const scale = (390 - 16) / BOARD_LAYOUTS.stacked.width
    const cell = BOARD_LAYOUTS.stacked.byId.get(START_CELL) as CellBox
    expect(cell.width * scale).toBeGreaterThanOrEqual(70)
  })
})

describe('piecePoints', () => {
  it('puts pieces on one cell apart and in seat order, others on their own cells', () => {
    const layout = BOARD_LAYOUTS.stacked
    const points = piecePoints(
      [
        { seat: 0, cell: 'baiding' },
        { seat: 1, cell: 'baiding' },
        { seat: 2, cell: END_CELL },
      ],
      layout,
    )
    // From the right corner leftwards
    expect(points.get(0)?.x).toBeGreaterThan(points.get(1)?.x as number)
    expect(points.get(2)?.x).toBeCloseTo(centre(layout.byId.get(END_CELL) as CellBox).x)
  })

  it('leaves out a cell it does not know, rather than draw it at the corner', () => {
    expect(piecePoints([{ seat: 0, cell: 'nowhere' }], BOARD_LAYOUTS.stacked).size).toBe(0)
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

  it('never makes more than two lines of any name on the board', () => {
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
