import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { WaitingRoom } from '../../src/components/WaitingRoom.tsx'
import { initLanguage, setLanguage } from '../../src/i18n/t.ts'
import { stubDialog } from '../lib/stubDialog.ts'

const ROOM = 'abcdefghij'

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
    coverable: [],
  }
}

function renderRoom(view: RoomView, you = 'Al') {
  const handlers = {
    onSit: vi.fn(),
    onReady: vi.fn(),
    onStart: vi.fn(),
    onKick: vi.fn(),
    onTransfer: vi.fn(),
    onDissolve: vi.fn(),
    onSetGame: vi.fn(),
    onSetOptions: vi.fn(),
  }
  const tree = (next: RoomView) => (
    <ToastProvider>
      <WaitingRoom roomId={ROOM} view={next} you={you} {...handlers} />
    </ToastProvider>
  )
  const { rerender } = render(tree(view))
  return { ...handlers, showView: (next: RoomView) => rerender(tree(next)) }
}

const al = (over: Partial<RoomMember> = {}) => member('Al', { seat: 0, host: true, ...over })
const bo = (over: Partial<RoomMember> = {}) => member('Bo', { seat: 1, ...over })

const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement
const startButton = () => screen.queryByRole('button', { name: 'Start game' })

beforeAll(stubDialog)

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

