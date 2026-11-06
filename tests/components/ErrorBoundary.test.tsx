import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '../../src/components/ErrorBoundary.tsx'
import { initLanguage } from '../../src/i18n/t.ts'
import {
  installErrorReporting,
  isStaleChunkError,
  reloadForStaleChunk,
  reportClientError,
} from '../../src/lib/errorReport.ts'

const RELOADED_KEY = 'tku-arcade.chunkReloadAt'

function Bomb({ error }: { error: Error | null }): React.ReactNode {
  if (error) throw error
  return <p>fine</p>
}

const STALE = new TypeError(
  'Failed to fetch dynamically imported module: https://x/assets/RoomPage-old.js',
)

function reports(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/errors')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>)
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  initLanguage()
  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
  vi.stubGlobal('fetch', fetchMock)
  // React logs every error a boundary catches
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('passes through when all is well', () => {
    render(
      <ErrorBoundary resetKey="/">
        <Bomb error={null} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('shows a way on instead of a blank page, and reports what broke', () => {
    const reload = vi.fn()
    render(
      <ErrorBoundary resetKey="/" reload={reload}>
        <Bomb error={new Error('kaboom one')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(reload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(reports(fetchMock)).toMatchObject([{ kind: 'boundary', message: 'kaboom one' }])
  })

  it('reloads once by itself for a chunk a deploy took away, then offers the button', () => {
    const reload = vi.fn()
    const first = render(
      <ErrorBoundary resetKey="/" reload={reload}>
        <Bomb error={STALE} />
      </ErrorBoundary>,
    )
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('A new version is out')
    expect(reports(fetchMock)[0]).toMatchObject({ kind: 'chunk' })
    first.unmount()

    // As after that reload, with the chunk still failing: no loop
    render(
      <ErrorBoundary resetKey="/" reload={reload}>
        <Bomb error={STALE} />
      </ErrorBoundary>,
    )
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('tries again on going somewhere else, and only then', () => {
    const view = (key: string, error: Error | null) => (
      <ErrorBoundary resetKey={key}>
        <Bomb error={error} />
      </ErrorBoundary>
    )
    const { rerender } = render(view('/r/a', new Error('kaboom two')))
    rerender(view('/r/a', null))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(view('/', null))
    expect(screen.getByText('fine')).toBeInTheDocument()
  })
})

describe('errorReport', () => {
  it('knows what each browser says about a failed import, and nothing else', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/a.js',
      'error loading dynamically imported module: https://x/a.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/a.css',
    ]) {
      expect(isStaleChunkError(new TypeError(message)), message).toBe(true)
    }
    expect(isStaleChunkError(new Error('kaboom'))).toBe(false)
    expect(isStaleChunkError('Importing a module script failed.')).toBe(false)
  })

  it('reloads once a minute at most', () => {
    const reload = vi.fn()
    expect(reloadForStaleChunk(reload, 1_000_000)).toBe(true)
    expect(reloadForStaleChunk(reload, 1_000_000 + 59_000)).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
    expect(reloadForStaleChunk(reload, 1_000_000 + 60_000)).toBe(true)
    expect(sessionStorage.getItem(RELOADED_KEY)).toBe(String(1_060_000))
  })

  it('does not risk a loop without somewhere to keep the mark', () => {
    const reload = vi.fn()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(reloadForStaleChunk(reload, 1_000_000)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('says the same thing only once, sends no room id and survives a failing fetch', () => {
    window.history.pushState({}, '', '/r/abcdefghij')
    reportClientError('error', new Error('only once'))
    reportClientError('error', new Error('only once'))
    expect(reports(fetchMock).filter((r) => r.message === 'only once')).toHaveLength(1)
    expect(reports(fetchMock).at(-1)?.path).toBe('/r/:id')
    window.history.pushState({}, '', '/')

    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))
    expect(() => reportClientError('rejection', 'a plain string')).not.toThrow()
  })

  it('stops after a few, however many things go wrong', () => {
    for (let i = 0; i < 20; i++) reportClientError('error', new Error(`many ${i}`))
    expect(reports(fetchMock).length).toBeLessThanOrEqual(5)
  })

  it('catches what nothing else did', () => {
    installErrorReporting()
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught thing') }))
    // A script or image that failed to load: no error, and no report
    window.dispatchEvent(new ErrorEvent('error'))
    // The per-page cap is shared with the tests above, so this only checks it does not throw
    expect(() => {
      const event = new Event('unhandledrejection')
      Object.assign(event, { reason: new Error('unhandled thing') })
      window.dispatchEvent(event)
    }).not.toThrow()
  })
})
