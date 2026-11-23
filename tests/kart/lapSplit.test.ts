import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { formatDelta, LAP_SPLIT_MS, lapSplit, useLapSplit } from '../../src/kart/ui/lapSplit.ts'

// 2026-11-23 (owner: "every lap, when you cross the line, show the time"): src/kart/ui/lapSplit.ts

describe("each lap's time at the line", () => {
  it('says the lap, its time, whether it is the fastest so far and how far from the best', () => {
    expect(lapSplit([], null)).toBeNull()
    // The first lap, nothing to set it against
    expect(lapSplit([31.42], null)).toEqual({ lap: 1, time: 31.42, fastest: false, delta: null, against: null })
    // Faster than the lap before: the fastest, and green
    const second = lapSplit([31.42, 30.9], null)!
    expect(second).toMatchObject({ lap: 2, fastest: true, against: 'race' })
    expect(second.delta).toBeCloseTo(-0.52, 9)
    // Slower than the fastest before it: not the fastest, red
    const third = lapSplit([31.42, 30.9, 32], null)!
    expect(third).toMatchObject({ lap: 3, fastest: false, against: 'race' })
    expect(third.delta).toBeCloseTo(1.1, 9)
    // With a record kept on this track, against the record
    const record = lapSplit([31.42], 30)!
    expect(record).toMatchObject({ lap: 1, fastest: false, against: 'record' })
    expect(record.delta).toBeCloseTo(1.42, 9)
  })

  it('writes the difference with its sign, to the hundredth', () => {
    expect(formatDelta(0.4249)).toBe('+0.42')
    expect(formatDelta(-1.03)).toBe('\u22121.03')
    expect(formatDelta(-0.001)).toBe('+0.00')
    expect(formatDelta(12)).toBe('+12.00')
  })
})

describe('useLapSplit', () => {
  afterEach(() => vi.useRealTimers())

  it('shows each new lap for a few seconds, and not the laps done before the page came', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ laps, record }) => useLapSplit(laps, record), {
      initialProps: { laps: [] as number[], record: 29 as number | null },
    })
    expect(result.current).toBeNull()
    rerender({ laps: [31.5], record: 29 })
    expect(result.current).toMatchObject({ lap: 1, time: 31.5, against: 'record', id: 1 })
    act(() => vi.advanceTimersByTime(LAP_SPLIT_MS - 100))
    expect(result.current).not.toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBeNull()
    // The finish sets a new record: the last lap is still set against the one before
    rerender({ laps: [31.5, 28.5], record: 28.5 })
    expect(result.current?.delta).toBeCloseTo(-0.5, 9)
    expect(result.current?.fastest).toBe(true)

    // Joined again with two laps done: nothing until the third
    const again = renderHook(({ laps }) => useLapSplit(laps, null), { initialProps: { laps: [30, 31] } })
    expect(again.result.current).toBeNull()
    again.rerender({ laps: [30, 31, 29] })
    expect(again.result.current).toMatchObject({ lap: 3, fastest: true })
  })
})
