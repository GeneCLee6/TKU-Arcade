import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_AFTER_FINISH_MS } from '../../shared/kart/opening.ts'
import { useCloseCountdown } from '../../src/kart/ui/useCloseCountdown.ts'

// 2026-11-23 (#152): the ten seconds after the first finish, counted by the room's clock: the racer's
// screen and the watcher's (and the broadcast) use the same hook

const GO = 1_000_000

describe('the countdown after the first finish', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts the seconds left by the room clock, from the first finish, down to 0', () => {
    let now = GO + 40_000
    const racers = [{ finishMs: null as number | null }, { finishMs: null as number | null }]
    const { result, rerender } = renderHook(
      (race: { phase: string; goAt: number | null; racers: { finishMs: number | null }[] }) =>
        useCloseCountdown(race, () => now),
      { initialProps: { phase: 'racing', goAt: GO, racers } },
    )
    // Nobody in yet
    expect(result.current).toBeNull()
    // The first finish at 40 s: ten seconds for the rest
    rerender({ phase: 'racing', goAt: GO, racers: [{ finishMs: 40_000 }, { finishMs: null }] })
    expect(result.current).toBe(CLOSE_AFTER_FINISH_MS / 1000)
    now += 3_500
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(7)
    now += 10_000
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(0)
    // The race over: nothing to count
    rerender({ phase: 'results', goAt: GO, racers: [{ finishMs: 40_000 }, { finishMs: null }] })
    expect(result.current).toBeNull()
  })

  it('waits for the room clock before it shows anything', () => {
    const { result } = renderHook(() =>
      useCloseCountdown({ phase: 'racing', goAt: GO, racers: [{ finishMs: 30_000 }] }, () => null),
    )
    expect(result.current).toBeNull()
  })
})
