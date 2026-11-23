// 2026-11-23 (the broadcast): what the overlay says, in both languages, and the keys that work it.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { kartScreenMessages } from '../../shared/games/kart/i18n.screen.ts'
import { kartBroadcastMessages } from '../../shared/games/kart/i18n.broadcast.ts'
import { keyCommand, padCommands } from '../../shared/kart/watch.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { BroadcastOverlay } from '../../src/kart/watch/broadcast/BroadcastOverlay.tsx'
import type { BroadcastReadout } from '../../src/kart/watch/broadcast/broadcastRun.ts'

registerMessages(kartScreenMessages)
registerMessages(kartBroadcastMessages)
const en = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `games.${string}`, params)
const zh = (key: string, params?: Record<string, string | number>) =>
  translate('zh-TW', key as `games.${string}`, params)
const names = ['Ann', 'Bob', 'Cara']
const nameOf = (seat: number) => names[seat] ?? '?'

const readout: BroadcastReadout = {
  seat: 1,
  shot: 'trackside',
  reason: 'battle',
  cuts: 7,
  speed: 142,
  rows: [
    { seat: 0, place: 1, gap: null, lap: 3, finishMs: null, out: false },
    { seat: 1, place: 2, gap: 0.412, lap: 3, finishMs: null, out: false },
    { seat: 2, place: 3, gap: 12.34, lap: 2, finishMs: null, out: false },
  ],
  captions: [
    { id: 2, caption: { kind: 'overtake', seat: 1, other: 2, place: 2 } },
    { id: 1, caption: { kind: 'finalLap', seat: 0 } },
  ],
}

describe('the broadcast overlay', () => {
  it('shows the standings with their gaps, the kart on screen and the captions', () => {
    render(<BroadcastOverlay t={en} readout={readout} nameOf={nameOf} laps={3} live />)
    const layer = screen.getByTestId('kart-broadcast')
    expect(layer).toHaveAttribute('data-cuts', '7')
    expect(layer).toHaveAttribute('data-shot', 'trackside')
    const tower = screen.getByTestId('kart-broadcast-standings')
    const rows = within(tower).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['1AnnLeader', '2Bob+0.412', '3Cara+12.3'])
    expect(screen.getByTestId('kart-broadcast-lap')).toHaveTextContent('Lap 3/3')
    const focus = screen.getByTestId('kart-broadcast-focus')
    expect(focus).toHaveTextContent('Live')
    expect(focus).toHaveTextContent('Trackside')
    expect(focus).toHaveTextContent('Bob')
    expect(focus).toHaveTextContent('142 km/h')
    const captions = screen.getByTestId('kart-broadcast-captions')
    expect(captions).toHaveTextContent('Overtake!')
    expect(captions).toHaveTextContent('Bob passes Cara for place 2')
    expect(captions).toHaveTextContent('Ann leads into the final lap')
  })

  it('in Chinese, with a highlight playing', () => {
    render(
      <BroadcastOverlay
        t={zh}
        readout={readout}
        nameOf={nameOf}
        laps={3}
        live={false}
        highlight={{ n: 2, total: 4, kind: 'photoFinish' }}
      />,
    )
    expect(screen.getByTestId('kart-highlight-banner')).toHaveTextContent('精華 2/4 · 終點險勝')
    expect(screen.getByTestId('kart-broadcast-focus')).toHaveTextContent('重播')
    expect(screen.getByTestId('kart-broadcast-captions')).toHaveTextContent('超車！')
  })
})

describe('the keys', () => {
  it('B turns the broadcast on and off, H hides the interface; the back button the broadcast', () => {
    expect(keyCommand('KeyB')).toBe('broadcast')
    expect(keyCommand('KeyH')).toBe('clean')
    const pressed: boolean[] = []
    pressed[8] = true
    expect(padCommands([], pressed)).toEqual(['broadcast'])
  })
})
