import { describe, expect, it } from 'vitest'
import { BELOW, MIN_STAGE, stageHeight } from '../../../src/games/promotion/useBoardFit.ts'

describe('stageHeight', () => {
  it('is the screen below the stage less the dock and the gap round it', () => {
    expect(stageHeight(844, 120, 140)).toBe(844 - 120 - 140 - BELOW)
  })

  it('rounds down, so that the board never pushes the dock off by a fraction', () => {
    expect(stageHeight(844, 120.4, 140.3)).toBe(Math.floor(844 - 120.4 - 140.3 - BELOW))
  })

  it('never gives the board less than its minimum', () => {
    expect(stageHeight(390, 300, 140)).toBe(MIN_STAGE)
  })

  it('depends on nothing but the screen, the stage and the dock: the same three, the same height', () => {
    const heights = new Set(Array.from({ length: 20 }, () => stageHeight(667, 96, 133)))
    expect(heights.size).toBe(1)
  })
})
