import { describe, expect, it } from 'vitest'
import {
  BOARD_FULL,
  BOARD_FULL_V2,
  FULL_CENTRE,
  FULL_RINGS,
  fullBoard,
} from '../../../shared/games/promotion/boardFull.ts'
import { promotionFullMessages } from '../../../shared/games/promotion/i18n.full.ts'
import type { FullLastTurn, FullPlayer } from '../../../shared/games/promotion/types.ts'
import { artSymbol, fullArtSize } from '../../../src/games/promotion/full/fullArt.ts'
import { fullBoardCharacters } from '../../../src/games/promotion/full/fullFont.ts'
import { fullCellForKey } from '../../../src/games/promotion/full/fullKeys.ts'
import { loadFullData } from '../../../src/games/promotion/full/fullData.ts'
import { CELL_W, fitFullBoard, fullLayouts, LADDER } from '../../../src/games/promotion/full/fullLayout.ts'
import {
  fitBoard,
  SQUARE_ASPECTS,
  squareLayout,
  type SquareLayout,
} from '../../../src/games/promotion/full/fullSquare.ts'
import { boardCellName, shortCellName } from '../../../src/games/promotion/full/fullText.ts'
import { beforeTransfers, ladderGrade, lastComboText, turnSentence } from '../../../src/games/promotion/full/fullWords.ts'
import { beatsOf, nextTurnPlayback } from '../../../src/games/promotion/full/useTurnPlayback.ts'
import sprite from '../../../src/games/promotion/rankArt.svg?raw'

const symbols = [...sprite.matchAll(/<symbol id="(\w+)"/g)].map((match) => match[1])
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

// The board's names load after the first paint in the browser (C8); here, before anything asks
await loadFullData()

const COLUMNS = fullLayouts(fullBoard(1))
const SQUARES = SQUARE_ASPECTS.map((aspect) => squareLayout(fullBoard(2), aspect))
const ARRANGEMENTS = [
  // The first board keeps its columns (games from before C8); the second is a square board (C9)
  ...Object.values(COLUMNS).map((layout) => ({ version: 1 as const, shape: layout.shape, layout })),
  ...SQUARES.map((layout) => ({
    version: 2 as const,
    shape: `square ${(layout.width / layout.height).toFixed(2)}`,
    layout,
  })),
]
type Rect = { x: number; y: number; width: number; height: number }
const inside = (a: Rect, b: Rect) =>
  a.x >= b.x - 0.01 &&
  a.y >= b.y - 0.01 &&
  a.x + a.width <= b.x + b.width + 0.01 &&
  a.y + a.height <= b.y + b.height + 0.01

