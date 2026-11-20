import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { CupSetupPanel } from '../../src/kart/cup/CupSetupPanel.tsx'
import CupView from '../../src/kart/cup/CupView.tsx'
import {
  beginRace,
  betterOutcome,
  currentTrack,
  DEFAULT_CUP_SETUP,
  finishRace,
  leaveCup,
  outcomeOf,
  parseCupRun,
  playerSeat,
  quitRace,
  raceSeed,
  resumeCup,
  standingsOf,
  startCup,
  type CupRun,
  type CupSetup,
} from '../../src/kart/cup/cupRun.ts'
import { CUPS, cupOf, pickableCups } from '../../src/kart/cup/cups.ts'
import { cupTable, PODIUM_BONUS, racePoints } from '../../src/kart/cup/points.ts'
import {
  clearCupRun,
  keepCupBest,
  loadCupBest,
  loadCupRun,
  saveCupRun,
} from '../../src/kart/cup/store.ts'
import { trophyShape } from '../../src/kart/cup/trophyShape.ts'

// The Grand Prix (owner 2026-11-17; docs/ARCHITECTURE.md §4.24)

registerMessages(KART_MESSAGES)
const en = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)

beforeEach(() => window.localStorage.clear())

const SETUP: CupSetup = { ...DEFAULT_CUP_SETUP, cup: 'ebb', bots: 3 }

/** Ranks by seat, from a finishing order of seats */
const ranksOf = (order: readonly number[]): number[] => {
  const ranks: number[] = []
  order.forEach((seat, index) => (ranks[seat] = index + 1))
  return ranks
}

/** Runs a whole cup, each race finishing in the order given */
function runCup(setup: CupSetup, orders: readonly (readonly number[])[]): CupRun {
  let run = startCup(setup, 42)
  for (const order of orders) run = finishRace(beginRace(run), ranksOf(order))
  return run
}

describe('the points', () => {
  it('give one for every kart beaten plus one, and 3, 2, 1 more to a race’s first three', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((rank) => racePoints(rank, 8))).toEqual([
      11, 9, 7, 5, 4, 3, 2, 1,
    ])
    expect([1, 2, 3, 4, 5, 6].map((rank) => racePoints(rank, 6))).toEqual([9, 7, 5, 3, 2, 1])
    expect([1, 2].map((rank) => racePoints(rank, 2))).toEqual([5, 3])
    expect(PODIUM_BONUS).toEqual([3, 2, 1])
  })

  it('always fall with the place, and give nothing for a place that cannot be', () => {
    for (let field = 2; field <= 8; field++) {
      for (let rank = 2; rank <= field; rank++)
        expect(racePoints(rank, field)).toBeLessThan(racePoints(rank - 1, field))
      // The last scores at least 1 (from four karts, just 1)
      expect(racePoints(field, field)).toBe(field >= 4 ? 1 : 1 + PODIUM_BONUS[field - 1]!)
    }
    expect(racePoints(0, 6)).toBe(0)
    expect(racePoints(7, 6)).toBe(0)
    expect(racePoints(1.5, 6)).toBe(0)
  })

  it('add up over the races, level on points going to more wins, then the latest race', () => {
    // Three karts (6, 4, 2 points): seat 0 wins race 1, seat 1 race 2: 10 points each, one win
    // each; seat 1 was the better in the latest race
    const table = cupTable(
      [
        [1, 2, 3],
        [2, 1, 3],
      ],
      3,
    )
    expect(table.map((line) => [line.seat, line.points])).toEqual([
      [1, 10],
      [0, 10],
      [2, 4],
    ])
    expect(table[0]!.races).toEqual([4, 6])
    // Shared ranks share the points
    expect(cupTable([[1, 2, 2]], 3).map((line) => line.points)).toEqual([6, 4, 4])
  })
})

describe('the cups', () => {
  it('race the four tracks, the full cup in order, and hide the test cup', () => {
    expect(cupOf('rivermouth').tracks).toEqual(['riverside', 'harbour', 'tamkang', 'oldstreet'])
    expect(pickableCups(false).map((cup) => cup.id)).toEqual([
      'ebb',
      'hill',
      'rivermouth',
      'flood',
      'backstreet',
    ])
    // 2026-11-18: the four technical tracks, the expert's last
    expect(cupOf('flood').tracks).toEqual(['mangrove', 'danhai', 'fort', 'datun'])
    // 2026-11-19: the tracks with a way round for those who know them
    expect(cupOf('backstreet').tracks).toEqual(['danhai', 'wharf', 'lanes', 'works'])
    expect(pickableCups(true)).toHaveLength(CUPS.length)
    expect(cupOf('sprint').tracks).toHaveLength(1)
  })

  it('each have a trophy of their own, a step for each race', () => {
    const shapes = CUPS.map((cup) => JSON.stringify(trophyShape(cup.id, 4)))
    expect(new Set(shapes).size).toBeGreaterThan(1)
    expect(trophyShape('ebb', 2).steps).toBe(2)
    expect(trophyShape('ebb', 9).steps).toBe(4)
  })
})

