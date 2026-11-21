import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import type { RoomMember } from '../../shared/protocol.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { loadBody, loadDriver } from '../../src/kart/bodies.ts'
import { KART_IDS, KARTS } from '../../shared/kart/karts.ts'
import RoomGarage from '../../src/kart/roster/RoomGarage.tsx'
import { RosterPicker } from '../../src/kart/roster/RosterPicker.tsx'

registerMessages(KART_MESSAGES)
const en = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)

const member = (id: string, name: string, seat: number | null, look?: string): RoomMember => ({
  id,
  name,
  seat,
  ready: false,
  host: seat === 0,
  online: true,
  absent: false,
  ...(look ? { look } : {}),
})

beforeEach(() => window.localStorage.clear())

describe('the garage (e10-t05)', () => {
  it('shows every vehicle with its tier, the picked one’s stats as bars, and four drivers', () => {
    const onKart = vi.fn()
    const onDriver = vi.fn()
    render(<RosterPicker t={en} kart="heron" driver="club" onKart={onKart} onDriver={onDriver} />)
    const [karts, drivers] = screen.getAllByRole('radiogroup')
    expect(within(karts!).getAllByRole('radio')).toHaveLength(KART_IDS.length)
    expect(within(drivers!).getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: /Egret/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('kart-blurb')).toHaveTextContent('The fastest on a straight')
    // Egret: top speed +2 (5 of 5), handling -2 (1 of 5)
    const stats = screen.getByTestId('kart-stats')
    expect(stats.querySelector('[data-stat="speed"]')).toHaveAttribute('data-value', '5')
    expect(stats.querySelector('[data-stat="handling"]')).toHaveAttribute('data-value', '1')
    expect(screen.getAllByRole('img', { name: '5 of 5' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('radio', { name: /Fiddler/ }))
    expect(onKart).toHaveBeenCalledWith('crab')
    fireEvent.click(screen.getByRole('radio', { name: 'Heart' }))
    expect(onDriver).toHaveBeenCalledWith('heart')
  })

  it('narrows the cards by tab: the bikes, a series, a tier; the pick stays what it was', () => {
    const onKart = vi.fn()
    render(<RosterPicker t={en} kart="heron" driver="club" onKart={onKart} onDriver={vi.fn()} />)
    const cards = () => within(screen.getAllByRole('radiogroup')[0]!).getAllByRole('radio')
    const ids = () => cards().map((card) => card.getAttribute('data-kart'))
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    // All, the bikes, six series (2026-11-20: the item series), four tiers (2026-11-21: the season
    // flagship's)
    expect(tabs).toHaveLength(12)
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Bikes' }))
    expect(ids()).toEqual(['swift', 'hornet', 'petrel'])
    expect(screen.getByRole('tab', { name: 'Bikes' })).toHaveAttribute('aria-selected', 'true')
    // The picked kart is not a bike: still picked, its stats still shown
    expect(screen.getByTestId('kart-picked')).toHaveTextContent('Egret')
    fireEvent.click(screen.getByRole('radio', { name: /Hornet/ }))
    expect(onKart).toHaveBeenCalledWith('hornet')

    fireEvent.click(screen.getByRole('tab', { name: 'Tailwind' }))
    expect(ids()).toEqual(['marlin', 'ray', 'heron', 'kite', 'hornet'])
    // 2026-11-20: the item series, with its perks as tags and a note
    fireEvent.click(screen.getByRole('tab', { name: 'Beachcomber' }))
    expect(ids()).toEqual(['pelican', 'otter', 'cormorant'])
    fireEvent.click(screen.getByRole('radio', { name: /Cormorant/ }))
    expect(onKart).toHaveBeenCalledWith('cormorant')
    fireEvent.click(screen.getByRole('tab', { name: 'Expert' }))
    // Karts first, then bikes
    const experts = KARTS.filter((one) => one.tier === 'expert')
    expect(ids()).toEqual([
      ...experts.filter((one) => one.kind === 'kart').map((one) => one.id),
      ...experts.filter((one) => one.kind === 'bike').map((one) => one.id),
    ])
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(ids()).toHaveLength(KART_IDS.length)
  })

  it('says what the picked vehicle is in tags, and what a bike does differently', () => {
    const { rerender } = render(
      <RosterPicker t={en} kart="whale" driver="club" onKart={vi.fn()} onDriver={vi.fn()} />,
    )
    const tags = () => Array.from(screen.getByTestId('kart-tags').children, (tag) => tag.textContent)
    expect(tags()).toEqual(['Kart', 'Reef', 'Heavy', 'Expert'])
    expect(screen.queryByTestId('kart-bike-note')).toBeNull()
    rerender(<RosterPicker t={en} kart="petrel" driver="club" onKart={vi.fn()} onDriver={vi.fn()} />)
    expect(tags()).toEqual(['Bike', 'Eddy', 'Drift', 'Expert', 'Narrow', 'Tips in fast', 'Easily knocked'])
    expect(screen.getByTestId('kart-bike-note')).toHaveTextContent('narrower')
    // Weight -2: one of five
    expect(screen.getByTestId('kart-stats').querySelector('[data-stat="weight"]')).toHaveAttribute(
      'data-value',
      '1',
    )
  })

  it('shows what an item vehicle spends on items, and says what that costs (2026-11-20)', () => {
    render(<RosterPicker t={en} kart="cormorant" driver="club" onKart={vi.fn()} onDriver={vi.fn()} />)
    const tags = Array.from(screen.getByTestId('kart-tags').children, (tag) => tag.textContent)
    expect(tags).toEqual(['Kart', 'Beachcomber', 'Items', 'Expert', 'Strong items more often', 'Bubble stops two'])
    expect(screen.getByTestId('kart-series-item-note')).toHaveTextContent('race without items')
  })

  it('has a name and a line about every vehicle, in both languages', () => {
    for (const lang of ['en', 'zh-TW'] as const) {
      const names = KART_IDS.map((id) => translate(lang, `kart.body.${id}`))
      expect(new Set(names).size).toBe(KART_IDS.length)
      for (const id of KART_IDS) {
        expect(translate(lang, `kart.body.${id}`)).not.toContain('kart.')
        expect(translate(lang, `kart.blurb.${id}` as `kart.${string}`)).not.toContain('kart.')
      }
    }
  })

  it('in the waiting room, tells the room this browser’s pick and shows everyone’s', () => {
    window.localStorage.setItem('tku-arcade.kart.body', 'ray')
    window.localStorage.setItem('tku-arcade.kart.driver', 'diamond')
    const onSetLook = vi.fn()
    const members = {
      a: member('a', 'Ann', 0),
      b: member('b', 'Bob', 1, 'crab.heart'),
      c: member('c', 'Cy', null, 'heron.club'),
    }
    const { rerender } = render(<RoomGarage members={members} you="a" onSetLook={onSetLook} />)
    expect(onSetLook).toHaveBeenLastCalledWith('ray.diamond')
    const picks = screen.getByTestId('kart-picks')
    expect(within(picks).getByText('Fiddler with Heart')).toBeInTheDocument()
    expect(within(picks).getByText('Not picked yet')).toBeInTheDocument()
    // A spectator is not racing
    expect(within(picks).queryByText('Cy')).toBeNull()

    // A change is kept in the browser and sent
    fireEvent.click(screen.getByRole('radio', { name: /Egret/ }))
    expect(onSetLook).toHaveBeenLastCalledWith('heron.diamond')
    expect(loadBody()).toBe('heron')
    expect(loadDriver()).toBe('diamond')

    // Once the room has it, nothing more is sent
    onSetLook.mockClear()
    rerender(
      <RoomGarage
        members={{ ...members, a: member('a', 'Ann', 0, 'heron.diamond') }}
        you="a"
        onSetLook={onSetLook}
      />,
    )
    expect(onSetLook).not.toHaveBeenCalled()
  })
})
