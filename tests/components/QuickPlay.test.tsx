// 2026-11-22: the lobby's "Play the computer" asks for as many computer players as the person picks
// (one up to a full table, hold'em five first), all at one level or each at its own
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QuickPlay from '../../src/components/QuickPlay.tsx'
import { setLanguage } from '../../src/i18n/t.ts'
import { RouterContext, type RouterValue } from '../../src/lib/useRouter.ts'

beforeEach(() => setLanguage('en'))

function renderQuick() {
  const onPlay = vi.fn()
  const router = { location: { pathname: '/', search: '', hash: '' }, navigate: vi.fn() } as unknown as RouterValue
  render(
    <RouterContext.Provider value={router}>
      <QuickPlay disabled={false} paused={[]} onPlay={onPlay} />
    </RouterContext.Provider>,
  )
  return onPlay
}

const play = () => screen.getByRole('button', { name: "Play now: Texas Hold'em against the computer" })
const more = () => screen.getByRole('button', { name: "One computer player more: Texas Hold'em" })
const fewer = () => screen.getByRole('button', { name: "One computer player fewer: Texas Hold'em" })

describe('QuickPlay', () => {
  it('asks for five computer players at hold’em unless the person picks another number', () => {
    const onPlay = renderQuick()
    fireEvent.click(play())
    expect(onPlay).toHaveBeenLastCalledWith('holdem', { count: 5, level: 'normal' })
    fireEvent.click(fewer())
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }))
    fireEvent.click(play())
    expect(onPlay).toHaveBeenLastCalledWith('holdem', { count: 4, level: 'easy' })
  })

  it('goes from one computer player to a full table of eight, and no further', () => {
    const onPlay = renderQuick()
    for (let i = 0; i < 10; i++) if (!fewer().hasAttribute('disabled')) fireEvent.click(fewer())
    expect(fewer()).toBeDisabled()
    fireEvent.click(play())
    expect(onPlay).toHaveBeenLastCalledWith('holdem', { count: 1, level: 'normal' })
    for (let i = 0; i < 10; i++) if (!more().hasAttribute('disabled')) fireEvent.click(more())
    expect(more()).toBeDisabled()
    expect(screen.getByText('You and 8 computer players')).toBeInTheDocument()
    fireEvent.click(play())
    expect(onPlay).toHaveBeenLastCalledWith('holdem', { count: 8, level: 'normal' })
  })

  it('picking each, a tap moves one computer player to the next level', () => {
    const onPlay = renderQuick()
    fireEvent.click(screen.getByRole('button', { name: 'Pick each' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: "Computer player 2 in Texas Hold'em: Normal. Tap for the next level",
      }),
    )
    fireEvent.click(play())
    expect(onPlay).toHaveBeenLastCalledWith('holdem', {
      count: 5,
      level: 'normal',
      levels: ['normal', 'easy', 'normal', 'normal', 'normal'],
    })
  })
})
