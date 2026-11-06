import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LastRoll, PromotionPlayer } from '../../../shared/games/promotion/types.ts'
import {
  MOVE_MS,
  nextPlayback,
  rollCount,
  ROLL_MS,
  useRollPlayback,
} from '../../../src/games/promotion/useRollPlayback.ts'
import { playCue } from '../../../src/lib/sound.ts'

vi.mock('../../../src/lib/sound.ts', () => ({ playCue: vi.fn() }))

const player = (rolls: number, seat = 0): PromotionPlayer => ({
  seat,
  cell: 'baiding',
  rolls,
  demotions: 0,
})
const last: LastRoll = { seat: 0, face: 'de', dice: null, from: 'baiding', to: 'shengyuan' }
const idle = { count: 3, stage: 'idle' } as const

describe('nextPlayback', () => {
  it('changes nothing without a new roll, keeping the same object', () => {
    expect(nextPlayback(idle, 3, last, false)).toBe(idle)
  })

  it('plays one new roll', () => {
    expect(nextPlayback(idle, 4, last, false)).toEqual({ count: 4, stage: 'rolling' })
  })

  it('replaces a roll still playing', () => {
    expect(nextPlayback({ count: 3, stage: 'moving' }, 4, last, false).stage).toBe('rolling')
  })

  it('does not replay what was missed while away, or a rematch going back to none', () => {
    expect(nextPlayback(idle, 7, last, false)).toEqual({ count: 7, stage: 'idle' })
    expect(nextPlayback(idle, 0, null, false)).toEqual({ count: 0, stage: 'idle' })
  })

  it('shows reduced motion the result at once', () => {
    expect(nextPlayback(idle, 4, last, true)).toEqual({ count: 4, stage: 'idle' })
  })
})

describe('rollCount', () => {
  it('adds up everyone', () => {
    expect(rollCount([player(2), player(3, 1)])).toBe(5)
  })
})

describe('useRollPlayback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(playCue).mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = (reduced = false, face: LastRoll['face'] = 'de', over = false) => {
    const roll = { ...last, face }
    return renderHook(
      ({ rolls }: { rolls: number }) =>
        useRollPlayback([player(rolls)], rolls > 0 ? roll : null, over && rolls > 0, reduced),
      { initialProps: { rolls: 0 } },
    )
  }

  it('shows no animation and makes no sound for a game already under way', () => {
    const { result } = renderHook(() => useRollPlayback([player(5)], last, false, false))
    expect(result.current.stage).toBe('idle')
    expect(playCue).not.toHaveBeenCalled()
  })

  it('goes from rolling to moving to idle, with a sound for each', () => {
    const { result, rerender } = setup()
    rerender({ rolls: 1 })
    expect(result.current.stage).toBe('rolling')
    expect(playCue).toHaveBeenLastCalledWith('roll')

    act(() => void vi.advanceTimersByTime(ROLL_MS))
    expect(result.current.stage).toBe('moving')
    expect(playCue).toHaveBeenLastCalledWith('move')

    act(() => void vi.advanceTimersByTime(MOVE_MS))
    expect(result.current.stage).toBe('idle')
    expect(playCue).toHaveBeenLastCalledWith('land')
  })

  it('sounds different for graft, and for the end of the game', () => {
    const { rerender } = setup(false, 'zang', true)
    rerender({ rolls: 1 })
    act(() => void vi.advanceTimersByTime(ROLL_MS))
    expect(playCue).toHaveBeenLastCalledWith('demote')
    act(() => void vi.advanceTimersByTime(MOVE_MS))
    expect(playCue).toHaveBeenLastCalledWith('win')
  })

  it('with reduced motion does not move, and still sounds', () => {
    const { result, rerender } = setup(true)
    rerender({ rolls: 1 })
    expect(result.current.stage).toBe('idle')
    expect(playCue).toHaveBeenCalledWith('land')
    expect(playCue).not.toHaveBeenCalledWith('roll')
  })

  it('makes no landing sound when a rematch goes back to no rolls', () => {
    const { rerender } = setup(true)
    rerender({ rolls: 1 })
    vi.mocked(playCue).mockClear()
    rerender({ rolls: 0 })
    expect(playCue).not.toHaveBeenCalled()
  })

  it('leaves no timer running after it is gone', () => {
    const { rerender, unmount } = setup()
    rerender({ rolls: 1 })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
