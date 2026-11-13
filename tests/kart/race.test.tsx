import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { RaceCenter } from '../../src/kart/RaceOverlay.tsx'
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
})