describe('a cup as it goes', () => {
  it('starts ready for its first race, with the same opponents all the way', () => {
    const run = startCup(SETUP, 42)
    expect(run.phase).toBe('ready')
    expect(run.entries).toHaveLength(3)
    expect(playerSeat(run)).toBe(3)
    expect(currentTrack(run)).toBe('riverside')
    const after = finishRace(beginRace(run), [1, 2, 3, 4])
    expect(after.entries).toEqual(run.entries)
    expect(currentTrack(after)).toBe('harbour')
    // Each race gets its own seed
    expect(raceSeed(after)).not.toBe(raceSeed(run))
  })

  it('counts each race, then reaches the podium after the last', () => {
    const racing = beginRace(startCup(SETUP, 42))
    expect(racing.phase).toBe('racing')
    const one = finishRace(racing, ranksOf([3, 0, 1, 2]))
    expect(one.phase).toBe('ready')
    expect(one.results).toEqual([[2, 3, 4, 1]])
    // Not being raced: a result is not taken
    expect(finishRace(one, [1, 2, 3, 4])).toBe(one)
    const two = finishRace(beginRace(one), ranksOf([3, 1, 0, 2]))
    expect(two.phase).toBe('podium')
    expect(currentTrack(two)).toBeNull()
    // Four karts (7, 5, 3, 1 points): the player won both
    expect(outcomeOf(two)).toEqual({ place: 1, points: 14 })
    expect(standingsOf(two)[0]!.seat).toBe(3)
    expect(beginRace(two)).toBe(two)
  })

  it('runs a race cut short again: quitting it, or reloading during it', () => {
    const racing = beginRace(startCup(SETUP, 42))
    expect(quitRace(racing).phase).toBe('ready')
    expect(quitRace(racing).results).toEqual([])
    expect(resumeCup(racing)).toMatchObject({ phase: 'ready', away: false })
    const left = leaveCup(racing)
    expect(left).toMatchObject({ phase: 'ready', away: true })
    expect(resumeCup(left).away).toBe(false)
    expect(beginRace(left).away).toBe(false)
  })

  it('counts a missing or impossible rank as last', () => {
    const run = finishRace(beginRace(startCup(SETUP, 42)), [1, 9])
    expect(run.results[0]).toEqual([1, 4, 4, 4])
  })

  it('compares results: a better place, or the same place with more points', () => {
    expect(betterOutcome({ place: 2, points: 10 }, null)).toBe(true)
    expect(betterOutcome({ place: 1, points: 5 }, { place: 2, points: 20 })).toBe(true)
    expect(betterOutcome({ place: 2, points: 21 }, { place: 2, points: 20 })).toBe(true)
    expect(betterOutcome({ place: 2, points: 20 }, { place: 2, points: 20 })).toBe(false)
    expect(betterOutcome({ place: 3, points: 30 }, { place: 2, points: 20 })).toBe(false)
  })
})

describe('the cup in this browser', () => {
  it('comes back as it was kept, and is gone once abandoned', () => {
    const run = finishRace(beginRace(startCup(SETUP, 42)), ranksOf([0, 1, 2, 3]))
    saveCupRun(run)
    expect(loadCupRun()).toEqual(run)
    clearCupRun()
    expect(loadCupRun()).toBeNull()
  })

  it('refuses what is not a cup: a hand edit, a phase that does not fit, a broken entry', () => {
    const run = startCup(SETUP, 42)
    const json = JSON.parse(JSON.stringify(run)) as Record<string, unknown>
    expect(parseCupRun(json)).toEqual(run)
    expect(parseCupRun({ ...json, format: 2 })).toBeNull()
    expect(parseCupRun({ ...json, phase: 'podium' })).toBeNull()
    expect(parseCupRun({ ...json, results: [[1, 2, 3]] })).toBeNull()
    expect(parseCupRun({ ...json, results: [[1, 2, 3, 4]], phase: 'ready' })).not.toBeNull()
    expect(parseCupRun({ ...json, entries: [] })).toBeNull()
    expect(parseCupRun({ ...json, setup: { ...SETUP, cup: 'moon' } })).toBeNull()
    window.localStorage.setItem('tku-arcade.kart.cup.run', '{not json')
    expect(loadCupRun()).toBeNull()
  })

  it('keeps each cup’s best result, only when it is better', () => {
    expect(loadCupBest('ebb')).toBeNull()
    expect(keepCupBest('ebb', { place: 3, points: 6 })).toBe(true)
    expect(keepCupBest('ebb', { place: 4, points: 9 })).toBe(false)
    expect(keepCupBest('ebb', { place: 1, points: 10 })).toBe(true)
    expect(loadCupBest('ebb')).toEqual({ place: 1, points: 10 })
    expect(loadCupBest('hill')).toBeNull()
  })
})

