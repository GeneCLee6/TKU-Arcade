import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { GhostPicker } from '../../src/kart/GhostPicker.tsx'
import { RaceCenter, RaceClock } from '../../src/kart/RaceOverlay.tsx'
import type { SpikeTrial } from '../../src/kart/spikeLoop.ts'

// e8-t10: the countdown, the wrong-way warning and the results, as the page shows them

const t = (key: string, params: Record<string, string | number> = {}) =>
  (KART_MESSAGES.en as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params[name]),
  )

const base: SpikeTrial = {
  phase: 'racing',
  countdown: 0,
  lap: 2,
  laps: 3,
  lapTimes: [],
  wrongWay: false,
  total: null,
  bestRun: null,
  bestLap: null,
  newBestRun: false,
  newBestLap: false,
  recordKart: null,
  kartBestRun: null,
  newKartBestRun: false,
}

describe('the race overlay', () => {
  it('counts down, then says GO', () => {
    const { rerender } = render(
      <RaceCenter
        t={t}
        trial={{ ...base, phase: 'countdown', countdown: 2 }}
        onRestart={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('2')
    rerender(
      <RaceCenter
        t={t}
        trial={{ ...base, phase: 'countdown', countdown: 0 }}
        onRestart={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('GO!')
  })

  it('warns about the wrong way, and shows nothing otherwise', () => {
    const { container, rerender } = render(
      <RaceCenter t={t} trial={{ ...base, wrongWay: true }} onRestart={vi.fn()} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong way!')
    rerender(<RaceCenter t={t} trial={base} onRestart={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the laps with the best marked, the total, and races again', () => {
    const onRestart = vi.fn()
    render(
      <RaceCenter
        t={t}
        trial={{ ...base, phase: 'finished', lapTimes: [41.2, 38.05, 39.5], total: 118.75 }}
        onRestart={onRestart}
      />,
    )
    const results = screen.getByRole('dialog', { name: 'Finished' })
    expect(results).toHaveTextContent('1:58.750')
    const laps = within(results).getAllByRole('listitem')
    expect(laps.map((lap) => lap.textContent)).toEqual([
      'Lap 10:41.200',
      'Lap 20:38.050 · best',
      'Lap 30:39.500',
    ])
    fireEvent.click(within(results).getByRole('button', { name: 'Race again' }))
    expect(onRestart).toHaveBeenCalledOnce()
  })

  it('opens the garage from the results, to race again in another kart (2026-11-17)', () => {
    const onGarage = vi.fn()
    const finished = { ...base, phase: 'finished' as const, lapTimes: [40], total: 40 }
    const { rerender } = render(<RaceCenter t={t} trial={finished} onRestart={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Change kart' })).toBeNull()
    rerender(<RaceCenter t={t} trial={finished} onRestart={vi.fn()} onGarage={onGarage} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change kart' }))
    expect(onGarage).toHaveBeenCalledOnce()
  })
})

// 2026-11-17 (docs/ARCHITECTURE.md §4.23): each kart's records, and which ghost races along
describe('the records of each kart', () => {
  it('name the record’s kart, unknown for an old one, and show this kart’s own', () => {
    const { rerender } = render(
      <RaceClock t={t} trial={{ ...base, bestRun: 60, recordKart: 'unknown', kartBestRun: 62 }} />,
    )
    expect(screen.getByTestId('kart-record-kart')).toHaveTextContent('Record · kart unknown')
    expect(screen.getByTestId('kart-kart-record')).toHaveTextContent('1:02.000')
    rerender(<RaceClock t={t} trial={{ ...base, bestRun: 60, recordKart: 'heron' }} />)
    expect(screen.getByTestId('kart-record-kart')).toHaveTextContent('Record · Egret')
    expect(screen.queryByTestId('kart-kart-record')).toBeNull()
  })

  it('say when a run is this kart’s best but not the track’s', () => {
    render(
      <RaceCenter
        t={t}
        trial={{
          ...base,
          phase: 'finished',
          total: 62,
          lapTimes: [21, 20, 21],
          bestRun: 60,
          kartBestRun: 62,
          newKartBestRun: true,
        }}
        onRestart={vi.fn()}
      />,
    )
    expect(screen.getByTestId('kart-new-record')).toHaveTextContent('Best yet in this kart!')
  })

  it('pick the ghost with buttons', () => {
    const onPick = vi.fn()
    render(<GhostPicker t={t} pick="overall" onPick={onPick} />)
    const group = screen.getByRole('group', { name: 'Ghost' })
    expect(within(group).getAllByRole('button')).toHaveLength(3)
    expect(within(group).getByRole('button', { name: 'Track record' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(within(group).getByRole('button', { name: "This kart's best" }))
    expect(onPick).toHaveBeenCalledWith('kart')
  })
})
