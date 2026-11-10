import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { END_CELL, START_CELL } from '../../../shared/games/promotion/board.ts'
import { DEPARTMENTS } from '../../../shared/games/promotion/departments.ts'
import { BOARD_LAYOUTS, type CellBox } from '../../../src/games/promotion/boardLayout.ts'
import { cellForKey } from '../../../src/games/promotion/boardKeys.ts'
import { PromotionBoard } from '../../../src/games/promotion/PromotionBoard.tsx'

const layout = BOARD_LAYOUTS.stacked

function renderBoard(selected: string | null = null) {
  const onSelect = vi.fn()
  const { container } = render(
    <PromotionBoard
      layout={layout}
      pieces={[{ seat: 0, cell: 'baiding', mark: 'A' }]}
      activeSeat={0}
      selected={selected}
      onSelect={onSelect}
      flight={null}
      reducedMotion
      zoom={1}
    />,
  )
  const cell = (id: string) => container.querySelector(`[data-cell="${id}"]`) as SVGGElement
  const tabStops = () => container.querySelectorAll('[data-cell][tabindex="0"]')
  return { onSelect, cell, tabStops }
}

describe.each(['wide', 'stacked'] as const)('cellForKey on the %s board', (shape) => {
  const layout = BOARD_LAYOUTS[shape]
  const box = (id: string) => layout.byId.get(id) as CellBox

  it('moves one cell on the screen, along a row or a column', () => {
    // Juren is in the middle of the examinations block
    const right = cellForKey(layout, 'juren', 'ArrowRight') as string
    expect(box(right).y).toBe(box('juren').y)
    expect(box(right).x).toBeGreaterThan(box('juren').x)
    expect(cellForKey(layout, right, 'ArrowLeft')).toBe('juren')

    const up = cellForKey(layout, 'juren', 'ArrowUp') as string
    expect(box(up).x).toBe(box('juren').x)
    expect(box(up).y).toBeLessThan(box('juren').y)
    expect(cellForKey(layout, up, 'ArrowDown')).toBe('juren')
  })

  it('stays put at the edge of the board', () => {
    const corner = layout.cells.reduce((best, cell) => (cell.x + cell.y < best.x + best.y ? cell : best))
    expect(cellForKey(layout, corner.id, 'ArrowLeft')).toBe(corner.id)
    expect(cellForKey(layout, corner.id, 'ArrowUp')).toBe(corner.id)
  })

  it('crosses from one department to the next, and into the end cell and out of it', () => {
    const below = cellForKey(layout, DEPARTMENTS.top[1], 'ArrowUp')
    expect(below).toBe(END_CELL)
    expect(DEPARTMENTS.top).toContain(cellForKey(layout, END_CELL, 'ArrowDown'))
    // Down out of the last row of the top block lands in another department
    const last = DEPARTMENTS.top.at(-1) as string
    const next = cellForKey(layout, last, 'ArrowDown') as string
    expect(DEPARTMENTS.top).not.toContain(next)
  })

  it('every cell can get to every other with the arrows', () => {
    const seen = new Set([START_CELL])
    const queue = [START_CELL]
    while (queue.length > 0) {
      const id = queue.pop() as string
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        const next = cellForKey(layout, id, key) as string
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    expect(seen.size).toBe(layout.cells.length)
  })

  it('never gets stuck: whenever there is a cell wholly that way, an arrow moves', () => {
    const edge = (id: string, key: string) => {
      const from = box(id)
      return layout.cells.every((cell) => {
        if (key === 'ArrowRight') return cell.x < from.x + from.width
        if (key === 'ArrowLeft') return cell.x + cell.width > from.x
        if (key === 'ArrowDown') return cell.y < from.y + from.height
        return cell.y + cell.height > from.y
      })
    }
    for (const cell of layout.cells) {
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        if (!edge(cell.id, key)) expect(cellForKey(layout, cell.id, key), `${cell.id} ${key}`).not.toBe(cell.id)
      }
    }
  })

  it('Home and End are the ends of the game; other keys are not for the board', () => {
    expect(cellForKey(layout, END_CELL, 'Home')).toBe(START_CELL)
    expect(cellForKey(layout, START_CELL, 'End')).toBe(END_CELL)
    expect(cellForKey(layout, START_CELL, 'Tab')).toBeNull()
    expect(cellForKey(layout, START_CELL, 'a')).toBeNull()
  })
})

describe('PromotionBoard with a keyboard', () => {
  it('names the board and its cells for a screen reader, and explains the keys', () => {
    renderBoard()
    const board = screen.getByRole('group', { name: /Promotion board of 79 offices/ })
    expect(board).toHaveAccessibleDescription(/Arrow keys/)
    expect(screen.getAllByRole('button')).toHaveLength(79)
  })

  it('has one Tab stop, on the cell being shown', () => {
    const { tabStops, cell } = renderBoard('juren')
    expect(tabStops()).toHaveLength(1)
    expect(cell('juren')).toHaveAttribute('tabindex', '0')
    expect(cell('juren')).toHaveAttribute('aria-pressed', 'true')
  })

  it('has its Tab stop on the first cell when no cell is being shown', () => {
    const { tabStops } = renderBoard()
    expect(tabStops()).toHaveLength(1)
    expect(tabStops()[0]).toHaveAttribute('data-cell', START_CELL)
  })

  it('the arrows move the focus and the Tab stop with it', () => {
    const { cell, tabStops } = renderBoard()
    const first = START_CELL
    const next = cellForKey(layout, first, 'ArrowLeft') as string
    cell(first).focus()
    fireEvent.keyDown(cell(first), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(cell(next))
    expect(tabStops()).toHaveLength(1)
    expect(tabStops()[0]).toBe(cell(next))
  })

  it('Enter and Space select the cell; holding the key down does not toggle it over and over', () => {
    const { cell, onSelect } = renderBoard()
    const first = START_CELL
    fireEvent.keyDown(cell(first), { key: 'Enter' })
    fireEvent.keyDown(cell(first), { key: ' ' })
    fireEvent.keyDown(cell(first), { key: 'Enter', repeat: true })
    expect(onSelect.mock.calls).toEqual([[first], [first]])
  })

  it('leaves other keys and browser shortcuts alone', () => {
    const { cell, onSelect } = renderBoard()
    const first = START_CELL
    // fireEvent returns false when the handler called preventDefault
    expect(fireEvent.keyDown(cell(first), { key: 'Tab' })).toBe(true)
    expect(fireEvent.keyDown(cell(first), { key: 'ArrowLeft', altKey: true })).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
