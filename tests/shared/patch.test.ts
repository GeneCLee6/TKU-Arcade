import { describe, expect, it } from 'vitest'
import { applyPatch, diff, jsonEqual, type JsonValue, type PatchOp } from '../../shared/patch.ts'

const size = (ops: PatchOp[]) => JSON.stringify(ops).length

describe('diff and applyPatch', () => {
  const cases: [string, JsonValue, JsonValue][] = [
    ['nothing changed', { a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } }],
    ['a key added', { a: 1 }, { a: 1, b: { c: 2 } }],
    ['a key removed', { a: 1, b: 2 }, { a: 1 }],
    ['a nested value changed', { m: { x: { n: 1 } } }, { m: { x: { n: 2 } } }],
    ['an array replaced', { a: [1, 2] }, { a: [1, 3] }],
    ['an object replaced by a value', { a: { b: 1 } }, { a: null }],
    ['the root replaced', [1], { a: 1 }],
    ['many changes at once', { m: { a: 1, b: 2, c: 3 } }, { m: { b: 2, c: 4, d: 5 }, n: true }],
    ['an array item changed', { a: [1, 2, 3, 4, 5, 6] }, { a: [1, 2, 9, 4, 5, 6] }],
    [
      'an array of objects',
      { a: [{ x: 1, y: 'long' }, { x: 2 }] },
      { a: [{ x: 1, y: 'long' }, { x: 3 }] },
    ],
    ['an array appended to', { a: [1, 2, 3] }, { a: [1, 2, 3, 4] }],
    ['an array emptied', { a: [1, 2, 3] }, { a: [] }],
    ['an array filled', { a: [] }, { a: [1, 2, 3] }],
    ['an item dropped from the middle', { a: ['a', 'b', 'c', 'd'] }, { a: ['a', 'c', 'd'] }],
    ['a list that moved on', { a: [1, 2, 3, 4, 5] }, { a: [3, 4, 5, 6, 7] }],
    ['a list that moved on by all', { a: [1, 2] }, { a: [3, 4] }],
    [
      'nested arrays',
      {
        a: [
          [1, 2],
          [3, 4],
        ],
      },
      {
        a: [
          [1, 2],
          [3, 5, 6],
        ],
      },
    ],
    ['an array turned into an object', { a: [1] }, { a: { b: 1 } }],
  ]
  it.each(cases)('round-trips: %s', (_, before, after) => {
    expect(applyPatch(before, diff(before, after))).toEqual(after)
  })

  it('round-trips random arrays, never longer than replacing them whole', () => {
    let seed = 7
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    const list = (): JsonValue[] =>
      Array.from({ length: random(8) }, () =>
        random(3) === 0 ? { n: random(4), s: 'x'.repeat(random(5)) } : random(5),
      )
    for (let i = 0; i < 2_000; i++) {
      const before = { a: list(), b: { c: list() } }
      const after =
        random(2) === 0
          ? { a: list(), b: { c: list() } }
          : { a: [...before.a, random(9)], b: before.b }
      const ops = diff(before, after)
      expect(applyPatch(before, ops)).toEqual(after)
      expect(size(ops)).toBeLessThanOrEqual(size(diff(before, after, { wholeArrays: true })))
    }
  })

  it('sends one item of an array by its index', () => {
    const before = {
      racers: [
        { seat: 0, item: null },
        { seat: 1, item: null },
      ],
    }
    const after = {
      racers: [
        { seat: 0, item: null },
        { seat: 1, item: 'hail' },
      ],
    }
    expect(diff(before, after)).toEqual([
      { op: 'set', path: ['racers', '1', 'item'], value: 'hail' },
    ])
  })

  it('sends only what was added to the end of a list', () => {
    const shot = { n: 1, item: 'hail', x: 10.25, z: -40.5 }
    expect(diff({ shots: [shot] }, { shots: [shot, { ...shot, n: 2 }] })).toEqual([
      { op: 'splice', path: ['shots'], at: 1, del: 0, items: [{ ...shot, n: 2 }] },
    ])
  })

  it('drops the oldest and adds the newest of a list that keeps its length', () => {
    const event = (n: number) => ({ n, item: 'hail', by: 0, targets: [1], at: 1_000 + n })
    const before = { events: Array.from({ length: 16 }, (_, i) => event(i)) }
    const after = { events: Array.from({ length: 16 }, (_, i) => event(i + 1)) }
    expect(diff(before, after)).toEqual([
      { op: 'splice', path: ['events'], at: 0, del: 1, items: [] },
      { op: 'splice', path: ['events'], at: 15, del: 0, items: [event(16)] },
    ])
  })

  it('replaces an array whole when told to (protocol 1)', () => {
    expect(diff({ a: [1, 2] }, { a: [1, 3] }, { wholeArrays: true })).toEqual([
      { op: 'set', path: ['a'], value: [1, 3] },
    ])
  })

  it('refuses an index or a splice that does not fit the array', () => {
    expect(() => applyPatch({ a: [1] }, [{ op: 'set', path: ['a', '1'], value: 2 }])).toThrow()
    expect(() => applyPatch({ a: [1] }, [{ op: 'set', path: ['a', '-1'], value: 2 }])).toThrow()
    expect(() => applyPatch({ a: [1] }, [{ op: 'set', path: ['a', 'x'], value: 2 }])).toThrow()
    expect(() => applyPatch({ a: [1] }, [{ op: 'del', path: ['a', '0'] }])).toThrow()
    expect(() =>
      applyPatch({ a: [1] }, [{ op: 'splice', path: ['a'], at: 1, del: 1, items: [] }]),
    ).toThrow()
    expect(() =>
      applyPatch({ a: {} }, [{ op: 'splice', path: ['a'], at: 0, del: 0, items: [] }]),
    ).toThrow()
  })

  it('copies the arrays it changes and shares the rest', () => {
    const before: { a: { [key: string]: number }[]; b: number[] } = {
      a: [{ x: 1 }, { y: 1 }],
      b: [1],
    }
    const after = applyPatch(before, [{ op: 'set', path: ['a', '1', 'y'], value: 2 }])
    expect(before.a[1]).toEqual({ y: 1 })
    expect(after.a[0]).toBe(before.a[0])
    expect(after.b).toBe(before.b)
    expect(Array.isArray(after.a)).toBe(true)
  })

  it('sends nothing when nothing changed', () => {
    expect(diff({ a: { b: [1] } }, { a: { b: [1] } })).toEqual([])
  })

  it('sends only what changed in an object', () => {
    const before = { members: { a: { id: 'a' }, b: { id: 'b' } } }
    const after = { members: { a: { id: 'a' }, c: { id: 'c' } } }
    expect(diff(before, after)).toEqual([
      { op: 'del', path: ['members', 'b'] },
      { op: 'set', path: ['members', 'c'], value: { id: 'c' } },
    ])
  })

  it('does not change the old state and shares what did not change', () => {
    const before = { a: { x: 1 }, b: { y: 1 } }
    const after = applyPatch(before, [{ op: 'set', path: ['b', 'y'], value: 2 }])
    expect(before.b.y).toBe(1)
    expect(after.a).toBe(before.a)
    expect(after.b).not.toBe(before.b)
  })

  it('refuses to touch an object prototype', () => {
    expect(() => applyPatch({}, [{ op: 'set', path: ['__proto__', 'x'], value: 1 }])).toThrow()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('compares JSON values by content', () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(jsonEqual({ a: 1 }, { b: 1 })).toBe(false)
    expect(jsonEqual([1], { 0: 1 })).toBe(false)
  })
})
