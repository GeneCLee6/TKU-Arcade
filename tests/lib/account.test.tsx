import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountControl } from '../../src/components/AccountControl.tsx'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { initLanguage, setLanguage } from '../../src/i18n/t.ts'
import { resetAccountForTests, startAccount } from '../../src/lib/account.ts'
import { MemoryRouter } from '../../src/lib/router.tsx'

// The optional club account in the browser (e1-t13)

beforeAll(() => {
  initLanguage()
  setLanguage('en')
})

// tests/setup.ts starts every test signed out on a site without sign-in: here the Worker is asked
beforeEach(() => resetAccountForTests())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const noControl = () => {
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
}

function renderControl(path = '/r/abcdefghij') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <AccountControl />
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('the account in the browser', () => {
  it('shows nothing while sign-in is not configured', async () => {
    const fetchMock = vi.fn(async () => Response.json({ configured: false, account: null }))
    vi.stubGlobal('fetch', fetchMock)
    renderControl()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.anything()))
    await act(() => startAccount())
    noControl()
  })

  it('shows nothing when /api/me fails or answers something else', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ configured: 'yes', account: { id: 'x', name: 'X' } })),
    )
    renderControl()
    await act(() => startAccount())
    noControl()
  })

  it('links to the sign-in with the way back to this page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ configured: true, account: null })),
    )
    renderControl('/r/abcdefghij?x=1')
    const link = await screen.findByRole('link', { name: 'Sign in with Overtrick' })
    expect(link.getAttribute('href')).toBe('/api/auth/start?return=%2Fr%2Fabcdefghij%3Fx%3D1')
  })

  it('takes the token out of the address before handing it to the Worker', async () => {
    window.history.replaceState(null, '', '/r/abcdefghij#overtrick_token=v1.abc.def')
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/auth/callback'
        ? Response.json({ configured: true, account: { id: 'acct-amy', name: 'Amy' } })
        : Response.json({ configured: true, account: null }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await startAccount()
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/r/abcdefghij')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'v1.abc.def' }),
    })
    renderControl()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('says so when coming back did not sign in', async () => {
    window.history.replaceState(null, '', '/#overtrick_token=v1.bad.token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/auth/callback'
          ? Response.json({ error: 'sign_in_failed' }, { status: 400 })
          : Response.json({ configured: true, account: null }),
      ),
    )
    await startAccount()
    renderControl()
    expect(
      await screen.findByText("Couldn't sign you in. Try again from the lobby."),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in with Overtrick' })).toBeInTheDocument()
  })

  it('signs out with a POST', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/api/auth/signout'
        ? new Response(null, { status: 204 })
        : Response.json({ configured: true, account: { id: 'acct-amy', name: 'Amy' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderControl()
    const button = await screen.findByRole('button', { name: 'Sign out' })
    await act(async () => button.click())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' })
    expect(await screen.findByRole('link', { name: 'Sign in with Overtrick' })).toBeInTheDocument()
  })
})
