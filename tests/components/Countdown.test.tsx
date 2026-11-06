import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Countdown } from '../../src/components/Countdown.tsx'
import { setLanguage } from '../../src/i18n/t.ts'
import type { RoomTimer } from '../../src/lib/roomConnection.ts'

const timerOf = (remainingMs: number, totalMs = 10_000): RoomTimer => ({
  id: 'turn',
  deadline: performance.now() + remainingMs,
  totalMs,
})

const shown = () => screen.getByRole('timer')
const fill = () => shown().querySelector('[aria-hidden] > div') as HTMLElement
const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  setLanguage('en')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Countdown', () => {
  it('shows whole seconds left, rounding up', () => {
    render(<Countdown timer={timerOf(2_500)} />)
    expect(shown()).toHaveTextContent('3s')
    pass(499)
    expect(shown()).toHaveTextContent('3s')
    pass(1)
    expect(shown()).toHaveTextContent('2s')
    pass(1_000)
    expect(shown()).toHaveTextContent('1s')
  })

  it('stops at zero, and never goes negative', () => {
    render(<Countdown timer={timerOf(1_000)} />)
    pass(1_000)
    expect(shown()).toHaveTextContent('0s')
    pass(60_000)
    expect(shown()).toHaveTextContent('0s')
    expect(fill().style.width).toBe('0%')
  })

  it('shows zero for a timer that has already run out', () => {
    render(<Countdown timer={timerOf(-500)} />)
    expect(shown()).toHaveTextContent('0s')
    expect(fill().style.width).toBe('0%')
  })

  it('draws the bar from totalMs', () => {
    render(<Countdown timer={timerOf(5_000, 10_000)} />)
    expect(fill().style.width).toBe('50%')
    pass(2_500)
    expect(fill().style.width).toBe('25%')
  })

  it('never overfills the bar, and copes with a total of zero', () => {
    const { unmount } = render(<Countdown timer={timerOf(20_000, 10_000)} />)
    expect(fill().style.width).toBe('100%')
    unmount()
    render(<Countdown timer={timerOf(1_000, 0)} />)
    expect(fill().style.width).toBe('0%')
  })

  it('takes a new deadline at once', () => {
    const { rerender } = render(<Countdown timer={timerOf(2_000)} />)
    pass(1_500)
    expect(shown()).toHaveTextContent('1s')

    rerender(<Countdown timer={timerOf(9_000)} />)

    expect(shown()).toHaveTextContent('9s')
    pass(1_000)
    expect(shown()).toHaveTextContent('8s')
  })

  it('cleans up its interval on unmount, and stops by itself at zero', () => {
    const { unmount } = render(<Countdown timer={timerOf(5_000)} />)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)

    render(<Countdown timer={timerOf(1_000)} />)
    expect(vi.getTimerCount()).toBe(1)
    pass(1_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not announce its ticks: a timer role, its live region off, the bar hidden', () => {
    render(<Countdown timer={timerOf(5_000)} />)
    expect(shown()).toHaveAttribute('aria-live', 'off')
    expect(shown()).toHaveAccessibleName('Time left')
    expect(shown().querySelector('[role="progressbar"]')).toBeNull()
    expect(fill().parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('takes a label for what it is counting towards', () => {
    render(<Countdown timer={timerOf(5_000)} label="Your turn" />)
    expect(shown()).toHaveAccessibleName('Your turn')
  })

  it('reads in the current language', () => {
    setLanguage('zh-TW')
    render(<Countdown timer={timerOf(5_000)} />)
    expect(shown()).toHaveTextContent('5 秒')
    expect(shown()).toHaveAccessibleName('剩餘時間')
  })
})
