import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserRouter, Link, MemoryRouter, Route, Routes } from '../../src/lib/router.tsx'
import { matchPath, parsePath, useLocation, useNavigate, useParams } from '../../src/lib/useRouter.ts'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

function Where() {
  const { pathname, search, hash } = useLocation()
  return <output data-testid="where">{pathname + search + hash}</output>
}

function Room() {
  const { id } = useParams()
  return <output data-testid="room">{id}</output>
}

const routes = (
  <Routes>
    <Route path="*" element={<p>Not found</p>} />
    <Route path="/" element={<Link to="/r/abc">Room</Link>} />
    <Route path="/r/:id" element={<Room />} />
    <Route path="/games/:id/rules" element={<p>Rules</p>} />
  </Routes>
)

describe('matchPath', () => {
  it('matches the way react-router does: any case, trailing slashes, one decoded segment', () => {
    expect(matchPath('/', '/')).toEqual({})
    expect(matchPath('/', '/r')).toBeNull()
    expect(matchPath('/r/:id', '/r/abc')).toEqual({ id: 'abc' })
    expect(matchPath('/r/:id', '/R/abc//')).toEqual({ id: 'abc' })
    expect(matchPath('/r/:id', '/r/a%20b')).toEqual({ id: 'a b' })
    expect(matchPath('/r/:id', '/r/%E0%A4%A')).toEqual({ id: '%E0%A4%A' })
    expect(matchPath('/r/:id', '/r')).toBeNull()
    expect(matchPath('/r/:id', '/r/abc/more')).toBeNull()
    expect(matchPath('/games/:id/rules', '/games/promotion/rules')).toEqual({ id: 'promotion' })
    expect(matchPath('/kart/spike', '/kart/spikes')).toBeNull()
  })

  it('splits a path into its parts', () => {
    expect(parsePath('/r/abc?x=1#y')).toEqual({ pathname: '/r/abc', search: '?x=1', hash: '#y' })
    expect(parsePath('?x=1')).toEqual({ pathname: '/', search: '?x=1', hash: '' })
  })
})

describe('Routes', () => {
  it('draws the matching route with its params, and `*` wherever it is listed when none matches', () => {
    render(<MemoryRouter initialEntries={['/r/xyz']}>{routes}</MemoryRouter>)
    expect(screen.getByTestId('room').textContent).toBe('xyz')
    cleanup()
    render(<MemoryRouter initialEntries={['/nowhere']}>{routes}</MemoryRouter>)
    expect(screen.getByText('Not found')).toBeTruthy()
  })
})

describe('Link and navigate', () => {
  it('a plain click goes there without a reload; a modified or middle click is left to the browser', async () => {
    render(<MemoryRouter>{routes}</MemoryRouter>)
    const link = screen.getByRole('link', { name: 'Room' })
    expect(link.getAttribute('href')).toBe('/r/abc')
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true)
    expect(fireEvent.click(link, { button: 1 })).toBe(true)
    expect(screen.queryByTestId('room')).toBeNull()
    await act(async () => {
      expect(fireEvent.click(link)).toBe(false)
    })
    expect(screen.getByTestId('room').textContent).toBe('abc')
  })

  it('moves the address bar, and follows back and forward', async () => {
    window.history.replaceState(null, '', '/')
    function Buttons() {
      const navigate = useNavigate()
      return (
        <>
          <button onClick={() => navigate('/r/abc?x=1')}>Push</button>
          <button onClick={() => navigate('/games/promotion/rules', { replace: true })}>
            Replace
          </button>
        </>
      )
    }
    render(
      <BrowserRouter>
        <Buttons />
        <Where />
      </BrowserRouter>,
    )
    const press = (name: string) =>
      act(async () => {
        fireEvent.click(screen.getByRole('button', { name }))
      })
    const length = window.history.length
    await press('Push')
    expect(window.location.pathname).toBe('/r/abc')
    expect(screen.getByTestId('where').textContent).toBe('/r/abc?x=1')
    expect(window.history.length).toBe(length + 1)

    await press('Replace')
    expect(window.history.length).toBe(length + 1)
    expect(screen.getByTestId('where').textContent).toBe('/games/promotion/rules')

    await act(async () => {
      window.history.replaceState(null, '', '/elsewhere')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('where').textContent).toBe('/elsewhere')
  })

  it('a link to where you already are replaces the entry instead of adding one', async () => {
    window.history.replaceState(null, '', '/')
    render(
      <BrowserRouter>
        <Link to="/">Home</Link>
      </BrowserRouter>,
    )
    const length = window.history.length
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    })
    expect(window.history.length).toBe(length)
  })
})
