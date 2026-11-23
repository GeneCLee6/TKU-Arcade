import { describe, expect, it } from 'vitest'
import { BELOW, MIN_STAGE, stageHeight } from '../../../src/games/promotion/useBoardFit.ts'

describe('stageHeight', () => {
  it('is the screen below the stage less the dock and the gap round it', () => {
    expect(stageHeight(844, 120, 140)).toBe(844 - 120 - 140 - BELOW)
  })

  it('rounds down, so that the board never pushes the dock off by a fraction', () => {
    expect(stageHeight(844, 120.4, 140.3)).toBe(Math.floor(844 - 120.4 - 140.3 - BELOW))
  })

  // 2026-11-23: a phone on its side, where the bar, the heading and the dock leave the board too little
  it('takes the whole screen above the dock when too little is left under what is above it', () => {
    expect(stageHeight(390, 164, 89)).toBe(390 - 89 - BELOW)
    expect(stageHeight(375, 164, 89)).toBe(375 - 89 - BELOW)
  })

  it('never gives the board less than its minimum', () => {
    expect(stageHeight(390, 300, 140)).toBe(MIN_STAGE)
  })

  it('depends on nothing but the screen, the stage and the dock: the same three, the same height', () => {
    const heights = new Set(Array.from({ length: 20 }, () => stageHeight(667, 96, 133)))
    expect(heights.size).toBe(1)
  })
})
