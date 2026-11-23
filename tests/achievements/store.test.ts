import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACHIEVEMENTS_KEY,
  EMPTY_SAVED,
  loadSaved,
  mergeSaved,
  parseSaved,
  save,
  serialize,
} from '../../src/achievements/store.ts'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('what this browser keeps', () => {
  it('keeps and reads back the stats and the unlocks', () => {
    const saved = { stats: { n: { 'kart.finishes': 2 }, t: { 'kart.karts': { tide: 2 } } }, unlocked: { 'kart-first-finish': 1_763_900_000_000 } }
    save(saved)
    expect(JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY)!)).toMatchObject({ format: 1 })
    expect(loadSaved()).toEqual(saved)
  })

  it('reads anything broken as nothing kept, field by field', () => {
    expect(parseSaved(null)).toEqual(EMPTY_SAVED)
    expect(parseSaved('{not json')).toEqual(EMPTY_SAVED)
    expect(parseSaved('[]')).toEqual(EMPTY_SAVED)
    expect(parseSaved('"text"')).toEqual(EMPTY_SAVED)
    expect(parseSaved(JSON.stringify({ format: 2, stats: {}, unlocked: {} }))).toEqual(EMPTY_SAVED)
    expect(
      parseSaved(
        JSON.stringify({
          format: 1,
          stats: { n: { 'kart.finishes': 'many' } },
          unlocked: { 'kart-first-finish': 'yesterday', 'Bad Id': 5, 'future-rule': 10, 'kart-gap': -1 },
        }),
      ),
    ).toEqual({ stats: { n: {}, t: {} }, unlocked: { 'future-rule': 10 } })
  })

  it('works without localStorage: nothing kept, nothing thrown', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(loadSaved()).toEqual(EMPTY_SAVED)
    expect(() => save(EMPTY_SAVED)).not.toThrow()
  })

  it('merges two copies (an account and a browser): every unlock at its earlier time', () => {
    const a = { stats: { n: { 'board.wins': 2 }, t: {} }, unlocked: { 'board-first-win': 200, 'kart-gap': 50 } }
    const b = { stats: { n: { 'board.wins': 5 }, t: {} }, unlocked: { 'board-first-win': 100, 'platform-app': 300 } }
    expect(mergeSaved(a, b)).toEqual({
      stats: { n: { 'board.wins': 5 }, t: {} },
      unlocked: { 'board-first-win': 100, 'kart-gap': 50, 'platform-app': 300 },
    })
    expect(parseSaved(serialize(mergeSaved(a, b)))).toEqual(mergeSaved(a, b))
  })
})
