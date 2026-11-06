import { routeOf, type ClientErrorKind } from '../../shared/client-error.ts'

/** A page in trouble tends to repeat itself: this many reports, each different, and no more */
const MAX_REPORTS_PER_PAGE = 5
const sent = new Set<string>()

function pageVersion(): string {
  return document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? 'unknown'
}

/** Tells the Worker what broke (POST /api/errors), which scrubs it again; never throws */
export function reportClientError(kind: ClientErrorKind, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const signature = `${kind}:${message}`
  if (sent.has(signature) || sent.size >= MAX_REPORTS_PER_PAGE) return
  sent.add(signature)
  try {
    // keepalive: a report just before a reload should still arrive
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        kind,
        message: message.slice(0, 600),
        stack: error instanceof Error ? error.stack?.slice(0, 3_000) : undefined,
        path: routeOf(window.location.pathname),
        version: pageVersion(),
      }),
    }).catch(() => {
      // There is nobody left to tell
    })
  } catch {
    // The same
  }
}

/** Errors nothing caught. A resource that failed to load has no `error`, and is not one of these */
export function installErrorReporting(): void {
  window.addEventListener('error', (event) => {
    if (event.error !== undefined && event.error !== null) reportClientError('error', event.error)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('rejection', event.reason)
  })
}

// What browsers say when a dynamic import fails. After a deploy the old chunk's URL gets the app's
// index.html (the SPA fallback), which no browser accepts as a module
const STALE_CHUNK =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS/i

export const isStaleChunkError = (error: unknown) =>
  error instanceof Error && STALE_CHUNK.test(error.message)

const RELOADED_KEY = 'tku-arcade.chunkReloadAt'
/** Reloading again this soon would not help: the failure is something else, or the network's */
const RELOAD_COOLDOWN_MS = 60_000

/**
 * Reloads the page for a new build's chunks, unless that was just tried. True if it did. The mark is
 * in sessionStorage, so that it is this tab's; without one, we would rather show a button than risk
 * a loop.
 */
export function reloadForStaleChunk(reload: () => void, now: number = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_KEY) ?? 0)
    if (now - last < RELOAD_COOLDOWN_MS) return false
    window.sessionStorage.setItem(RELOADED_KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}
