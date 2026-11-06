import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameCard } from '../../src/components/GameCard.tsx'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { initLanguage, setLanguage, translate } from '../../src/i18n/t.ts'
import { HomePage } from '../../src/pages/HomePage.tsx'
import { getGame } from '../../shared/games/index.ts'

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
const stubFetch = (implementation: () => Promise<Response>) => {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchMock)
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
    expect(screen.getByRole('button', { name: '開新房' })).toBeInTheDocument()
    expect(screen.getByText('2–6 人')).toBeInTheDocument()
    expect(screen.getByText('約 20 分鐘')).toBeInTheDocument()
    setLanguage('en')
  })

  it('prints one number when a game takes exactly one player count', () => {
    const game = getGame('promotion')!
    const fixed = { ...game, meta: { ...game.meta, minPlayers: 4, maxPlayers: 4 } }
    render(<GameCard game={fixed} disabled={false} onNewRoom={vi.fn()} />)
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
