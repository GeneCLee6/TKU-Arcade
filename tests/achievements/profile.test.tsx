import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEngine } from '../../src/achievements/engine.ts'
import { ProfilePage } from '../../src/achievements/ProfilePage.tsx'
import { favourite, lapTime } from '../../src/achievements/profileStats.ts'
import { RULES } from '../../src/achievements/rules.ts'
import { save } from '../../src/achievements/store.ts'
import { MemoryRouter } from '../../src/lib/router.tsx'

vi.mock('../../src/achievements/popupsRoot.tsx', () => ({ mountPopups: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  resetEngine()
})
afterEach(() => localStorage.clear())

const page = () =>
  render(
    <MemoryRouter initialEntries={['/me']}>
      <ProfilePage />
    </MemoryRouter>,
  )

describe('my profile', () => {
  it('shows the card, the wall and the stats from what is kept', async () => {
    localStorage.setItem('tku-arcade.nickname', 'Gene')
    save({
      stats: {
        n: { 'kart.finishes': 3, 'platform.games': 5, 'board.wins': 1, 'kart.boostMs': 125_000 },
        t: {
          'kart.karts': { tide: 1, comet: 2 },
          'kart.tracks': { harbour: 3 },
          'kart.bestLap': { harbour: 61_234 },
          'board.played': { promotion: 2 },
          'board.won': { promotion: 1 },
        },
      },
      unlocked: { 'kart-first-finish': Date.UTC(2026, 10, 23) },
    })
    page()
    expect(screen.getByRole('heading', { level: 1, name: 'My profile' })).toBeInTheDocument()
    const card = screen.getByTestId('profile-card')
    expect(card).toHaveTextContent('Gene')
    expect(card).toHaveTextContent(`of ${RULES.length} achievements`)
    const wall = screen.getByTestId('achievement-wall')
    expect(within(wall).getAllByRole('listitem')).toHaveLength(RULES.length)
    const first = screen.getByTestId('achievement-kart-first-finish')
    expect(first).toHaveAttribute('data-unlocked', 'true')
    expect(first).toHaveTextContent('Chequered Debut')
    // A rule met by the stats shows as unlocked even before the engine has kept it
    expect(screen.getByTestId('achievement-board-first-win')).toHaveAttribute('data-unlocked', 'true')
    // Locked: grey, with its progress; hidden: a question
    expect(screen.getByTestId('achievement-kart-finish-25')).toHaveTextContent('3 / 25')
    const hidden = screen.getByTestId('achievement-kart-combo-15')
    expect(hidden).toHaveTextContent('Hidden achievement')
    expect(hidden).not.toHaveTextContent('Unbroken Current')
    // The stats
    expect(screen.getByText('Agei')).toBeInTheDocument()
    expect(screen.getAllByText("Fisherman's Wharf").length).toBeGreaterThan(0)
    expect(screen.getByText('1:01.234')).toBeInTheDocument()
    expect(screen.getByText('2 min 5 s')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Promotion/ })).toHaveTextContent('50%')
  })

  it('filters the wall by category', () => {
    page()
    fireEvent.click(screen.getByRole('button', { name: 'Board games' }))
    const tiles = within(screen.getByTestId('achievement-wall')).getAllByRole('listitem')
    expect(tiles).toHaveLength(RULES.filter((rule) => rule.category === 'board').length)
    expect(screen.getByRole('button', { name: 'Board games' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a guest with nothing yet', () => {
    page()
    expect(screen.getByTestId('profile-card')).toHaveTextContent('Guest player')
    expect(screen.getByTestId('profile-percent')).toHaveTextContent('0%')
    expect(screen.getByText('No board games finished yet.')).toBeInTheDocument()
    expect(screen.getByText('No laps on a race track yet.')).toBeInTheDocument()
  })
})

describe('the profile’s sums', () => {
  it('a favourite and a lap time', () => {
    expect(favourite({ a: 1, b: 3, c: 2 })).toEqual(['b', 3])
    expect(favourite({})).toBeNull()
    expect(favourite(undefined)).toBeNull()
    expect(lapTime(61_234)).toBe('1:01.234')
    expect(lapTime(9_005)).toBe('0:09.005')
  })
})
