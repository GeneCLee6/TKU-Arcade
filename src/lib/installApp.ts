// The site as an installed app (e7-t09, owner 2026-11-13). Chrome and Edge offer to install it
// through `beforeinstallprompt`, which is caught here as early as possible (main.tsx) so the lobby
// can offer its own button; iPhone's Safari has no such event, only Share → Add to Home Screen, so
// the lobby says how instead. The service worker (scripts/pwa/sw.js, built to /sw.js) keeps the
// build's own files and shows an offline page; a new version waits until this page's person says to
// reload (2026-11-21, docs/ARCHITECTURE.md §4.56).
import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from './storage.ts'

/** Chrome's install event; not in the DOM typings */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const changed = () => {
  for (const listener of listeners) listener()
}

/** Opened from the home screen (installed), not in a browser tab */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true) return true
  // 2026-11-22: the manifest asks for full screen first (display_override); a page the browser shows
  // full screen through the Fullscreen API matches it too, so that one does not count
  return window.matchMedia?.('(display-mode: fullscreen)').matches === true && !document.fullscreenElement
}

/** An Android phone in a browser tab: a browser without Chrome's install offer has it in its menu */
export function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/.test(navigator.userAgent) && !isStandalone()
}

const HINT_KEY = 'tku-arcade.installHint'

/** The person closed the lobby's install offer: it stays closed on this device */
export function installHintDismissed(): boolean {
  return readStored(HINT_KEY) === 'dismissed'
}

export function dismissInstallHint(): void {
  writeStored(HINT_KEY, 'dismissed')
}

/** iPhone or iPad in a browser tab, where only Safari's Share menu installs the app */
export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && !isStandalone()
}

/** Called once at start-up: keeps Chrome's install offer for the lobby's button, and the worker */
export function startInstallSupport(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    changed()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    changed()
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => void registerWorker())
  }
}

// ── A new version (2026-11-21) ───────────────────────────────────────────────────────────────

/** How long the page waits between two looks for a new version, when it comes back into view */
const UPDATE_CHECK_MS = 10 * 60_000

/** The new version's worker, installed and waiting for this page to say so; null while there is none */
let waiting: ServiceWorker | null = null
/** This page asked the new worker to take over, and reloads once it has */
let reloading = false

function offerUpdate(worker: ServiceWorker | null): void {
  // Only a new version: the first worker a browser installs has nothing to replace
  if (worker === null || navigator.serviceWorker.controller === null || waiting === worker) return
  waiting = worker
  changed()
}

async function registerWorker(): Promise<void> {
  const container = navigator.serviceWorker
  let registration: ServiceWorkerRegistration
  try {
    // Never from the HTTP cache: a new deploy's worker is seen at once
    registration = await container.register('/sw.js', { updateViaCache: 'none' })
  } catch (error) {
    console.warn('service worker', error)
    return
  }
  offerUpdate(registration.waiting)
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offerUpdate(worker)
    })
  })
  container.addEventListener('controllerchange', () => {
    if (!reloading) return
    window.location.reload()
  })
  // A phone keeps the app open for days: look again whenever it comes back into view
  let checked = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - checked < UPDATE_CHECK_MS) return
    checked = Date.now()
    registration.update().catch(() => {
      // Offline, or the server is busy: the next look tries again
    })
  })
}

/** Has the waiting version take over; the page reloads into it (`controllerchange`) */
export function applyUpdate(): void {
  if (waiting === null) {
    window.location.reload()
    return
  }
  reloading = true
  waiting.postMessage('skip-waiting')
}

/** A new version is ready and this page is still the old one */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribe, () => waiting !== null, () => false)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True while the browser offers to install; null otherwise */
export function useInstallOffer(): (() => Promise<void>) | null {
  const offer = useSyncExternalStore(subscribe, () => deferred, () => null)
  if (offer === null) return null
  return async () => {
    await offer.prompt()
    await offer.userChoice
    deferred = null
    changed()
  }
}
