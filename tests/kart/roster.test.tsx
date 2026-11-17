import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import type { RoomMember } from '../../shared/protocol.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { loadBody, loadDriver } from '../../src/kart/bodies.ts'
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
  it('shows six karts with their tiers, the picked one’s stats as bars, and four drivers', () => {
    const onKart = vi.fn()
    const onDriver = vi.fn()
    render(<RosterPicker t={en} kart="heron" driver="club" onKart={onKart} onDriver={onDriver} />)
    const [karts, drivers] = screen.getAllByRole('radiogroup')
    expect(within(karts!).getAllByRole('radio')).toHaveLength(6)
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