describe('the full board on one screen (e3-t14, C8, C9)', () => {
  it.each(ARRANGEMENTS)('board $version, $shape: every cell once, none overlapping', ({ version, layout }) => {
    const board = fullBoard(version)
    expect(layout.cells).toHaveLength(board.cells.length)
    expect(new Set(layout.cells.map((cell) => cell.id)).size).toBe(board.cells.length)
    expect(layout.blocks).toHaveLength(board.depts.length + (version === 2 ? 1 : 0))
    expect(layout.rungs.map((rung) => rung.grade)).toEqual(version === 2 ? LADDER : [])
    const boxes = [...layout.cells, ...layout.rungs.map((rung) => ({ ...rung, id: `grade-${rung.grade}` }))]
    for (const [at, a] of boxes.entries()) {
      expect(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.width && a.y + a.height <= layout.height).toBe(true)
      for (const b of boxes.slice(at + 1)) expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false)
    }
    for (const [at, a] of layout.blocks.entries()) {
      for (const b of layout.blocks.slice(at + 1)) expect(overlap(a, b), `${a.id} ${b.id}`).toBe(false)
    }
  })

  it('board 1 is wide on a desktop and tall on a phone held upright', () => {
    expect(fitFullBoard(COLUMNS, 1400, 600).layout.shape).toBe('wide')
    expect(fitFullBoard(COLUMNS, 370, 560).layout.shape).toBe('tall')
    expect(COLUMNS.wide.width / COLUMNS.wide.height).toBeGreaterThan(1.8)
    expect(COLUMNS.tall.width / COLUMNS.tall.height).toBeLessThan(0.7)
    // A game from before C8 keeps its columns
    expect(fitBoard(fullBoard(1), 1400, 600).layout.shape).toBe('wide')
  })

  it('board 2 is a square board in the shape of its box', () => {
    for (const [width, height] of [
      [1400, 600],
      [860, 385],
      [560, 360],
      [370, 560],
    ]) {
      const { layout, scale } = fitBoard(fullBoard(2), width, height)
      expect(layout.shape).toBe('square')
      const shape = layout.width / layout.height / (width / height)
      expect(shape, `${width}x${height}`).toBeGreaterThan(0.9)
      expect(shape, `${width}x${height}`).toBeLessThan(1.1)
      expect(layout.width * scale).toBeLessThanOrEqual(width + 0.01)
      expect(layout.height * scale).toBeLessThanOrEqual(height + 0.01)
    }
  })

  it('the square board is about as big as the columns were', () => {
    const size = (version: 1 | 2, width: number, height: number) =>
      CELL_W * fitBoard(fullBoard(version), width, height).scale
    expect(size(2, 1264, 520) / size(1, 1264, 520)).toBeGreaterThan(0.8)
    // The board's box on a 1280 by 720 screen, the room's column beside it: C8's columns of the
    // second board drew a cell 27.7 px wide there
    expect(size(2, 860, 385)).toBeGreaterThan(27.5)
  })

  it('moves the focus by what is on the screen, Home and End to both ends of a career', () => {
    const layout = COLUMNS.wide
    expect(fullCellForKey(layout, 'zhixian', 'Home')).toBe('baiding')
    expect(fullCellForKey(layout, 'zhixian', 'End')).toBe('dahe')
    // Along a ministry, lowest to highest
    expect(fullCellForKey(layout, 'revenue-zhushi', 'ArrowRight')).toBe('revenue-yuanwailang')
    expect(fullCellForKey(layout, 'revenue-zhushi', 'ArrowUp')).toBe('personnel-zhushi')
    expect(fullCellForKey(layout, 'zhixian', 'Tab')).toBeNull()
  })
})

/** Where a box's middle is round a ring's band, clockwise from its top left corner: 0 up to 4 */
function roundRing(box: Rect, ring: SquareLayout['square']['rings'][number]) {
  const { outer, inner } = ring
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  if (y < inner.y) return (x - outer.x) / outer.width
  if (x > inner.x + inner.width) return 1 + (y - outer.y) / outer.height
  if (y > inner.y + inner.height) return 3 - (x - outer.x) / outer.width
  return 4 - (y - outer.y) / outer.height
}

describe('the square board (C9)', () => {
  it.each(SQUARES.map((layout) => ({ aspect: (layout.width / layout.height).toFixed(2), layout })))(
    'shape $aspect: each ring’s departments in its band, clockwise in order; the centre in the middle',
    ({ layout }) => {
      const { rings, centre, pot } = layout.square
      expect(rings).toHaveLength(FULL_RINGS.length)
      const blockOf = (id: string) => {
        const block = layout.blocks.find((each) => each.id === id)
        expect(block, id).toBeDefined()
        return block as NonNullable<typeof block>
      }
      FULL_RINGS.forEach((ids, at) => {
        const ring = rings[at]
        const places = ids.map((id) => {
          const block = blockOf(id)
          expect(inside(block, ring.outer), `${id} in ring ${at}`).toBe(true)
          expect(overlap(block, ring.inner), `${id} not inside ring ${at}`).toBe(false)
          return roundRing(block, ring)
        })
        for (let step = 1; step < places.length; step++) {
          expect(places[step], `${ids[step - 1]} then ${ids[step]}`).toBeGreaterThan(places[step - 1])
        }
      })
      for (const id of [...FULL_CENTRE, 'ladder']) expect(inside(blockOf(id), centre), id).toBe(true)
      expect(inside(pot, centre)).toBe(true)
      expect(pot.width).toBeGreaterThan(200)
      for (const block of layout.blocks) expect(overlap(block, pot), block.id).toBe(false)
    },
  )

  it('every cell that asks a question is on the outer ring, so a card inside it hides none', () => {
    const asking = BOARD_FULL_V2.filter((cell) => cell.offer || cell.minor)
    expect(asking.length).toBeGreaterThan(0)
    for (const layout of SQUARES) {
      for (const cell of asking) {
        expect(overlap(layout.byId.get(cell.id) as Rect, layout.square.inner), cell.id).toBe(false)
      }
    }
  })

  it('moves the focus by what is on the screen there too, every cell reachable', () => {
    const layout = squareLayout(fullBoard(2), 2.2)
    expect(fullCellForKey(layout, 'zhixian', 'Home')).toBe('baiding')
    expect(fullCellForKey(layout, 'zhixian', 'End')).toBe('dahe')
    const origins = BOARD_FULL_V2.filter((cell) => cell.dept === 'origin')
    expect(fullCellForKey(layout, origins[0].id, 'ArrowRight')).toBe(origins[1].id)
    for (const box of layout.cells) {
      const moves = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].map((key) =>
        fullCellForKey(layout, box.id, key),
      )
      expect(moves.some((next) => next !== box.id), box.id).toBe(true)
    }
  })
})

