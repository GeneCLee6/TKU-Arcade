import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initLanguage } from '../../src/i18n/t.ts'
import { GameFlagsPanel, UsagePanel } from '../../src/pages/OwnerPanels.tsx'
import type { AdminFlagsResponse } from '../../shared/protocol.ts'
import type { UsageResponse } from '../../shared/usage.ts'

beforeEach(() => {
  localStorage.clear()
  initLanguage()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const flags = (paused: string[]): AdminFlagsResponse => ({
  games: ['promotion', 'kart'].map((id) => ({ id, enabled: !paused.includes(id), updatedAt: null })),
})

describe('the per-game switches (e12-t11)', () => {
  it('pause a game with the owner’s key, and show it paused', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json(flags(init?.method === 'PUT' ? ['kart'] : [])),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<GameFlagsPanel ownerKey="k" />)
    const row = (await screen.findByText('Kart')).closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(within(row).getByText('Paused')).toBeInTheDocument())
    expect(within(row).getByRole('button', { name: 'Open again' })).toBeEnabled()
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/admin/flags')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual({ game: 'kart', enabled: false })
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer k')
  })
})

describe('the cost dashboard (e12-t15)', () => {
  it('says "not set up" without the token', async () => {
    const body: UsageResponse = { configured: false, plan: 'free', lines: [], alerts: [] }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)))
    render(<UsagePanel ownerKey="k" />)
    expect(await screen.findByText(/Not set up/)).toHaveTextContent('CF_ANALYTICS_TOKEN')
  })

  it('shows each metric’s share and the alerts', async () => {
    const body: UsageResponse = {
      configured: true,
      plan: 'free',
      lines: [
        { metric: 'workers_requests', window: 'day', period: '2026-11-18', used: 90_000, allowance: 100_000 },
        { metric: 'r2_storage_bytes', window: 'stored', period: 'now', used: 1e9, allowance: 1e10 },
        { metric: 'do_duration_gbs', window: 'day', period: '2026-11-19', used: null, allowance: 13_000 },
      ],
      alerts: [
        { period: '2026-11-18', metric: 'workers_requests', used: 90_000, allowance: 100_000, createdAt: 1 },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)))
    render(<UsagePanel ownerKey="k" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Worker requests (2026-11-18): 90% of the allowance',
    )
    const workers = screen.getByRole('rowheader', { name: 'Worker requests' }).closest('tr')!
    expect(workers).toHaveAttribute('data-over')
    expect(workers).toHaveTextContent('90%')
    const r2 = screen.getByRole('rowheader', { name: 'R2 storage' }).closest('tr')!
    expect(r2).toHaveTextContent('1.00 GB')
    expect(r2).not.toHaveAttribute('data-over')
    expect(screen.getByRole('rowheader', { name: /duration/ }).closest('tr')).toHaveTextContent(
      'No answer',
    )
  })
})
