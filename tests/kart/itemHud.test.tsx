import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Translate } from '../../src/i18n/t.ts'
import { ItemSlot } from '../../src/kart/race/ItemHud.tsx'
import { WatchedItem } from '../../src/kart/watch/WatchParts.tsx'

// 2026-11-18 (owner: "the items could be at the top of the screen, in the middle, where they stand
// out"): one slot for the race, a race being watched and a replay. Where it sits and how big it is are
// in the browser tests (e2e/kart-bots.spec.ts); here, what it says.

/** The key and its parameters, so that the test reads what was asked for */
const t = ((key: string, params?: Record<string, string | number>) =>
  params ? `${key} ${Object.values(params).join(' ')}` : key) as Translate

describe('the item slot', () => {
  it('says there is no item, with no key to press', () => {
    render(<ItemSlot t={t} item={null} keyName="E" />)
    const slot = screen.getByTestId('kart-item')
    expect(slot).toHaveAttribute('data-item', '')
    expect(slot).toHaveTextContent('games.kart.item.empty')
    expect(slot).not.toHaveTextContent('games.kart.item.press')
    expect(slot.querySelector('svg')).toBeNull()
  })

  it('shows the item held: its icon, its name and the key that uses it', () => {
    render(<ItemSlot t={t} item="shield" keyName="E" />)
    const slot = screen.getByTestId('kart-item')
    expect(slot).toHaveAttribute('data-item', 'shield')
    expect(slot).toHaveTextContent('games.kart.item.shield')
    expect(slot).toHaveTextContent('games.kart.item.press E')
    expect(slot.querySelector('svg')).not.toBeNull()
  })

  it('is a new element for each item, so that each one arriving plays its drop', () => {
    const { rerender } = render(<ItemSlot t={t} item="shield" keyName="E" />)
    const first = screen.getByTestId('kart-item')
    rerender(<ItemSlot t={t} item="shield" keyName="E" />)
    expect(screen.getByTestId('kart-item')).toBe(first)
    rerender(<ItemSlot t={t} item="hail" keyName="E" />)
    expect(screen.getByTestId('kart-item')).not.toBe(first)
    expect(screen.getByTestId('kart-item')).toHaveAttribute('data-item', 'hail')
  })

  it('watching: the same slot for the kart followed, with nothing to press; none in a plain race', () => {
    const { rerender, container } = render(<WatchedItem t={t} item="boost" />)
    expect(screen.getByRole('group', { name: 'games.kart.watch.item' })).toBeInTheDocument()
    const slot = screen.getByTestId('kart-item')
    expect(slot).toHaveAttribute('data-item', 'boost')
    expect(slot).not.toHaveTextContent('games.kart.item.press')
    rerender(<WatchedItem t={t} item={null} />)
    expect(screen.getByTestId('kart-item')).toHaveTextContent('games.kart.item.empty')
    rerender(<WatchedItem t={t} item={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