describe('the full board’s watermarks', () => {
  it('has a drawing for every cell, the three new ones among them', () => {
    for (const cell of [...BOARD_FULL, ...BOARD_FULL_V2]) expect(symbols, cell.id).toContain(artSymbol(cell.art))
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
    for (const cell of [...BOARD_FULL, ...BOARD_FULL_V2]) {
      expect([...boardCellName(cell.id, 'zh-TW')].length).toBeGreaterThan(1)
    }
  })

  it('asks the font for every character the board draws', () => {
    const chars = fullBoardCharacters()
    for (const cell of [...BOARD_FULL, ...BOARD_FULL_V2]) {
      for (const char of cell.name['zh-TW']) expect(chars).toContain(char)
    }
    for (const char of '良柔歸宿品級考授捐') expect(chars).toContain(char)
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

describe('the second rules in words (C8)', () => {
  const t = (key: string, params?: Record<string, string | number>) =>
    `${key}${params ? JSON.stringify(params) : ''}`

  it('says what a decision did, and when the time ran out', () => {
    const decided: FullLastTurn = {
      ...turn,
      throws: [],
      path: ['zhixian'],
      transfers: [],
      decision: { kind: 'buy', cell: 'zhixian', price: 30, timedOut: false },
    }
    expect(turnSentence(t, 'en', decided, player(0, 70), 'Ann')).toBe(
      `games.promotion.full.decided.buy${JSON.stringify({ name: 'Ann', cell: 'Zhixian', from: 'Shengyuan', price: 30 })}`,
    )
    const timed = { ...decided, decision: { kind: 'decline' as const, cell: 'fanglue-tenglu', price: 0, timedOut: true } }
    expect(turnSentence(t, 'en', timed, player(0, 70), 'Ann')).toMatch(/^games\.promotion\.full\.decided\.timedOut/)
  })

  it('says an event zone waits, and what its face decided', () => {
    const waiting: FullLastTurn = {
      ...turn,
      throws: [{ dice: [1, 2, 4, 6], combo: 'none', steps: [], event: { cell: 'daji', face: null } }],
      path: [],
      transfers: [],
    }
    expect(turnSentence(t, 'en', waiting, player(0, 70), 'Ann')).toBe(
      `games.promotion.full.waits${JSON.stringify({ name: 'Ann', cell: shortCellName('daji', 'en') })}`,
    )
    expect(lastComboText(t, waiting, 'en')).toMatch(/^games\.promotion\.full\.combo\.eventWait/)
    const decided = { ...waiting, throws: [{ dice: [4, 4, 5, 3], combo: 'pair' as const, steps: ['de' as const], event: { cell: 'daji', face: 'de' as const } }] }
    expect(lastComboText(t, decided, 'en')).toMatch(/^games\.promotion\.full\.combo\.event\{/)
    const none = { ...waiting, throws: [{ dice: [1, 2, 4, 6], combo: 'none' as const, steps: [] }] }
    expect(lastComboText(t, none, 'en')).toBe('games.promotion.full.combo.noMove')
  })

  it('puts each seat on the ladder at the grade the end compares, titles included', () => {
    const gradeOf = (rank: number) => Math.floor(rank / 2)
    const official = { ...player(0, 100), rank: 20, titles: 1 }
    expect(ladderGrade(official, gradeOf, true)).toBe(11)
    expect(ladderGrade(official, gradeOf, false)).toBe(10)
    expect(ladderGrade({ ...official, status: 'out' }, gradeOf, true)).toBe(0)
  })
})
