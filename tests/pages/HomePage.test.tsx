import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameCard } from '../../src/components/GameCard.tsx'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { initLanguage, setLanguage, translate } from '../../src/i18n/t.ts'
import { resetAccountForTests } from '../../src/lib/account.ts'
import { MemoryRouter, Route, Routes } from '../../src/lib/router.tsx'
import { useLocation } from '../../src/lib/useRouter.ts'
import { HomePage } from '../../src/pages/HomePage.tsx'
import { LOBBY_GAMES } from '../../shared/games/catalog.ts'
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

/** Every listed game has its own New room button; these tests make Promotion rooms */
const cardOf = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('li')!
const newRoom = () => within(cardOf('Promotion')).getByRole('button', { name: 'New room' })
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

describe('signed in (e1-t13)', () => {
  it('shows the account name, offers no change, and creates a room without asking', async () => {
    resetAccountForTests({ configured: true, account: { id: 'acct-amy', name: 'Amy' } })
    localStorage.setItem(NICKNAME_KEY, 'Tpyo')
    const fetchMock = stubFetch(created)
    renderLobby()
    expect(screen.getByText('Playing as Amy (Overtrick account)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    fireEvent.click(newRoom())
    expect(screen.queryByRole('textbox', { name: 'Nickname' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/r/${ROOM}`))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows no sign-in at all while it is not configured', () => {
    renderLobby()
    expect(screen.queryByRole('link', { name: 'Sign in with Overtrick' })).not.toBeInTheDocument()
  })
})

describe('lobby cards', () => {
  it('lists promotion, silent table, spectrum, bluff reader, odd word out and lantern lane with their facts, and not the unlisted tic-tac-toe', async () => {
    renderLobby()
    const card = screen.getByRole('heading', { level: 3, name: 'Promotion' }).closest('li')!
    expect(within(card).getByText('2–6 players')).toBeInTheDocument()
    expect(within(card).getByText('About 20 min')).toBeInTheDocument()
    expect(within(card).getByText(/^Roll your way/)).toBeInTheDocument()
    expect(screen.queryByText(/tic-tac-toe/i)).not.toBeInTheDocument()
    // Listed on the owner's request, 2026-11-12
    const silent = cardOf('Silent Table')
    expect(within(silent).getByText('3–6 players')).toBeInTheDocument()
    expect(within(silent).getByRole('button', { name: 'New room' })).toBeInTheDocument()
    const spectrum = cardOf('Spectrum')
    expect(within(spectrum).getByText('4–11 players')).toBeInTheDocument()
    expect(within(spectrum).getByRole('button', { name: 'New room' })).toBeInTheDocument()
    // Listed with its screen (I2)
    const bluff = cardOf('Bluff Reader')
    expect(within(bluff).getByText('3–9 players')).toBeInTheDocument()
    expect(within(bluff).getByRole('button', { name: 'New room' })).toBeInTheDocument()
    // Listed on the owner's request, 2026-11-14
    const odd = cardOf('Odd Word Out')
    expect(within(odd).getByText('3–12 players')).toBeInTheDocument()
    expect(within(odd).getByRole('button', { name: 'New room' })).toBeInTheDocument()
    // Listed on the owner's request, 2026-11-14
    const lantern = cardOf('Lantern Lane')
    expect(within(lantern).getByText('2–6 players')).toBeInTheDocument()
    expect(within(lantern).getByRole('button', { name: 'New room' })).toBeInTheDocument()
    // Word Bridge and Clue Clash (owner's request, 2026-11-14)
    expect(within(cardOf('Word Bridge')).getByText('2–10 players')).toBeInTheDocument()
    expect(within(cardOf('Clue Clash')).getByText('3–7 players')).toBeInTheDocument()
    // Eight open games; the Coming soon card arrives with its lazy chunk
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(9))
    expect(screen.getAllByRole('button', { name: 'New room' })).toHaveLength(8)
    expect(LOBBY_GAMES.map((game) => game.id)).toEqual([
      'promotion',
      'silent-table',
      'spectrum',
      'bluff',
      'odd-word',
      'lantern',
      'word-bridge',
      'clue-clash',
    ])
  })

  it('shows the games that are not open yet as Coming soon, the kart with a link to try it alone', async () => {
    renderLobby()
    // The tag is part of the heading, so a screen reader hears it with the name
    const heading = await screen.findByRole('heading', { level: 3, name: 'Kart Coming soon' })
    const card = heading.closest('li')!
    expect(within(card).queryByRole('button')).not.toBeInTheDocument()
    // The time trial is open for trying the feel (owner, 2026-11-14): one link, to it
    expect(within(card).getByRole('link', { name: 'Try it alone' })).toHaveAttribute('href', '/kart')
    // A Coming soon card never doubles a listed game: take it out of ComingSoon.tsx when it opens
    for (const game of LOBBY_GAMES) {
      const name = translate('en', `${game.meta.i18nKey}.name`)
      expect(
        screen.getAllByRole('heading', { level: 3, name: new RegExp(`^${name}`) }),
      ).toHaveLength(1)
    }
    // Nothing on the page leads to the kart's hidden spike
    expect(document.querySelector('a[href^="/kart/spike"]')).toBeNull()
  })

  it('translates the Coming soon cards', async () => {
    setLanguage('zh-TW')
    renderLobby()
    expect(
      await screen.findByRole('heading', { level: 3, name: '卡丁車 即將推出' }),
    ).toBeInTheDocument()
    setLanguage('en')
  })

  it('switching language translates the card', () => {
    renderLobby()
    const name = translate('zh-TW', 'games.promotion.name')
    fireEvent.click(screen.getByRole('button', { name: '繁中' }))
    const card = screen.getByRole('heading', { level: 3, name }).closest('li')!
    expect(within(card).getByRole('button', { name: '建立房間' })).toBeInTheDocument()
    expect(within(card).getByText('2–6 人')).toBeInTheDocument()
    expect(within(card).getByText('約 20 分鐘')).toBeInTheDocument()
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

  // e7-t12: the first letter until the card's picture has loaded, then the picture; neither is read
  it('hides the monogram and the picture from screen readers', async () => {
    renderLobby()
    const heading = screen.getByRole('heading', { level: 3, name: 'Promotion' })
    const monogram = heading.parentElement!.querySelector('[aria-hidden]')!
    await waitFor(() => expect(monogram.querySelector('svg')).not.toBeNull())
    expect(monogram.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
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

describe('join by number or link', () => {
  const box = () => screen.getByLabelText('Got a room number or a link?')
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
    expect(screen.getByRole('alert')).toHaveTextContent("That's not a room number or link.")
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
  })

  it('goes to the room a four-digit number belongs to, spaces and all', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(Response.json({ id: ROOM })))
    renderLobby()
    join(' 48 27 ')
    expect(await screen.findByTestId('where')).toHaveTextContent(`/r/${ROOM}`)
    expect(fetchMock).toHaveBeenCalledWith('/api/codes/4827', expect.anything())
  })

  it('says so when no open room has the number, or the lookup fails', async () => {
    stubFetch(() => Promise.resolve(Response.json({ error: 'not_found' }, { status: 404 })))
    renderLobby()
    join('4827')
    expect(await screen.findByRole('alert')).toHaveTextContent('No open room has that number.')
    cleanup()
    stubFetch(() => Promise.reject(new Error('offline')))
    renderLobby()
    join('4827')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not look the room up.')
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