describe('the host, on someone else’s row', () => {
  const button = (name: string) => screen.queryByRole('button', { name })
  const dialog = (name: string) => screen.getByRole('dialog', { name })
  const inDialog = (title: string, name: string) =>
    within(dialog(title)).getByRole('button', { name })

  it('has no controls on their own row', () => {
    renderRoom(viewOf([al(), bo()]))
    expect(button('Kick Al')).toBeNull()
    expect(button('Make host: Al')).toBeNull()
    expect(button('Kick Bo')).toBeInTheDocument()
    expect(button('Make host: Bo')).toBeInTheDocument()
  })

  it('reaches spectators too', () => {
    renderRoom(viewOf([al(), member('Cy')]))
    expect(within(rowOf('Cy')).getByRole('button', { name: 'Kick Cy' })).toBeInTheDocument()
  })

  it('kicks only after confirming, naming the person', () => {
    const { onKick } = renderRoom(viewOf([al(), bo()]))
    fireEvent.click(button('Kick Bo')!)
    expect(onKick).not.toHaveBeenCalled()
    expect(dialog('Kick Bo?')).toHaveTextContent(/Bo will be removed.*5 minutes/)

    fireEvent.click(inDialog('Kick Bo?', 'Kick'))

    expect(onKick).toHaveBeenCalledExactlyOnceWith('Bo')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not kick when the confirmation is cancelled', () => {
    const { onKick } = renderRoom(viewOf([al(), bo()]))
    fireEvent.click(button('Kick Bo')!)
    fireEvent.click(inDialog('Kick Bo?', 'Cancel'))
    expect(onKick).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not kick when the confirmation is closed', () => {
    const { onKick } = renderRoom(viewOf([al(), bo()]))
    fireEvent.click(button('Kick Bo')!)
    fireEvent.click(inDialog('Kick Bo?', 'Close'))
    expect(onKick).not.toHaveBeenCalled()
  })

  it('hands the host over only after confirming', () => {
    const { onTransfer } = renderRoom(viewOf([al(), bo()]))
    fireEvent.click(button('Make host: Bo')!)
    expect(onTransfer).not.toHaveBeenCalled()
    expect(dialog('Make Bo the host?')).toHaveTextContent(/take this back/)

    fireEvent.click(inDialog('Make Bo the host?', 'Make host'))

    expect(onTransfer).toHaveBeenCalledExactlyOnceWith('Bo')
  })

  it('can kick someone offline, but not make them host', () => {
    renderRoom(viewOf([al(), bo({ online: false })]))
    expect(button('Kick Bo')).toBeInTheDocument()
    expect(button('Make host: Bo')).toBeNull()
  })

  describe('with a confirmation open', () => {
    it('drops it when the person goes offline, sending nothing', () => {
      const { onTransfer, showView } = renderRoom(viewOf([al(), bo()]))
      fireEvent.click(button('Make host: Bo')!)
      showView(viewOf([al(), bo({ online: false })]))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(onTransfer).not.toHaveBeenCalled()
    })

    it('drops it when this person stops being the host', () => {
      const { showView } = renderRoom(viewOf([al(), bo()]))
      fireEvent.click(button('Kick Bo')!)
      showView(viewOf([al({ host: false }), bo({ host: true })]))
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('does not move on to whoever takes that seat next', () => {
      const { onKick, showView } = renderRoom(viewOf([al(), bo()]))
      fireEvent.click(button('Kick Bo')!)

      showView(viewOf([al(), bo({ seat: 2 }), member('Cy', { seat: 1 })]))

      expect(screen.queryByRole('dialog', { name: 'Kick Cy?' })).toBeNull()
      expect(onKick).not.toHaveBeenCalled()
    })
  })
})

describe('everyone else, on the rows', () => {
  it('has no host controls', () => {
    renderRoom(viewOf([al(), bo(), member('Cy', { seat: 2 })]), 'Bo')
    expect(screen.queryByRole('button', { name: /^Kick/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Make/ })).toBeNull()
  })
})

describe('dissolving', () => {
  const dissolve = () => screen.queryByRole('button', { name: 'Dissolve room' })

  it('is only for the host', () => {
    renderRoom(viewOf([al(), bo()]), 'Bo')
    expect(dissolve()).toBeNull()
  })

  it('happens only after confirming', () => {
    const { onDissolve } = renderRoom(viewOf([al()]))
    fireEvent.click(dissolve()!)
    expect(onDissolve).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog', { name: 'Dissolve this room?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onDissolve).not.toHaveBeenCalled()

    fireEvent.click(dissolve()!)
    const again = screen.getByRole('dialog', { name: 'Dissolve this room?' })
    fireEvent.click(within(again).getByRole('button', { name: 'Dissolve room' }))
    expect(onDissolve).toHaveBeenCalledOnce()
  })
})

describe('the game', () => {
  const inGame = (gameId: string, view = viewOf([al(), bo()])): RoomView => ({
    ...view,
    room: { ...view.room, gameId },
  })
  const select = () => screen.getByRole('combobox', { name: 'Game' })
  const choices = () =>
    within(select())
      .getAllByRole('option')
      .map((option) => option.textContent)

  it('lets the host pick only among the games the lobby lists', () => {
    renderRoom(inGame('promotion'))
    expect(select()).toHaveValue('promotion')
    expect(choices()).toEqual([
      'Promotion',
      'Silent Table',
      'Spectrum',
      'Bluff Reader',
      'Odd Word Out',
      'Lantern Lane',
      'Clubroom Tiles',
      'Kite Day',
    ])
  })

  it('still shows an unlisted game as the selected one, and can leave it', () => {
    const { onSetGame } = renderRoom(inGame('tictactoe'))
    expect(select()).toHaveValue('tictactoe')
    expect(choices()).toHaveLength(9)

    fireEvent.change(select(), { target: { value: 'promotion' } })

    expect(onSetGame).toHaveBeenCalledExactlyOnceWith('promotion')
    // The room says what is selected, and it has not said yet
    expect(select()).toHaveValue('tictactoe')
  })

  it('keeps a game this page does not know selected, under a generic name', () => {
    renderRoom(inGame('from-the-future'))
    expect(select()).toHaveValue('from-the-future')
    expect(choices()).toContain('Game room')
  })

  it('just shows the game to everyone else', () => {
    renderRoom(inGame('promotion'), 'Bo')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Game').nextElementSibling).toHaveTextContent('Promotion')
  })
})

describe('the rule options', () => {
  const withOptions = (): RoomView => {
    const view = viewOf([al(), bo()])
    return { ...view, room: { ...view.room, options: { dice: 'six-sided', turnLimit: 40 } } }
  }

  it('are the host’s to change, sending every value', () => {
    const { onSetOptions } = renderRoom(withOptions())
    const limit = screen.getByRole('spinbutton')
    expect(limit).toHaveValue(40)

    fireEvent.change(limit, { target: { value: '60' } })
    fireEvent.blur(limit)

    expect(onSetOptions).toHaveBeenCalledExactlyOnceWith({ edition: 'simple', dice: 'six-sided', turnLimit: 60, decisionSeconds: 30, buying: true, endAtDahe: false })
  })

  it('are for everyone else to read', () => {
    renderRoom(withOptions(), 'Bo')
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.getByText('40')).toBeInTheDocument()
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

describe('the promotion edition (C7)', () => {
  const withOptions = (extra: Record<string, string> = {}): RoomView => {
    const view = viewOf([al(), bo()])
    return { ...view, room: { ...view.room, options: { dice: 'six-sided', turnLimit: 40, ...extra } } }
  }

  it('says what each edition is, and shows the dice and round limit only for the simple one', () => {
    const { onSetOptions } = renderRoom(withOptions())
    const edition = screen.getByRole('combobox', { name: 'Edition' })
    expect(edition).toHaveAccessibleDescription(/79 offices/)
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    fireEvent.change(edition, { target: { value: 'full' } })
    expect(onSetOptions).toHaveBeenCalledExactlyOnceWith({ edition: 'full', dice: 'six-sided', turnLimit: 40, decisionSeconds: 30, buying: true, endAtDahe: false })
  })

  it('hides the simple edition’s options in a full room', () => {
    renderRoom(withOptions({ edition: 'full' }))
    expect(screen.getByRole('combobox', { name: 'Edition' })).toHaveAccessibleDescription(/236 offices/)
    expect(screen.queryByRole('spinbutton', { name: 'Round limit' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Dice' })).toBeNull()
    // The full edition's own (C8)
    expect(screen.getByRole('spinbutton', { name: /Seconds to answer/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Buying office/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /End at the first/ })).not.toBeChecked()
  })
})
