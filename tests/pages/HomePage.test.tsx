import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameCard } from '../../src/components/GameCard.tsx'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { initLanguage, setLanguage, translate } from '../../src/i18n/t.ts'
import { HomePage } from '../../src/pages/HomePage.tsx'
import { getGame } from '../../shared/games/index.ts'
import { LOBBY_POLL_MS } from '../../shared/protocol.ts'

const ROOM = 'abcdefghij'
const NICKNAME_KEY = 'tku-arcade.nickname'

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderLobby() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/r/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

const newRoom = () => screen.getByRole('button', { name: 'New room' })
/** `implementation` answers everything but the public list, which only `lobby` answers */
const stubFetch = (
  implementation: () => Promise<Response>,
  lobby: () => Promise<Response> = () => Promise.resolve(Response.json({ rooms: [] })),
) => {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    url === '/api/lobby'
      ? lobby()
      : (fetchMock as (u: string, i?: RequestInit) => unknown)(url, init),
  )
  return fetchMock
}
const created = () => Promise.resolve(Response.json({ id: ROOM }, { status: 201 }))

// jsdom has <dialog> but not its methods
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  localStorage.clear()
  initLanguage()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('changing the nickname', () => {
  it('offers nothing until there is a nickname', () => {
    renderLobby()
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
  })

  it('prefills the dialog, stores the new name and creates no room', () => {
    localStorage.setItem(NICKNAME_KEY, 'Tpyo')
    const fetchMock = stubFetch(created)
    renderLobby()
    expect(screen.getByText('Playing as Tpyo')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    const input = screen.getByRole('textbox', { name: 'Nickname' })
    expect(input).toHaveValue('Tpyo')
    fireEvent.change(input, { target: { value: 'Typo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('Playing as Typo')).toBeInTheDocument()
    expect(localStorage.getItem(NICKNAME_KEY)).toBe('Typo')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('lobby cards', () => {
  it('lists promotion with its facts, and not the unlisted tic-tac-toe', () => {
    renderLobby()
    const card = screen.getByRole('heading', { level: 3, name: 'Promotion' }).closest('li')!
    expect(within(card).getByText('2–6 players')).toBeInTheDocument()
    expect(within(card).getByText('About 20 min')).toBeInTheDocument()
    expect(within(card).getByText(/^Roll your way/)).toBeInTheDocument()
    expect(screen.queryByText(/tic-tac-toe/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
  })

  it('switching language translates the card', () => {
    renderLobby()
    const name = translate('zh-TW', 'games.promotion.name')
    fireEvent.click(screen.getByRole('button', { name: '繁中' }))
    expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '建立房間' })).toBeInTheDocument()
    expect(screen.getByText('2–6 人')).toBeInTheDocument()
    expect(screen.getByText('約 20 分鐘')).toBeInTheDocument()
    setLanguage('en')
  })

  it('prints one number when a game takes exactly one player count', () => {
    const game = getGame('promotion')!
    const fixed = { ...game, meta: { ...game.meta, minPlayers: 4, maxPlayers: 4 } }
    render(
      <MemoryRouter>
        <GameCard game={fixed} disabled={false} onNewRoom={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('4 players')).toBeInTheDocument()
    expect(screen.queryByText(/4–4/)).not.toBeInTheDocument()
  })

  it('hides the monogram from screen readers', () => {
    renderLobby()
    const heading = screen.getByRole('heading', { level: 3, name: 'Promotion' })
    const monogram = heading.parentElement!.querySelector('[aria-hidden]')
    expect(monogram).toHaveTextContent(/^P$/)
  })
})

describe('new room', () => {
  it('with a stored nickname creates the room and goes there', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    const fetchMock = stubFetch(created)
    renderLobby()

    fireEvent.click(newRoom())

    expect(await screen.findByTestId('where')).toHaveTextContent(`/r/${ROOM}`)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/rooms')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ gameId: 'promotion' })
  })

  it('without one asks first, and only then creates the room', async () => {
    const fetchMock = stubFetch(created)
    renderLobby()

    fireEvent.click(newRoom())

    const dialog = screen.getByRole('dialog', { name: 'Choose a nickname' })
    expect(fetchMock).not.toHaveBeenCalled()

    const input = within(dialog).getByLabelText('Nickname')
    fireEvent.submit(input.closest('form')!)
    expect(within(dialog).getByRole('alert')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: ' Al ' } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByTestId('where')).toHaveTextContent(`/r/${ROOM}`)
    expect(localStorage.getItem(NICKNAME_KEY)).toBe('Al')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('closing the nickname dialog creates nothing', () => {
    const fetchMock = stubFetch(created)
    renderLobby()
    fireEvent.click(newRoom())
    const dialog = screen.getByRole('dialog', { name: 'Choose a nickname' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument()
  })

  it('stays disabled while in flight, so a second click makes no second room', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    let answer!: (response: Response) => void
    const fetchMock = stubFetch(() => new Promise((resolve) => (answer = resolve)))
    renderLobby()

    fireEvent.click(newRoom())
    expect(newRoom()).toBeDisabled()
    fireEvent.click(newRoom())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    answer(Response.json({ id: ROOM }, { status: 201 }))
    expect(await screen.findByTestId('where')).toBeInTheDocument()
  })

  it.each([
    ['the network fails', () => Promise.reject(new TypeError('offline'))],
    ['the server refuses', () => Promise.resolve(Response.json({ error: 'x' }, { status: 503 }))],
    ['the answer is no room id', () => Promise.resolve(Response.json({ id: '../x' }))],
  ])('when %s shows a toast, stays and can try again', async (_, implementation) => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    stubFetch(implementation as () => Promise<Response>)
    renderLobby()

    fireEvent.click(newRoom())

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't create the room.")
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
    expect(newRoom()).toBeEnabled()
  })

  it('does not carry off someone who left the lobby meanwhile', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_: string, init: RequestInit) => {
        signal = init.signal ?? undefined
        return new Promise(() => {})
      }),
    )
    const { unmount } = renderLobby()
    fireEvent.click(newRoom())
    unmount()
    await waitFor(() => expect(signal?.aborted).toBe(true))
  })
})

describe('join by link', () => {
  const box = () => screen.getByLabelText('Got a link? Paste it here')
  const join = (value: string) => {
    fireEvent.change(box(), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
  }

  it.each([
    ['a whole link', `https://tku-arcade.example/r/${ROOM}`],
    ['a link with a query', `https://tku-arcade.example/r/${ROOM}?x=1#y`],
    ['a bare id', ROOM],
    ['an id with spaces around it', `  ${ROOM} `],
  ])('goes to the room from %s', async (_, value) => {
    renderLobby()
    join(value)
    expect(await screen.findByTestId('where')).toHaveTextContent(`/r/${ROOM}`)
  })

  it.each([
    ['garbage', 'hello there'],
    ['nothing', ''],
    ['an id with a letter base58 leaves out', 'abcdefghi0'],
    ['a link to something else', 'https://example.com/x/abcdefghij'],
  ])('shows an inline error for %s, and no toast', (_, value) => {
    renderLobby()
    join(value)
    expect(screen.getByRole('alert')).toHaveTextContent("That's not a room link or ID.")
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
  })

  it('clears the error on typing', () => {
    renderLobby()
    join('nope')
    fireEvent.change(box(), { target: { value: 'nope2' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('public rooms', () => {
  const LISTING = {
    id: ROOM,
    gameId: 'promotion',
    host: 'Mei',
    seated: 2,
    maxSeats: 6,
    createdAt: 1,
  }
  const lobbyWith =
    (...rooms: unknown[]) =>
    () =>
      Promise.resolve(Response.json({ rooms }))

  it('lists them, and joining goes to the room', async () => {
    stubFetch(created, lobbyWith(LISTING))
    renderLobby()
    const join = await screen.findByRole('button', { name: "Join Mei's room" })
    expect(screen.getByText('Host: Mei · 2/6 seated')).toBeInTheDocument()
    fireEvent.click(join)
    expect(await screen.findByTestId('where')).toHaveTextContent(`/r/${ROOM}`)
  })

  it('says so when there are none, in either language', async () => {
    stubFetch(created)
    renderLobby()
    expect(await screen.findByText('No public rooms are waiting right now.')).toBeInTheDocument()
    cleanup()
    setLanguage('zh-TW')
    renderLobby()
    expect(await screen.findByText('目前沒有等人的公開房。')).toBeInTheDocument()
  })

  it('keeps a game that is not on offer out of the list', async () => {
    stubFetch(created, lobbyWith({ ...LISTING, gameId: 'tictactoe' }))
    renderLobby()
    expect(await screen.findByText('No public rooms are waiting right now.')).toBeInTheDocument()
  })

  it('says when the list cannot be loaded, without hiding the rest of the page', async () => {
    stubFetch(created, () => Promise.resolve(new Response('nope', { status: 500 })))
    renderLobby()
    expect(await screen.findByRole('status')).toHaveTextContent("Couldn't load the public rooms")
    expect(newRoom()).toBeEnabled()
  })

  it('asks again while visible, stops when hidden and asks at once on coming back', async () => {
    const lobby = vi.fn(lobbyWith())
    stubFetch(created, lobby)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    try {
      renderLobby()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(lobby).toHaveBeenCalledTimes(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LOBBY_POLL_MS)
      })
      expect(lobby).toHaveBeenCalledTimes(2)

      hidden.mockReturnValue(true)
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LOBBY_POLL_MS * 4)
      })
      expect(lobby).toHaveBeenCalledTimes(2)

      hidden.mockReturnValue(false)
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(lobby).toHaveBeenCalledTimes(3)
    } finally {
      hidden.mockRestore()
      vi.useRealTimers()
    }
  })

  it('creates a private room unless the box is ticked', async () => {
    localStorage.setItem(NICKNAME_KEY, 'Al')
    const fetchMock = stubFetch(created)
    renderLobby()
    const box = screen.getByRole('checkbox', { name: /List new rooms on this page/ })
    expect(box).not.toBeChecked()
    fireEvent.click(box)
    fireEvent.click(newRoom())
    expect(await screen.findByTestId('where')).toHaveTextContent(`/r/${ROOM}`)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ gameId: 'promotion', public: true })
  })
})
