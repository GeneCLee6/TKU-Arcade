import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { enterFullscreen, exitFullscreen } from '../../src/lib/fullscreen.ts'
import { PauseLayer } from '../../src/kart/ui/PauseLayer.tsx'
import { isRacePaused, resumeRace } from '../../src/kart/race/raceClock.ts'

// 2026-11-23 (QA follow-up, docs/NEXT.md §5): in Firefox and Safari the first Esc in full screen is
// the browser's, which leaves full screen and never reaches the page (no Keyboard Lock there). The
// race's menu opens when the browser ends full screen, as that Esc opens it in Chrome; a room's race
// gets its menu (the race goes on), a race alone stops

registerMessages(KART_MESSAGES)
const en = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)

const root = document.documentElement as HTMLElement & { requestFullscreen: unknown }
let shown: Element | null = null

function giveApi() {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => shown })
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
  root.requestFullscreen = async () => {
    shown = root
    document.dispatchEvent(new Event('fullscreenchange'))
  }
  document.exitFullscreen = async () => {
    shown = null
    document.dispatchEvent(new Event('fullscreenchange'))
  }
}

/** The browser's own way out: its Esc */
const browserEsc = () =>
  act(() => {
    shown = null
    document.dispatchEvent(new Event('fullscreenchange'))
  })

afterEach(() => {
  exitFullscreen()
  shown = null
  Reflect.deleteProperty(root, 'requestFullscreen')
  resumeRace()
})

describe('full screen left by the browser during a race', () => {
  it('opens the pause menu of a race alone, and the race stops', async () => {
    giveApi()
    render(<PauseLayer t={en} canPause onRestart={() => {}} />)
    await act(() => enterFullscreen())
    expect(screen.queryByTestId('kart-pause')).toBeNull()
    browserEsc()
    expect(screen.getByTestId('kart-pause')).toHaveAttribute('data-paused', 'true')
    expect(isRacePaused()).toBe(true)
  })

  it("opens a room's menu, where the race goes on", async () => {
    giveApi()
    render(<PauseLayer t={en} canPause={false} onLeave={() => {}} />)
    await act(() => enterFullscreen())
    browserEsc()
    expect(screen.getByTestId('kart-pause')).toBeVisible()
    expect(screen.getByTestId('kart-pause')).not.toHaveAttribute('data-paused')
    expect(isRacePaused()).toBe(false)
  })

  it('leaves the menu shut when the page itself left (the menu’s own button) or is not racing', async () => {
    giveApi()
    const { unmount } = render(<PauseLayer t={en} canPause onRestart={() => {}} />)
    await act(() => enterFullscreen())
    act(() => exitFullscreen())
    expect(screen.queryByTestId('kart-pause')).toBeNull()
    unmount()
    render(<PauseLayer t={en} canPause enabled={false} />)
    await act(() => enterFullscreen())
    browserEsc()
    expect(screen.queryByTestId('kart-pause')).toBeNull()
  })
})
