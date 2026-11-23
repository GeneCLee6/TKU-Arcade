// 2026-11-23 (QA sweep, docs/QA-SWEEP-2026-11-23.md): /kart?bots opens the race against the
// computer's panel even when the first render suspends. React throws a suspended first render away
// and runs it again, state initialisers included; the address used to lose `bots` in the first run.
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const chunk = { ready: false, coming: null as Promise<void> | null }

vi.mock('../../src/kart/SpikePage.tsx', () => ({
  SpikePage: ({ openBots }: { openBots?: boolean }) => {
    // Suspends once, as a lazy chunk still on its way does
    if (!chunk.ready) {
      chunk.coming ??= new Promise<void>((resolve) => setTimeout(resolve, 10)).then(() => {
        chunk.ready = true
      })
      throw chunk.coming
    }
    return <p data-testid="menu">{openBots ? 'bots panel' : 'plain menu'}</p>
  },
}))

const { KartPlay } = await import('../../src/kart/bots/KartPlay.tsx')

describe('/kart?bots', () => {
  afterEach(() => {
    chunk.ready = false
    chunk.coming = null
    window.history.replaceState(null, '', '/')
  })

  it('opens the panel after a suspended first render, then takes bots off the address', async () => {
    window.history.replaceState(null, '', '/kart?bots')
    render(
      <Suspense fallback={<p>loading</p>}>
        <KartPlay />
      </Suspense>,
    )
    expect(await screen.findByTestId('menu')).toHaveTextContent('bots panel')
    expect(window.location.search).toBe('')
  })

  it('opens the plain menu without it', async () => {
    window.history.replaceState(null, '', '/kart')
    render(
      <Suspense fallback={<p>loading</p>}>
        <KartPlay />
      </Suspense>,
    )
    expect(await screen.findByTestId('menu')).toHaveTextContent('plain menu')
  })
})
