import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { App } from '../../src/App.tsx'
import { setLanguage, translate } from '../../src/i18n/t.ts'

beforeEach(() => {
  localStorage.clear()
  setLanguage('en')
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
})

describe('the spike route', () => {
  it('says so in words when there is no WebGL, in either language', async () => {
    // jsdom has no WebGL, like a browser with it turned off
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    window.history.pushState({}, '', '/kart/spike')
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      KART_MESSAGES.en['kart.spike.noWebgl'],
    )

    expect(screen.getByRole('link', { name: 'Back to the lobby' })).toHaveAttribute('href', '/')

    setLanguage('zh-TW')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      KART_MESSAGES['zh-TW']['kart.spike.noWebgl'],
    )
  })

  it('leaves no way to it from the lobby', () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    const addresses = screen.queryAllByRole('link').map((link) => link.getAttribute('href'))
    expect(addresses.filter((address) => address?.includes('kart'))).toEqual([])
  })

  it('leaves /kart itself unknown', async () => {
    window.history.pushState({}, '', '/kart')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('has its strings once the chunk has loaded', async () => {
    await import('../../src/kart/SpikePage.tsx')
    expect(translate('zh-TW', 'kart.spike.title')).toBe(KART_MESSAGES['zh-TW']['kart.spike.title'])
  })
})
