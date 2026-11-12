import { describe, expect, it } from 'vitest'
import { BOARD, END_CELL, getCell } from '../../../shared/games/promotion/board.ts'
import { DEPARTMENTS } from '../../../shared/games/promotion/departments.ts'
import { artHref, knobStyle, rankArtOf, rankArtSize } from '../../../src/games/promotion/rankArt.ts'
import sprite from '../../../src/games/promotion/rankArt.svg?raw'

const symbols = [...sprite.matchAll(/<symbol id="(\w+)"/g)].map((match) => match[1])

// The order a career's hats go in, from nothing to the grandest
const LADDER = ['cap', 'scholar', 'laureate', 'official1', 'official2', 'official3', 'court']

describe('the rank watermarks (e3-t11)', () => {
  it('gives every office a drawing that the sprite has, and the end of the game none', () => {
    for (const cell of BOARD) {
      const art = rankArtOf(cell.id)
      if (cell.id === END_CELL) expect(art).toBeNull()
      else expect(symbols, cell.id).toContain(art)
    }
    expect(artHref('court')).toMatch(/rankArt[^#]*svg[^#]*#court$/)
  })

  it('goes by the stage of a career: no post, the top of the examinations, guard, army, court', () => {
    expect(rankArtOf('baiding')).toBe('cap')
    expect(rankArtOf('juren')).toBe('scholar')
    expect(rankArtOf('zhuangyuan')).toBe('laureate')
    expect(rankArtOf('wuzhuangyuan')).toBe('laureate')
    expect(rankArtOf('zhixian')).toBe('official1')
    expect(rankArtOf('zhifu')).toBe('official2')
    expect(rankArtOf('xunfu')).toBe('official3')
    expect(rankArtOf('lanling')).toBe('guard1')
    expect(rankArtOf('yidengshiwei')).toBe('guard2')
    expect(rankArtOf('qianzong')).toBe('helmet1')
    expect(rankArtOf('tidu')).toBe('helmet3')
    for (const id of DEPARTMENTS.top.slice(1)) expect(rankArtOf(id)).toBe('court')
  })

  it('never gives a civil office a lesser hat than a lower one', () => {
    const civil = BOARD.filter(
      (cell) =>
        cell.id !== END_CELL &&
        !DEPARTMENTS.army.includes(cell.id) &&
        !DEPARTMENTS.guard.includes(cell.id) &&
        !DEPARTMENTS.wuke.includes(cell.id),
    )
    for (const a of civil) {
      for (const b of civil) {
        if (a.rank < b.rank) {
          const [low, high] = [rankArtOf(a.id) as string, rankArtOf(b.id) as string]
          expect(LADDER.indexOf(low), `${a.id} ${b.id}`).toBeLessThanOrEqual(LADDER.indexOf(high))
        }
      }
    }
  })

  it('draws a higher rank bigger, never past the cell', () => {
    for (let rank = 1; rank <= 23; rank++) {
      expect(rankArtSize(rank)).toBeGreaterThan(rankArtSize(rank - 1))
    }
    expect(rankArtSize(0)).toBe(0.5)
    expect(rankArtSize(23)).toBeLessThanOrEqual(1)
  })

  it("colours the drawing's hat button by the rank, as the button in the cell's corner", () => {
    expect(knobStyle(getCell('baiding').rank)).toBeUndefined()
    expect(knobStyle(23)).toEqual({ '--knob': expect.stringMatching(/^#/) })
  })

  it('is plain line art: no colours of its own, no scripts, nothing fetched from elsewhere', () => {
    expect(sprite).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(sprite).not.toMatch(/<script|<image|href=|url\(|<foreignObject/i)
    expect(sprite).toMatch(/currentColor/)
    expect(sprite).toMatch(/var\(--knob/)
    expect(sprite.length).toBeLessThan(100_000)
  })
})
