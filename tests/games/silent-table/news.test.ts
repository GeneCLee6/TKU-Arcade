import { describe, expect, it } from 'vitest'
import type { SilentTableView } from '../../../shared/games/silent-table/types.ts'
import { tableNews } from '../../../src/games/silent-table/news.ts'

const view = (chips: (number | null)[], over: Partial<SilentTableView> = {}) =>
  ({
    phase: 'round',
    round: 1,
    level: 1,
    players: chips.map((chip, seat) => ({ seat, chip })),
    ...over,
  }) as unknown as SilentTableView

describe('what the table says happened', () => {
  it('a chip off the table', () => {
    expect(tableNews(view([null, null, null]), view([null, 2, null]))).toEqual({
      kind: 'took',
      seat: 1,
      chip: 2,
      from: null,
    })
  })

  it('a chip from another seat, with who lost it', () => {
    expect(tableNews(view([2, null, null]), view([null, 2, null]))).toEqual({
      kind: 'took',
      seat: 1,
      chip: 2,
      from: 0,
    })
  })

  it('a chip swapped for one on the table', () => {
    expect(tableNews(view([1, null, null]), view([3, null, null]))).toEqual({
      kind: 'took',
      seat: 0,
      chip: 3,
      from: null,
    })
  })

  it('nothing when only someone said ready', () => {
    expect(tableNews(view([1, 2, 3]), view([1, 2, 3]))).toBeNull()
  })

  it('a new round, which is not somebody taking anything', () => {
    expect(tableNews(view([1, 2, 3]), view([null, null, null], { round: 2 }))).toEqual({
      kind: 'round',
      round: 2,
    })
  })

  it('a new level', () => {
    expect(
      tableNews(view([1, 2, 3], { phase: 'reveal', round: 3 }), view([null, null, null], { level: 2 })),
    ).toEqual({ kind: 'level', level: 2 })
  })

  it('nothing to tell when the hands are shown: the reveal does that', () => {
    expect(tableNews(view([1, 2, 3], { round: 3 }), view([1, 2, 3], { round: 3, phase: 'reveal' }))).toBeNull()
  })
})