describe('the cup’s screens', () => {
  it('show the next race and the field, then the standings after a race', () => {
    const run = startCup(SETUP, 42)
    const { unmount } = render(<CupView run={run} onMenu={vi.fn()} />)
    expect(screen.getByTestId('kart-cup-race')).toHaveTextContent('Race 1 of 2: Riverside')
    expect(screen.getByText(en('kart.cup.field'))).toBeInTheDocument()
    unmount()
    const after = finishRace(beginRace(run), ranksOf([3, 0, 1, 2]))
    render(<CupView run={after} onMenu={vi.fn()} />)
    expect(screen.getByTestId('kart-cup-race')).toHaveTextContent('Race 2 of 2: Harbour')
    const rows = within(screen.getByTestId('kart-cup-standings')).getAllByRole('row')
    // A header, then four karts, the player first with 7 points
    expect(rows).toHaveLength(5)
    expect(rows[1]).toHaveAttribute('data-seat', '3')
    expect(rows[1]).toHaveTextContent('7')
  })

  it('keep the cup when leaving for the menu, and drop it when abandoned', () => {
    const onMenu = vi.fn()
    const run = startCup(SETUP, 42)
    saveCupRun(run)
    const { unmount } = render(<CupView run={run} onMenu={onMenu} />)
    fireEvent.click(screen.getByTestId('kart-cup-menu'))
    expect(onMenu).toHaveBeenCalledTimes(1)
    expect(loadCupRun()?.away).toBe(true)
    unmount()
    render(<CupView run={run} onMenu={onMenu} />)
    fireEvent.click(screen.getByTestId('kart-cup-abandon'))
    fireEvent.click(screen.getByTestId('kart-cup-abandon-yes'))
    expect(onMenu).toHaveBeenCalledTimes(2)
    expect(loadCupRun()).toBeNull()
  })

  it('end on the podium: the first three on steps, a trophy, the player’s result', () => {
    const run = runCup(SETUP, [
      [0, 3, 1, 2],
      [3, 0, 2, 1],
    ])
    saveCupRun(run)
    const onMenu = vi.fn()
    render(<CupView run={run} onMenu={onMenu} />)
    const podium = screen.getByTestId('kart-cup-podium')
    expect(podium.querySelectorAll('[data-place]')).toHaveLength(3)
    expect(screen.getByTestId('kart-cup-trophy')).toHaveAccessibleName('The Ebb Tide Cup trophy')
    // Seat 0: 7 + 5 = 12; the player: 5 + 7 = 12. Level on wins too (one each): the latest race
    // puts the player first
    expect(screen.getByTestId('kart-cup-outcome')).toHaveTextContent(
      'You took place 1 of 4, with 12 points',
    )
    fireEvent.click(screen.getByTestId('kart-cup-done'))
    expect(onMenu).toHaveBeenCalled()
    expect(loadCupRun()).toBeNull()
  })

  it('the menu continues a cup under way, or abandons it', () => {
    const run = finishRace(beginRace(startCup(SETUP, 42)), ranksOf([0, 1, 2, 3]))
    saveCupRun(leaveCup(run))
    const onCup = vi.fn()
    const { unmount } = render(<CupSetupPanel t={en} onCup={onCup} onClose={vi.fn()} />)
    const carryOn = screen.getByTestId('kart-cup-continue')
    expect(carryOn).toHaveTextContent('Continue the Ebb Tide Cup (race 2 of 2)')
    fireEvent.click(carryOn)
    expect(onCup).toHaveBeenCalledWith(
      expect.objectContaining({ away: false, results: run.results }),
    )
    unmount()
    render(<CupSetupPanel t={en} onCup={onCup} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('kart-cup-abandon'))
    fireEvent.click(screen.getByTestId('kart-cup-abandon-yes'))
    expect(screen.queryByTestId('kart-cup-continue')).toBeNull()
    expect(loadCupRun()).toBeNull()
  })

  it('the menu starts a new cup with the settings picked, and keeps them', () => {
    const onCup = vi.fn()
    render(<CupSetupPanel t={en} onCup={onCup} onClose={vi.fn()} />)
    // The test cup is not on offer without the tests' autopilot
    expect(
      within(screen.getByTestId('kart-cup-cup'))
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['ebb', 'hill', 'rivermouth', 'flood', 'backstreet'])
    fireEvent.change(screen.getByTestId('kart-cup-cup'), { target: { value: 'rivermouth' } })
    fireEvent.change(screen.getByTestId('kart-cup-count'), { target: { value: '7' } })
    fireEvent.click(screen.getByTestId('kart-cup-start'))
    const run = onCup.mock.calls[0]![0] as CupRun
    expect(run.setup).toMatchObject({ cup: 'rivermouth', bots: 7 })
    expect(run.entries).toHaveLength(7)
    expect(loadCupRun()).toEqual(run)
  })
})
