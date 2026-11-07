import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { END_CELL } from '../../../shared/games/promotion/board.ts'
import { BOARD_LAYOUTS } from '../../../src/games/promotion/boardLayout.ts'
import { cellForKey } from '../../../src/games/promotion/boardKeys.ts'
import { PromotionBoard } from '../../../src/games/promotion/PromotionBoard.tsx'

const portrait = BOARD_LAYOUTS.portrait

function renderBoard(selected: string | null = null) {
  const onSelect = vi.fn()
  const { container } = render(
    <PromotionBoard
      layout={portrait}
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

describe('cellForKey', () => {
  const start = portrait.cells[0]

  it('moves one cell on the screen, along a row or a column', () => {
    const right = cellForKey(portrait, start.id, 'ArrowRight') as string
    const box = portrait.byId.get(right)
    expect(box?.y).toBe(start.y)
    expect(box && box.x > start.x).toBe(true)
    expect(cellForKey(portrait, right, 'ArrowLeft')).toBe(start.id)

    const up = cellForKey(portrait, start.id, 'ArrowUp') as string
    expect(portrait.byId.get(up)?.x).toBe(start.x)
    expect(cellForKey(portrait, up, 'ArrowDown')).toBe(start.id)
  })

  it('stays put at the edge of the board', () => {
    // The first cell is the bottom left corner
    expect(cellForKey(portrait, start.id, 'ArrowLeft')).toBe(start.id)
    expect(cellForKey(portrait, start.id, 'ArrowDown')).toBe(start.id)
  })

  it('reaches the end cell, which spans several rows, and gets out of it', () => {
    const end = portrait.byId.get(END_CELL)
    expect(end).toBeDefined()
    const beside = portrait.cells.find(
      (box) => box.y === end?.y && box.x < (end?.x ?? 0) && box.x + box.width + 4 === end?.x,
    )
    expect(beside).toBeDefined()
    expect(cellForKey(portrait, beside?.id ?? '', 'ArrowRight')).toBe(END_CELL)
    expect(cellForKey(portrait, END_CELL, 'ArrowLeft')).not.toBe(END_CELL)
  })

  it('every cell can get to every other with the arrows', () => {
    const seen = new Set([start.id])
    const queue = [start.id]
    while (queue.length > 0) {
      const id = queue.pop() as string
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        const next = cellForKey(portrait, id, key) as string
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    expect(seen.size).toBe(portrait.cells.length)
  })

  it('Home and End are the ends of the game; other keys are not for the board', () => {
    expect(cellForKey(portrait, END_CELL, 'Home')).toBe(start.id)
    expect(cellForKey(portrait, start.id, 'End')).toBe(END_CELL)
    expect(cellForKey(portrait, start.id, 'Tab')).toBeNull()
    expect(cellForKey(portrait, start.id, 'a')).toBeNull()
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
    expect(tabStops()[0]).toHaveAttribute('data-cell', portrait.cells[0].id)
  })

  it('the arrows move the focus and the Tab stop with it', () => {
    const { cell, tabStops } = renderBoard()
    const first = portrait.cells[0].id
    const next = cellForKey(portrait, first, 'ArrowRight') as string
    cell(first).focus()
    fireEvent.keyDown(cell(first), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cell(next))
    expect(tabStops()).toHaveLength(1)
    expect(tabStops()[0]).toBe(cell(next))
  })

  it('Enter and Space select the cell; holding the key down does not toggle it over and over', () => {
    const { cell, onSelect } = renderBoard()
    const first = portrait.cells[0].id
    fireEvent.keyDown(cell(first), { key: 'Enter' })
    fireEvent.keyDown(cell(first), { key: ' ' })
    fireEvent.keyDown(cell(first), { key: 'Enter', repeat: true })
    expect(onSelect.mock.calls).toEqual([[first], [first]])
  })

  it('leaves other keys and browser shortcuts alone', () => {
    const { cell, onSelect } = renderBoard()
    const first = portrait.cells[0].id
    // fireEvent returns false when the handler called preventDefault
    expect(fireEvent.keyDown(cell(first), { key: 'Tab' })).toBe(true)
    expect(fireEvent.keyDown(cell(first), { key: 'ArrowLeft', altKey: true })).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
