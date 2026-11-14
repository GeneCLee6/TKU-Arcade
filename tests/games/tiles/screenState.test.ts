import { describe, expect, it } from 'vitest'
import type { TilesView } from '../../../shared/games/tiles/types.ts'
import {
  canPick,
  canTarget,
  eventOf,
  laidThisTurn,
  moveTiles,
  promptOf,
  rackLeft,
  sortRack,
} from '../../../src/games/tiles/screenState.ts'

const T = (suit: number, number: number, copy = 0) => suit * 26 + (number - 1) * 2 + copy

describe('the rack', () => {
  const rack = [T(1, 5), 104, T(0, 9), T(0, 5), T(3, 1)]

  it('sorts by number, then suit, the wildcards last', () => {
    expect(sortRack(rack, 'number')).toEqual([T(3, 1), T(0, 5), T(1, 5), T(0, 9), 104])
  })

  it('sorts by suit, then number, the wildcards last', () => {
    expect(sortRack(rack, 'suit')).toEqual([T(0, 5), T(0, 9), T(1, 5), T(3, 1), 104])
  })

  it('leaves out what is in the draft', () => {
    expect(rackLeft(rack, [[T(0, 9), 104]])).toEqual([T(1, 5), T(0, 5), T(3, 1)])
  })
})

describe('moving tiles', () => {
  const start = [[T(0, 1), T(0, 2), T(0, 3)]]

  it('puts rack tiles into a new set or an existing one', () => {
    expect(moveTiles(start, start, [T(1, 7)], 'new')).toEqual([...start, [T(1, 7)]])
    expect(moveTiles(start, start, [T(0, 4)], 0)).toEqual([[T(0, 1), T(0, 2), T(0, 3), T(0, 4)]])
  })

  it('takes a tile out of its set and drops sets left empty', () => {
    const table = [[T(0, 1), T(0, 2), T(0, 3)], [T(1, 7)]]
    expect(moveTiles(table, start, [T(1, 7)], 0)).toEqual([[T(0, 1), T(0, 2), T(0, 3), T(1, 7)]])
    expect(moveTiles(table, start, [T(0, 3)], 1)).toEqual([[T(0, 1), T(0, 2)], [T(1, 7), T(0, 3)]])
  })

  it('sends back to the rack only what came from it this turn', () => {
    const table = [[T(0, 1), T(0, 2), T(0, 3), T(0, 4)]]
    expect(moveTiles(table, start, [T(0, 4), T(0, 1)], 'rack')).toEqual(start)
    expect(moveTiles(start, start, [T(0, 1)], 'rack')).toBe(start)
  })

  it('marks what was laid this turn', () => {
    expect([...laidThisTurn([[T(0, 1), T(0, 2), T(0, 3), T(0, 4)]], start)]).toEqual([T(0, 4)])
  })

  it('keeps the sets on the table out of reach until the first play', () => {
    const table = [...start, [T(1, 9)]]
    expect(canTarget(start[0], start, false)).toBe(false)
    expect(canTarget(table[1], start, false)).toBe(true)
    expect(canTarget(start[0], start, true)).toBe(true)
    expect(canPick(T(0, 1), start, false)).toBe(false)
    expect(canPick(T(1, 9), start, false)).toBe(true)
    expect(canPick(T(0, 1), start, true)).toBe(true)
  })
})

describe('what the screen says', () => {
  const view = (parts: Partial<TilesView>): TilesView => ({
    phase: 'play',
    clock: 90,
    players: [0, 1],
    round: 1,
    totalRounds: 1,
    table: [],
    draft: null,
    turn: 0,
    turnNo: 1,
    pool: 70,
    passes: 0,
    seats: [
      { seat: 0, tiles: 14, melded: false, score: 0 },
      { seat: 1, tiles: 14, melded: true, score: 0 },
    ],
    you: 0,
    rack: [],
    last: null,
    history: [],
    ...parts,
  })
  const nameOf = (seat: number) => ['Al', 'Bo'][seat]

  it('asks for the first play, then for any play', () => {
    expect(promptOf(view({}), nameOf).key).toBe('games.tiles.ui.prompt.opening')
    expect(promptOf(view({ you: 1, turn: 1 }), nameOf).key).toBe('games.tiles.ui.prompt.yours')
  })

  it('tells the others whose turn it is, and when they are moving tiles', () => {
    expect(promptOf(view({ you: 1 }), nameOf)).toEqual({ key: 'games.tiles.ui.prompt.wait', name: 'Al' })
    expect(promptOf(view({ you: null, draft: [[1]] }), nameOf)).toEqual({ key: 'games.tiles.ui.prompt.moving', name: 'Al' })
  })

  it('says what just happened', () => {
    expect(eventOf(view({ last: { kind: 'drew', seat: 1, why: 'timeUp' } }), nameOf)).toEqual({
      key: 'games.tiles.ui.event.drew.timeUp',
      params: { name: 'Bo' },
    })
    expect(eventOf(view({ last: { kind: 'played', seat: 0, tiles: 3, first: true } }), nameOf)).toEqual({
      key: 'games.tiles.ui.event.playedFirst',
      params: { name: 'Al', tiles: 3 },
    })
    expect(eventOf(view({}), nameOf)).toBeNull()
  })
})
