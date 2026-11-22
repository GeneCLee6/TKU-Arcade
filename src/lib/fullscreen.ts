// 2026-11-22 (owner: "let the web page and the app be played full screen"): one full screen for the
// whole site, shared by the kart (race, waiting room, single-player menu), the board games and the
// race's pause menu (which offers "Leave full screen" through `exitFullscreen`).
//
// The page itself goes full screen (document.documentElement), never one element: the waiting room
// turns into the race and the race into the results without leaving it, dialogs (the top layer) and
// toasts keep showing. Where the Fullscreen API is missing or refused (an iPhone's Safari, a frame
// without permission) the fallback is "focus mode", as promotion's board has had since #141: the
// page's own chrome (the top bar) goes, `data-focus-mode` on <html>, and iPhone people are told that
// added to the home screen the site opens without the browser's bars.
//
// Esc: in real full screen the browser takes Esc and leaves full screen itself; the page hears of it
// (`fullscreenchange`) and every reader of this state follows. Where the browser lets a page keep Esc
// while full screen (Chrome and Edge on a computer, Keyboard Lock), it is kept, so that the race's
// Esc opens its pause menu first and holding Esc still leaves. Focus mode has no browser to leave it:
// Esc leaves it here, unless a dialog is open or a screen took that Esc itself (preventDefault).
//
// Tiny and without React's heavier parts: every room's first screen carries it (docs/ARCHITECTURE.md).
import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from './storage.ts'

export type FullscreenMode = 'off' | 'fullscreen' | 'focus'

/** The Fullscreen API with Safari's older prefix (iPad, Safari before 16.4) */
interface PrefixedDocument {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenEnabled?: boolean
}
interface PrefixedElement {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void
}
/** Keyboard Lock (Chrome, Edge): keeps Esc for the page while full screen */
interface KeyboardLock {
  lock?: (keys?: string[]) => Promise<void>
  unlock?: () => void
}

const FOCUS_ATTRIBUTE = 'data-focus-mode'
const AUTO_KEY = 'tku-arcade.fullscreen.auto'

let focus = false
const listeners = new Set<() => void>()
const changed = () => {
  for (const listener of listeners) listener()
}

const prefixed = () => document as Document & PrefixedDocument

/** The element shown full screen by the browser, or null */
function fullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null
  return document.fullscreenElement ?? prefixed().webkitFullscreenElement ?? null
}

/** Whether this browser can show the page full screen at all (an iPhone cannot) */
export function canFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const root = document.documentElement as HTMLElement & PrefixedElement
  const api = typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function'
  return api && (document.fullscreenEnabled ?? prefixed().webkitFullscreenEnabled ?? true) !== false
}

/** The page's state: the browser's full screen first, then focus mode */
export function fullscreenMode(): FullscreenMode {
  if (fullscreenElement() !== null) return 'fullscreen'
  return focus ? 'focus' : 'off'
}

function setFocus(on: boolean): void {
  if (focus === on) return
  focus = on
  if (on) document.documentElement.setAttribute(FOCUS_ATTRIBUTE, '')
  else document.documentElement.removeAttribute(FOCUS_ATTRIBUTE)
  changed()
}

function keepEscape(on: boolean): void {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard
  try {
    if (on) void keyboard?.lock?.(['Escape'])?.catch(() => {})
    else keyboard?.unlock?.()
  } catch {
    // Not offered here: the browser's Esc leaves full screen, and the page follows
  }
}

let listening = false
function listen(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  const onChange = () => {
    const on = fullscreenElement() !== null
    // Out of the browser's full screen (its own Esc, a swipe, the F11 key): no lock left behind
    if (!on) keepEscape(false)
    changed()
  }
  document.addEventListener('fullscreenchange', onChange)
  document.addEventListener('webkitfullscreenchange', onChange)
  // Focus mode has no browser to leave it: Esc does, unless a dialog or a screen takes that Esc
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !focus || event.defaultPrevented) return
    if (document.querySelector('dialog[open]')) return
    setFocus(false)
  })
}

/**
 * Full screen, from a tap or a key (the browser wants one). Falls back to focus mode where the
 * browser cannot or will not, and says which it got
 */
export async function enterFullscreen(): Promise<FullscreenMode> {
  listen()
  if (fullscreenElement() !== null) return 'fullscreen'
  const root = document.documentElement as HTMLElement & PrefixedElement
  try {
    if (!canFullscreen()) throw new Error('no fullscreen')
    if (typeof root.requestFullscreen === 'function') await root.requestFullscreen({ navigationUI: 'hide' })
    else await root.webkitRequestFullscreen?.()
    setFocus(false)
    keepEscape(true)
  } catch {
    setFocus(true)
  }
  changed()
  return fullscreenMode()
}

/** Leaves full screen or focus mode, whichever the page is in (the pause menu's way out) */
export function exitFullscreen(): void {
  setFocus(false)
  keepEscape(false)
  if (fullscreenElement() === null) return
  try {
    const document_ = prefixed()
    const leaving = document.exitFullscreen ? document.exitFullscreen() : document_.webkitExitFullscreen?.()
    void Promise.resolve(leaving).catch(() => {})
  } catch {
    // Already out
  }
}

export async function toggleFullscreen(): Promise<FullscreenMode> {
  if (fullscreenMode() !== 'off') {
    exitFullscreen()
    return 'off'
  }
  return enterFullscreen()
}

export function subscribeFullscreen(listener: () => void): () => void {
  listen()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The page's full-screen state, kept current */
export function useFullscreenMode(): FullscreenMode {
  return useSyncExternalStore(subscribeFullscreen, fullscreenMode, () => 'off')
}

/** The setting: go full screen by oneself on the way into a race (off unless chosen) */
export function autoFullscreen(): boolean {
  return readStored(AUTO_KEY) === 'on'
}

export function setAutoFullscreen(on: boolean): void {
  writeStored(AUTO_KEY, on ? 'on' : 'off')
  changed()
}

export function useAutoFullscreen(): boolean {
  return useSyncExternalStore(subscribeFullscreen, autoFullscreen, () => false)
}

/**
 * With the setting on, full screen on the next tap or key press (the race's first key, a press on
 * the grid): a browser only lets a page go full screen from one. Only the browser's full screen,
 * never focus mode by surprise. Returns the undo
 */
export function armAutoFullscreen(): () => void {
  if (typeof window === 'undefined' || !autoFullscreen() || !canFullscreen() || fullscreenMode() !== 'off') {
    return () => {}
  }
  const events = ['keydown', 'pointerdown'] as const
  const go = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key === 'Escape') return
    undo()
    if (fullscreenMode() === 'off') void enterFullscreen().then((mode) => mode === 'focus' && setFocus(false))
  }
  const undo = () => {
    for (const name of events) window.removeEventListener(name, go, true)
  }
  for (const name of events) window.addEventListener(name, go, true)
  return undo
}

/**
 * A phone on its side for the race: the browser locks the screen that way only in full screen or
 * an installed app (Chrome on Android); elsewhere it refuses and the race's "turn your phone" hint
 * stays. Says whether it held
 */
export async function lockLandscape(): Promise<boolean> {
  const orientation = (typeof screen === 'undefined' ? undefined : screen.orientation) as
    | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
    | undefined
  if (typeof orientation?.lock !== 'function') return false
  try {
    await orientation.lock('landscape')
    return true
  } catch {
    return false
  }
}

export function unlockOrientation(): void {
  try {
    screen.orientation?.unlock?.()
  } catch {
    // Nothing was locked
  }
}
