import { describe, expect, it } from 'vitest'
import { BOARD, END_CELL, getCell } from '../../../shared/games/promotion/board.ts'
import {
  DEPARTMENTS,
  DEPARTMENT_IDS,
  knobOf,
} from '../../../shared/games/promotion/departments.ts'

describe('the departments', () => {
  it('put every cell of the board in exactly one department, and nothing else', () => {
    const all = DEPARTMENT_IDS.flatMap((id) => DEPARTMENTS[id])
    expect(all).toHaveLength(BOARD.length)
    expect(new Set(all).size).toBe(BOARD.length)
    for (const cell of BOARD) {
      const homes = DEPARTMENT_IDS.filter((id) => DEPARTMENTS[id].includes(cell.id))
      expect(homes, cell.id).toHaveLength(1)
    }
  })

  it('has the eight blocks and nothing more', () => {
    expect(Object.keys(DEPARTMENTS).sort()).toEqual([...DEPARTMENT_IDS].sort())
    expect(DEPARTMENT_IDS).toHaveLength(8)
  })

  it('lists each department most senior first, with the end of the game heading the top block', () => {
    expect(DEPARTMENTS.top[0]).toBe(END_CELL)
    for (const id of DEPARTMENT_IDS) {
      const ranks = DEPARTMENTS[id].map((cell) => getCell(cell).rank)
      ranks.slice(1).forEach((rank, at) => expect(rank, `${id} ${at + 1}`).toBeLessThanOrEqual(ranks[at]))
    }
  })
})

describe('knobOf', () => {
  it('gives the grades their hat buttons, first to ninth, and none outside the grades', () => {
    expect(knobOf(23)).toBe('ruby')
    expect(knobOf(22)).toBe('ruby')
    expect(knobOf(21)).toBe('coral')
    expect(knobOf(19)).toBe('sapphire')
    expect(knobOf(16)).toBe('lapis')
    expect(knobOf(14)).toBe('crystal')
    expect(knobOf(12)).toBe('shell')
    expect(knobOf(10)).toBe('gold')
    expect(knobOf(9)).toBe('engravedGold')
    expect(knobOf(6)).toBe('engravedGold')
    for (const rank of [0, 1, 4, 5, 24]) expect(knobOf(rank)).toBeNull()
  })
})
