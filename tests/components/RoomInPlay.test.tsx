import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoverableSeat, RoomMember, RoomStatus, RoomView } from '../../shared/protocol.ts'
import { RoomInPlay } from '../../src/components/RoomInPlay.tsx'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { en } from '../../src/i18n/en.ts'
import { setLanguage } from '../../src/i18n/t.ts'
import { zhTW } from '../../src/i18n/zh-TW.ts'
import { stubDialog } from '../lib/stubDialog.ts'

const member = (id: string, over: Partial<RoomMember> = {}): RoomMember => ({
  id,
  name: id,
  seat: null,
  ready: false,
  host: false,
  online: true,
  absent: false,
  ...over,
})

const al = (over: Partial<RoomMember> = {}) => member('Al', { seat: 0, host: true, ...over })
const bo = (over: Partial<RoomMember> = {}) => member('Bo', { seat: 1, ...over })
const cy = (over: Partial<RoomMember> = {}) => member('Cy', over)

function viewOf(
  status: RoomStatus,
  members: RoomMember[],
  { coverable = [], maxSeats = 4 }: { coverable?: CoverableSeat[]; maxSeats?: number } = {},
): RoomView {
  return {
    room: { id: 'room', gameId: 'promotion', status, options: {}, minPlayers: 2, maxSeats },
    members: Object.fromEntries(members.map((m) => [m.id, m])),
    game: null,
    coverable,
  }
}

function renderRoom(view: RoomView, you = 'Al') {
  const handlers = {
    onSit: vi.fn(),
    onCover: vi.fn(),
    onKick: vi.fn(),
    onTransfer: vi.fn(),
    onDissolve: vi.fn(),
    onReopen: vi.fn(),
    onRematch: vi.fn(),
  }
  render(
    <ToastProvider>
      <RoomInPlay view={view} you={you} timers={[]} {...handlers} />
    </ToastProvider>,
  )
  return handlers
}

const button = (name: string) => screen.queryByRole('button', { name })
const named = (key: 'room.cover.skipNamed' | 'room.cover.proxyNamed', seat: number) =>
  en[key].replace('{seat}', String(seat))

beforeAll(stubDialog)

beforeEach(() => {
  localStorage.clear()
  setLanguage('en')
})

