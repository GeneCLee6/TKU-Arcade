import { describe, expect, it } from 'vitest'
import { BOARD_FULL, FULL_DEPARTMENTS } from '../../../shared/games/promotion/boardFull.ts'
import { promotionFullMessages } from '../../../shared/games/promotion/i18n.full.ts'
import type { FullLastTurn, FullPlayer } from '../../../shared/games/promotion/types.ts'
import { artSymbol, fullArtSize } from '../../../src/games/promotion/full/fullArt.ts'
import { fullBoardCharacters } from '../../../src/games/promotion/full/fullFont.ts'
import { fullCellForKey } from '../../../src/games/promotion/full/fullKeys.ts'
import { FULL_LAYOUTS, fitFullBoard } from '../../../src/games/promotion/full/fullLayout.ts'
import { boardCellName } from '../../../src/games/promotion/full/fullText.ts'
import { beforeTransfers } from '../../../src/games/promotion/full/fullWords.ts'
import { beatsOf, nextTurnPlayback } from '../../../src/games/promotion/full/useTurnPlayback.ts'
import sprite from '../../../src/games/promotion/rankArt.svg?raw'

const symbols = [...sprite.matchAll(/<symbol id="(\w+)"/g)].map((match) => match[1])
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('the full board on one screen (e3-t14)', () => {
  it.each(Object.values(FULL_LAYOUTS))('$shape: every cell once, none overlapping', (layout) => {
    expect(layout.cells).toHaveLength(BOARD_FULL.length)
    expect(new Set(layout.cells.map((cell) => cell.id)).size).toBe(BOARD_FULL.length)
    expect(layout.blocks).toHaveLength(Object.keys(FULL_DEPARTMENTS).length)
    for (const [at, a] of layout.cells.entries()) {
      expect(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.width && a.y + a.height <= layout.height).toBe(true)
      for (const b of layout.cells.slice(at + 1)) expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false)
    }
  })

  it('is wide on a desktop and tall on a phone held upright', () => {
    expect(fitFullBoard(1400, 600).layout.shape).toBe('wide')
    expect(fitFullBoard(370, 560).layout.shape).toBe('tall')
    expect(FULL_LAYOUTS.wide.width / FULL_LAYOUTS.wide.height).toBeGreaterThan(1.8)
    expect(FULL_LAYOUTS.tall.width / FULL_LAYOUTS.tall.height).toBeLessThan(0.7)
  })

  it('moves the focus by what is on the screen, Home and End to both ends of a career', () => {
    const layout = FULL_LAYOUTS.wide
    expect(fullCellForKey(layout, 'zhixian', 'Home')).toBe('baiding')
    expect(fullCellForKey(layout, 'zhixian', 'End')).toBe('dahe')
    // Along a ministry, lowest to highest
    expect(fullCellForKey(layout, 'revenue-zhushi', 'ArrowRight')).toBe('revenue-yuanwailang')
    expect(fullCellForKey(layout, 'revenue-zhushi', 'ArrowUp')).toBe('personnel-zhushi')
    expect(fullCellForKey(layout, 'zhixian', 'Tab')).toBeNull()
  })
})

describe('the full board’s watermarks', () => {
  it('has a drawing for every cell, the three new ones among them', () => {
    for (const cell of BOARD_FULL) expect(symbols, cell.id).toContain(artSymbol(cell.art))
    expect(symbols).toEqual(expect.arrayContaining(['peer', 'arch', 'exile']))
    expect(sprite).not.toMatch(/<!--(?:(?!-->)[\s\S])*--(?!>)/)
  })

  it('draws a higher office no smaller', () => {
    const offices = BOARD_FULL.filter((cell) => cell.kind === 'office').sort((a, b) => a.rank - b.rank)
    for (let at = 1; at < offices.length; at++) {
      expect(fullArtSize(offices[at])).toBeGreaterThanOrEqual(fullArtSize(offices[at - 1]))
    }
  })
})

describe('the full board’s words', () => {
  it('leaves the department’s name off a cell under its plaque, never to a single character', () => {
    expect(boardCellName('revenue-zhushi', 'zh-TW')).toBe('主事')
    expect(boardCellName('revenue-zhushi', 'en')).toBe('Zhushi')
    expect(boardCellName('zhixian', 'zh-TW')).toBe('知縣')
    expect(boardCellName('dali-qing', 'zh-TW')).toBe('大理寺卿')
    for (const cell of BOARD_FULL) expect([...boardCellName(cell.id, 'zh-TW')].length).toBeGreaterThan(1)
  })

  it('asks the font for every character the board draws', () => {
    const chars = fullBoardCharacters()
    for (const cell of BOARD_FULL) for (const char of cell.name['zh-TW']) expect(chars).toContain(char)
    for (const char of '良柔歸宿') expect(chars).toContain(char)
  })

  it('has both languages for every key', () => {
    expect(Object.keys(promotionFullMessages['zh-TW']).sort()).toEqual(
      Object.keys(promotionFullMessages.en).sort(),
    )
  })
})

const player = (seat: number, money: number): FullPlayer => ({
  seat,
  cell: 'baiding',
  rank: 0,
  money,
  degree: 0,
  wu: false,
  banner: false,
  origin: 'baiding',
  status: 'active',
  rolls: 1,
})

const turn: FullLastTurn = {
  seat: 0,
  birth: false,
  throws: [
    { dice: [1, 2, 3, 5], combo: 'none', steps: [] },
    { dice: [4, 4, 6, 6], combo: 'redPairs', steps: ['de', 'de'] },
  ],
  from: 'shengyuan',
  path: ['bagong', 'zhixian'],
  transfers: [
    { from: 1, to: 0, amount: 5, why: 'courtesy' },
    { from: null, to: 0, amount: 10, why: 'reward' },
  ],
}

describe('a turn played out beat by beat', () => {
  it('throws, then moves, then pays', () => {
    expect(beatsOf(turn).map((beat) => beat.kind)).toEqual([
      'throw',
      'read',
      'throw',
      'read',
      'move',
      'move',
      'pay',
    ])
    expect(beatsOf({ ...turn, transfers: [] }).at(-1)?.kind).toBe('move')
  })

  it('plays only a turn rolled while watching, and not with reduced motion', () => {
    const idle = { count: 3, at: 0, beat: null }
    expect(nextTurnPlayback(idle, 4, turn, false).beat).toEqual({ kind: 'throw', index: 0 })
    expect(nextTurnPlayback(idle, 6, turn, false).beat).toBeNull()
    expect(nextTurnPlayback(idle, 4, turn, true).beat).toBeNull()
    expect(nextTurnPlayback(idle, 3, turn, false)).toBe(idle)
  })

  it('shows the silver as it was until the transfers play', () => {
    const { money, bank } = beforeTransfers([player(0, 115), player(1, 95)], 90, turn.transfers)
    expect(money.get(0)).toBe(100)
    expect(money.get(1)).toBe(100)
    expect(bank).toBe(100)
  })
})
