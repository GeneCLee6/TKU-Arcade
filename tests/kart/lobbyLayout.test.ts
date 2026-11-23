import { describe, expect, it } from 'vitest'
import { COLUMNS, placeOrder, spanOf } from '../../src/kart/lobby/lobbyLayout.ts'

// 2026-11-23 (owner: "the host should be one bigger card on its own, the others smaller")

describe("the race room's places", () => {
  it("puts the host's place first, then the rest in seat order", () => {
    expect(placeOrder(8, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(placeOrder(8, 5)).toEqual([5, 0, 1, 2, 3, 4, 6, 7])
    // No host seated: the first seat is the big one
    expect(placeOrder(8, null)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(placeOrder(4, 9)).toEqual([0, 1, 2, 3])
  })

  it('fills both rows beside it whatever the number of others', () => {
    for (let count = 1; count <= 7; count++) {
      const spans = Array.from({ length: count }, (_, index) => spanOf(index, count))
      const top = Math.ceil(count / 2)
      expect(spans.slice(0, top).reduce((sum, span) => sum + span, 0)).toBe(COLUMNS)
      if (count > 1) expect(spans.slice(top).reduce((sum, span) => sum + span, 0)).toBe(COLUMNS)
    }
    // Seven others: four on the first row, three on the second
    expect(Array.from({ length: 7 }, (_, index) => spanOf(index, 7))).toEqual([3, 3, 3, 3, 4, 4, 4])
  })
})