describe('spectators', () => {
  it('tells a spectator they are watching, while playing', () => {
    renderRoom(viewOf('playing', [al(), bo(), cy()]), 'Cy')
    expect(screen.getByText(en['room.spectating'])).toBeInTheDocument()
  })

  it('does not tell a seated player that', () => {
    renderRoom(viewOf('playing', [al(), bo(), cy()]), 'Bo')
    expect(screen.queryByText(en['room.spectating'])).toBeNull()
  })

  it('offers no seat and no standing up while playing', () => {
    renderRoom(viewOf('playing', [al(), bo(), cy()]), 'Cy')
    expect(button('Sit in seat 3')).toBeNull()
    expect(button(en['room.waiting.standUp'])).toBeNull()

    renderRoom(viewOf('playing', [al(), bo(), cy()]), 'Bo')
    expect(button(en['room.waiting.standUp'])).toBeNull()
  })

  it('offers a spectator exactly the free seats while ended, counted from one', () => {
    const { onSit } = renderRoom(viewOf('ended', [al(), bo({ seat: 2 }), cy()]), 'Cy')

    expect(button('Sit in seat 1')).toBeNull()
    expect(button('Sit in seat 3')).toBeNull()
    expect(button('Sit in seat 2')).toBeInTheDocument()
    expect(button('Sit in seat 4')).toBeInTheDocument()
    expect(button('Sit in seat 5')).toBeNull()

    fireEvent.click(button('Sit in seat 4')!)
    expect(onSit).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('counts an offline member’s seat as held', () => {
    renderRoom(viewOf('ended', [al(), bo({ online: false, absent: true }), cy()]), 'Cy')
    expect(button('Sit in seat 2')).toBeNull()
  })

  it('says so when every seat is taken', () => {
    renderRoom(viewOf('ended', [al(), bo(), cy()], { maxSeats: 2 }), 'Cy')
    expect(screen.getByText(en['room.ended.noFreeSeat'])).toBeInTheDocument()
  })

  it('lets a seated member stand up while ended, and shows them no seats', () => {
    const { onSit } = renderRoom(viewOf('ended', [al(), bo()]), 'Bo')
    expect(button('Sit in seat 3')).toBeNull()
    fireEvent.click(button(en['room.waiting.standUp'])!)
    expect(onSit).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('leaves the rematch to follow the seated count', () => {
    renderRoom(viewOf('ended', [al(), cy()]))
    expect(button(en['room.host.rematch'])).toBeDisabled()
    expect(button(en['room.waiting.standUp'])).toBeInTheDocument()
  })
})

describe('member rows', () => {
  it('shows an absent member once as offline, with the host’s kick and no transfer', () => {
    renderRoom(viewOf('playing', [al(), bo({ online: false, absent: true })]))
    const row = screen.getByText('Bo').closest('li') as HTMLElement
    expect(within(row).getAllByText(en['room.waiting.badge.offline'])).toHaveLength(1)
    expect(button('Kick Bo')).toBeInTheDocument()
    expect(button('Make Bo host')).toBeNull()
  })
})

describe('cover', () => {
  const stuck = (entry: Partial<CoverableSeat> = {}) =>
    viewOf('playing', [al(), bo({ online: false, absent: true })], {
      coverable: [{ seat: 1, skip: true, proxy: true, ...entry }],
    })

  const skip = (seat = 2) => button(named('room.cover.skipNamed', seat))
  const proxy = (seat = 2) => button(named('room.cover.proxyNamed', seat))

  it('shows nothing when no seat is waited for', () => {
    renderRoom(viewOf('playing', [al(), bo()]))
    expect(screen.queryByRole('heading', { name: en['room.cover.heading'] })).toBeNull()
    expect(screen.queryByText(en['room.cover.waitForHost'])).toBeNull()
  })

  it('names the seat and who holds it', () => {
    renderRoom(stuck())
    expect(screen.getByText('Seat 2: Bo, away')).toBeInTheDocument()
  })

  it('says a seat is empty when a kicked player left it', () => {
    renderRoom(viewOf('playing', [al()], { coverable: [{ seat: 2, skip: true, proxy: false }] }))
    expect(screen.getByText('Seat 3, now empty')).toBeInTheDocument()
    expect(skip(3)).toBeInTheDocument()
  })

  it.each([
    [true, true],
    [true, false],
    [false, true],
  ])('with skip %s and proxy %s, the host gets just those', (canSkip, canProxy) => {
    const { onCover, onReopen } = renderRoom(stuck({ skip: canSkip, proxy: canProxy }))

    expect(skip() !== null).toBe(canSkip)
    expect(proxy() !== null).toBe(canProxy)
    expect(screen.queryByText(en['room.cover.cannotContinue'])).toBeNull()

    // At once: it comes up again and again, and costs little
    if (canSkip) {
      fireEvent.click(skip()!)
      expect(onCover).toHaveBeenLastCalledWith(1, 'skip')
    }
    if (canProxy) {
      fireEvent.click(proxy()!)
      expect(onCover).toHaveBeenLastCalledWith(1, 'proxy')
    }
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onReopen).not.toHaveBeenCalled()
  })

  it('with neither, tells the host and leaves End game', () => {
    renderRoom(stuck({ skip: false, proxy: false }))
    expect(skip()).toBeNull()
    expect(proxy()).toBeNull()
    expect(screen.getByText(en['room.cover.cannotContinue'])).toBeInTheDocument()
    expect(button(en['room.host.endGame'])).toBeInTheDocument()
  })

  it('has a row for each seat, each acting on its own', () => {
    const { onCover } = renderRoom(
      viewOf('playing', [al(), bo({ online: false, absent: true })], {
        coverable: [
          { seat: 1, skip: true, proxy: false },
          { seat: 3, skip: true, proxy: false },
        ],
      }),
    )
    fireEvent.click(skip(4)!)
    expect(onCover).toHaveBeenCalledExactlyOnceWith(3, 'skip')
  })

  it.each([
    ['a seated player', 'Bo'],
    ['a spectator', 'Cy'],
  ])('gives %s a muted line and no controls', (_, you) => {
    const members = [al(), bo(), cy()]
    renderRoom(
      viewOf('playing', members, {
        coverable: [
          { seat: 2, skip: true, proxy: true },
          { seat: 3, skip: false, proxy: false },
        ],
      }),
      you,
    )
    expect(screen.getByText(en['room.cover.waitForHost'])).toBeInTheDocument()
    expect(skip(3)).toBeNull()
    expect(proxy(3)).toBeNull()
    expect(screen.queryByText(en['room.cover.cannotContinue'])).toBeNull()
  })

  it('does not show while ended, whatever the list says', () => {
    renderRoom(
      viewOf('ended', [al(), bo()], { coverable: [{ seat: 1, skip: true, proxy: true }] }),
    )
    expect(skip()).toBeNull()
  })

  it('speaks the other language too', () => {
    setLanguage('zh-TW')
    renderRoom(stuck())
    expect(screen.getByText(zhTW['room.cover.skip'])).toBeInTheDocument()
    expect(screen.getByText(zhTW['room.cover.proxy'])).toBeInTheDocument()
  })
})
