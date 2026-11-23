import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Popups, POPUP_MS } from '../../src/achievements/Popups.tsx'
import { clearPopups, enqueue, MAX_QUEUED, popupQueue, showUnlocks } from '../../src/achievements/popups.ts'
import { holdAchievements } from '../../src/achievements/track.ts'

vi.mock('../../src/achievements/popupsRoot.tsx', () => ({ mountPopups: vi.fn() }))

describe('the queue of badges', () => {
  it('adds in order, without the same one twice', () => {
    expect(enqueue([], ['a', 'b'])).toEqual([
      { kind: 'rule', id: 'a' },
      { kind: 'rule', id: 'b' },
    ])
    expect(enqueue([{ kind: 'rule', id: 'a' }], ['a', 'c'])).toEqual([
      { kind: 'rule', id: 'a' },
      { kind: 'rule', id: 'c' },
    ])
  })

  it('folds a burst into "and N more", keeping the first in place', () => {
    const burst = enqueue([], ['a', 'b', 'c', 'd', 'e'])
    expect(burst).toHaveLength(MAX_QUEUED)
    expect(burst).toEqual([
      { kind: 'rule', id: 'a' },
      { kind: 'rule', id: 'b' },
      { kind: 'more', count: 3 },
    ])
    expect(enqueue(burst, ['f'])).toEqual([
      { kind: 'rule', id: 'a' },
      { kind: 'rule', id: 'b' },
      { kind: 'more', count: 4 },
    ])
    expect(enqueue([{ kind: 'more', count: 2 }], ['x'])).toEqual([
      { kind: 'rule', id: 'x' },
      { kind: 'more', count: 2 },
    ])
  })
})

describe('the badge on screen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearPopups()
    holdAchievements(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    holdAchievements(false)
  })

  it('waits while a race runs, then shows one at a time', () => {
    holdAchievements(true)
    render(<Popups />)
    act(() => showUnlocks(['kart-first-finish', 'kart-gap']))
    expect(screen.queryByTestId('achievement-popup')).toBeNull()
    act(() => holdAchievements(false))
    expect(screen.getByTestId('achievement-popup')).toHaveTextContent('Chequered Debut')
    expect(screen.getByRole('status')).toHaveTextContent('Achievement unlocked')
    act(() => {
      vi.advanceTimersByTime(POPUP_MS)
    })
    expect(screen.getByTestId('achievement-popup')).toHaveTextContent('Needle and Thread')
    // A race starting again holds the rest back
    act(() => holdAchievements(true))
    expect(screen.queryByTestId('achievement-popup')).toBeNull()
    act(() => holdAchievements(false))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('achievement-popup')).toBeNull()
    expect(popupQueue()).toEqual([])
  })

  it('names a board game in its line, and says how many more in a burst', () => {
    render(<Popups />)
    act(() => showUnlocks(['board-win-promotion', 'board-first-win', 'kart-gap', 'kart-fork']))
    expect(screen.getByTestId('achievement-popup')).toHaveTextContent('Win a game of Promotion.')
    for (const _ of [1, 2]) {
      act(() => {
        vi.advanceTimersByTime(POPUP_MS)
      })
    }
    expect(screen.getByTestId('achievement-popup')).toHaveTextContent('2 more achievements unlocked')
  })

  it('stays while pointed at', () => {
    render(<Popups />)
    act(() => showUnlocks(['kart-gap']))
    fireEvent.pointerEnter(screen.getByTestId('achievement-popup'))
    act(() => {
      vi.advanceTimersByTime(POPUP_MS * 3)
    })
    expect(screen.getByTestId('achievement-popup')).toBeInTheDocument()
  })
})
