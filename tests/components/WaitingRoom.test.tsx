import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { WaitingRoom } from '../../src/components/WaitingRoom.tsx'
import { initLanguage, setLanguage } from '../../src/i18n/t.ts'

const ROOM = 'abcdefghij'

const member = (id: string, over: Partial<RoomMember> = {}): RoomMember => ({
  id,
  name: id,
  seat: null,
  ready: false,
  host: false,
  online: true,
  ...over,
})

function viewOf(members: RoomMember[], minPlayers = 2, maxSeats = 3): RoomView {
  return {
    room: {
      id: ROOM,
      gameId: 'promotion',
      status: 'waiting',
      options: {},
      minPlayers,
      maxSeats,
    },
    members: Object.fromEntries(members.map((m) => [m.id, m])),
    game: null,
  }
}

function renderRoom(view: RoomView, you = 'Al') {
  const handlers = { onSit: vi.fn(), onReady: vi.fn(), onStart: vi.fn() }
  render(
    <ToastProvider>
      <WaitingRoom roomId={ROOM} view={view} you={you} {...handlers} />
    </ToastProvider>,
  )
  return handlers
}

const al = (over: Partial<RoomMember> = {}) => member('Al', { seat: 0, host: true, ...over })
const bo = (over: Partial<RoomMember> = {}) => member('Bo', { seat: 1, ...over })

const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement
const startButton = () => screen.queryByRole('button', { name: 'Start game' })

beforeEach(() => {
  localStorage.clear()
  initLanguage()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('seats', () => {
  it('lists every seat counted from one, taken or free', () => {
    renderRoom(viewOf([al()]))
    const seats = within(screen.getAllByRole('list')[0]).getAllByRole('listitem')
    expect(seats).toHaveLength(3)
    expect(seats[0]).toHaveTextContent('Seat 1')
    expect(seats[0]).toHaveTextContent('Al')
    expect(seats[2]).toHaveTextContent('Seat 3')
    expect(seats[2]).toHaveTextContent('Empty')
  })

  it('says in words who is the host, you, ready and offline', () => {
    renderRoom(viewOf([al(), bo({ ready: true, online: false })]))
    expect(within(rowOf('Al')).getByText('Host')).toBeInTheDocument()
    expect(within(rowOf('Al')).getByText('You')).toBeInTheDocument()
    expect(within(rowOf('Al')).queryByText('Ready')).not.toBeInTheDocument()
    expect(within(rowOf('Bo')).getByText('Ready')).toBeInTheDocument()
    expect(within(rowOf('Bo')).getByText('Offline')).toBeInTheDocument()
    expect(within(rowOf('Bo')).queryByText('You')).not.toBeInTheDocument()
  })

  it('moves you to a free seat, named by its number', () => {
    const { onSit } = renderRoom(viewOf([al()]))
    fireEvent.click(screen.getByRole('button', { name: 'Sit in seat 3' }))
    expect(onSit).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('button', { name: 'Sit in seat 1' })).not.toBeInTheDocument()
  })
})

describe('your controls', () => {
  it('says ready', () => {
    const { onReady } = renderRoom(viewOf([al()]))
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }))
    expect(onReady).toHaveBeenCalledWith(true)
  })

  it('takes ready back', () => {
    const { onReady } = renderRoom(viewOf([al({ ready: true })]))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel ready' }))
    expect(onReady).toHaveBeenCalledWith(false)
  })

  it('stands up', () => {
    const { onSit } = renderRoom(viewOf([al()]))
    fireEvent.click(screen.getByRole('button', { name: 'Stand up' }))
    expect(onSit).toHaveBeenCalledWith(null)
  })

  it('lists a spectator and asks them to pick a seat, without seated controls', () => {
    renderRoom(viewOf([al(), member('Cy')]), 'Cy')
    expect(screen.getByRole('heading', { name: 'Spectators' })).toBeInTheDocument()
    expect(within(rowOf('Cy')).getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Pick a free seat to play.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ready' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stand up' })).not.toBeInTheDocument()
  })

  it('has no spectator list without spectators', () => {
    renderRoom(viewOf([al()]))
    expect(screen.queryByRole('heading', { name: 'Spectators' })).not.toBeInTheDocument()
    expect(screen.queryByText('Pick a free seat to play.')).not.toBeInTheDocument()
  })
})

describe('start', () => {
  it('is disabled below the minimum, and says how many it takes', () => {
    renderRoom(viewOf([al(), member('Cy')], 2))
    expect(startButton()).toBeDisabled()
    const hint = screen.getByText('Need at least 2 seated players to start')
    expect(startButton()).toHaveAttribute('aria-describedby', hint.id)
  })

  it('works at the minimum, ready or not', () => {
    const { onStart } = renderRoom(viewOf([al(), bo()], 2))
    expect(screen.queryByText(/Need at least/)).not.toBeInTheDocument()
    fireEvent.click(startButton()!)
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('is only for the host; others are told to wait', () => {
    renderRoom(viewOf([al(), bo()], 2), 'Bo')
    expect(startButton()).not.toBeInTheDocument()
    expect(screen.getByText('Waiting for the host to start')).toBeInTheDocument()
  })
})

describe('invite', () => {
  const link = `${window.location.origin}/r/${ROOM}`
  const copyClick = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
  }
  const stubClipboard = (clipboard: unknown) =>
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('shows the link and its QR code', () => {
    renderRoom(viewOf([al()]))
    expect(screen.getByText(link)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR code for the room link' })).toBeInTheDocument()
  })

  it('copies the link and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard({ writeText })
    renderRoom(viewOf([al()]))
    await copyClick()
    expect(writeText).toHaveBeenCalledWith(link)
    expect(screen.getByText('Link copied.')).toBeInTheDocument()
  })

  it.each([
    ['is refused', { writeText: () => Promise.reject(new Error('denied')) }],
    ['does not exist', undefined],
  ])('asks to copy by hand when the clipboard %s', async (_, clipboard) => {
    stubClipboard(clipboard)
    renderRoom(viewOf([al()]))
    await copyClick()
    expect(screen.getByText(/copy it by hand/)).toBeInTheDocument()
    expect(screen.queryByText('Link copied.')).not.toBeInTheDocument()
  })
})

describe('in Traditional Chinese', () => {
  afterEach(() => {
    act(() => setLanguage('en'))
  })

  it('translates the room', () => {
    act(() => setLanguage('zh-TW'))
    renderRoom(viewOf([al()]))
    expect(screen.getByRole('heading', { name: '座位' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '開始遊戲' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '坐到座位 2' })).toBeInTheDocument()
    expect(screen.getByText('房主')).toBeInTheDocument()
  })
})
