// 2026-11-22: the site's one full screen (src/lib/fullscreen.ts): the browser's where it can, focus
// mode where it cannot, Esc, the setting that goes full screen on the way into a race, and the lock
// of a phone on its side
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armAutoFullscreen,
  autoFullscreen,
  enterFullscreen,
  exitFullscreen,
  fullscreenMode,
  lockLandscape,
  setAutoFullscreen,
  subscribeFullscreen,
  toggleFullscreen,
} from '../../src/lib/fullscreen.ts'

const root = document.documentElement as HTMLElement & { requestFullscreen: unknown }
let shown: Element | null = null

/** A browser with the Fullscreen API: what it shows, and its event */
function giveApi(refuse = false) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => shown })
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
  root.requestFullscreen = vi.fn(async () => {
    if (refuse) throw new Error('denied')
    shown = root
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  document.exitFullscreen = vi.fn(async () => {
    shown = null
    document.dispatchEvent(new Event('fullscreenchange'))
  })
}

/** An iPhone's Safari: no API at all */
function takeApi() {
  Reflect.deleteProperty(root, 'requestFullscreen')
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: undefined })
}

beforeEach(() => {
  shown = null
  localStorage.clear()
})
afterEach(() => {
  exitFullscreen()
  takeApi()
})

describe('full screen (2026-11-22)', () => {
  it('shows the whole page full screen where the browser can, and leaves it', async () => {
    giveApi()
    const heard = vi.fn()
    const off = subscribeFullscreen(heard)
    expect(await enterFullscreen()).toBe('fullscreen')
    expect(root.requestFullscreen).toHaveBeenCalled()
    expect(fullscreenMode()).toBe('fullscreen')
    expect(heard).toHaveBeenCalled()
    exitFullscreen()
    expect(document.exitFullscreen).toHaveBeenCalled()
    expect(fullscreenMode()).toBe('off')
    off()
  })

  it('follows the browser when its own Esc leaves full screen', async () => {
    giveApi()
    await enterFullscreen()
    shown = null
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(fullscreenMode()).toBe('off')
  })

  it('falls back to focus mode where there is no API or it is refused, and Esc leaves it', async () => {
    takeApi()
    expect(await enterFullscreen()).toBe('focus')
    expect(root.hasAttribute('data-focus-mode')).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(fullscreenMode()).toBe('off')
    expect(root.hasAttribute('data-focus-mode')).toBe(false)

    giveApi(true)
    expect(await toggleFullscreen()).toBe('focus')
    expect(await toggleFullscreen()).toBe('off')
  })

  it('keeps focus mode when a screen takes the Esc itself (the race’s pause menu) or a dialog is open', async () => {
    takeApi()
    await enterFullscreen()
    const taken = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    taken.preventDefault()
    window.dispatchEvent(taken)
    expect(fullscreenMode()).toBe('focus')
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(fullscreenMode()).toBe('focus')
    dialog.remove()
  })

  it('goes full screen on the first key of a race only when the setting is on', async () => {
    giveApi()
    expect(autoFullscreen()).toBe(false)
    armAutoFullscreen()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(root.requestFullscreen).not.toHaveBeenCalled()

    setAutoFullscreen(true)
    const undo = armAutoFullscreen()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(root.requestFullscreen).not.toHaveBeenCalled()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    await vi.waitFor(() => expect(fullscreenMode()).toBe('fullscreen'))
    // Once only
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(root.requestFullscreen).toHaveBeenCalledTimes(1)
    undo()
  })

  it('locks a phone on its side where the browser allows, and says when it does not', async () => {
    const lock = vi.fn(async () => {})
    Object.defineProperty(screen, 'orientation', { configurable: true, value: { lock, unlock: vi.fn() } })
    expect(await lockLandscape()).toBe(true)
    expect(lock).toHaveBeenCalledWith('landscape')
    lock.mockRejectedValueOnce(new Error('not in full screen'))
    expect(await lockLandscape()).toBe(false)
  })
})
