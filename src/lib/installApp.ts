// The site as an installed app (e7-t09, owner 2026-11-13). Chrome and Edge offer to install it
// through `beforeinstallprompt`, which is caught here as early as possible (main.tsx) so the lobby
// can offer its own button; iPhone's Safari has no such event, only Share → Add to Home Screen, so
// the lobby says how instead. The service worker (public/sw.js) only shows an offline page.
import { useSyncExternalStore } from 'react'

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
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
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
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.warn('service worker', error)
      })
    })
  }
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
