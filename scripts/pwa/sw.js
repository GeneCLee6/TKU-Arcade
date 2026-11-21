// The installed app's service worker (e7-t09; 2026-11-21, docs/ARCHITECTURE.md §4.56). The build
// fills in VERSION and SHELL (scripts/pwa/serviceWorker.ts) and serves the result at /sw.js, so every
// deploy is a new worker. What it does, and nothing else:
//
// - Pages always come from the network, never from a cache: a new deploy is the page you get the
//   moment you load one. Only when there is no connection at all does a page get the offline page.
// - The build's own files (/assets/*, every name carries a hash of its content, so a name never
//   means two different files) are kept after the first time and served from here: the app's shell,
//   the entry and the language that the page loads first, at install; the rest as it is used.
// - The API, the room's WebSocket, anything not GET and anything from another site pass straight
//   through: not even looked at.
//
// A new version installs alongside and waits: the page offers to reload (src/lib/installApp.ts) and
// tells it to take over; closing every tab of the app does the same. Taking over drops the old
// version's files.
const VERSION = 'dev'
/** The app's shell: the build's entry, its styles and its language chunks */
const SHELL = []
const OFFLINE = '/offline.html'
/** Small files of our own, outside /assets/, the offline page shows or a phone asks for */
const STATIC = ['/icon-192.png', '/favicon.svg', '/manifest.webmanifest']
const PREFIX = 'tku-arcade-'
const CACHE = `${PREFIX}${VERSION}`

/**
 * The offline page, kept as a plain page of its own. Cloudflare answers /offline.html with a redirect
 * to /offline, and a redirected answer cannot stand in for a page someone navigated to: so it is
 * read through and kept anew, under its own name
 */
async function keepOffline(cache) {
  const response = await fetch(OFFLINE)
  if (!response.ok) throw new Error(`offline page: ${response.status}`)
  // With the site's own security headers (the Content-Security-Policy above all), as it came
  const headers = new Headers(response.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  const page = new Response(await response.blob(), { headers })
  await cache.put(OFFLINE, page)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all([keepOffline(cache), cache.addAll([...STATIC, ...SHELL])])),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// From the page, when its person asked for the new version
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

/** A file of the build's, as the server gave it: never an error, never a page in its place */
function keepable(response) {
  if (!response.ok || response.type !== 'basic') return false
  const type = response.headers.get('content-type') ?? ''
  return !type.startsWith('text/html')
}

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE)
  const kept = await cache.match(request)
  if (kept) return kept
  const response = await fetch(request)
  if (keepable(response)) await cache.put(request, response.clone())
  return response
}

async function fromNetworkFirst(request) {
  try {
    return await fetch(request)
  } catch (error) {
    const kept = await caches.match(request, { ignoreSearch: true })
    if (kept) return kept
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE).then((page) => page ?? Response.error())),
    )
  } else if (url.pathname.startsWith('/assets/') && !request.headers.has('range')) {
    event.respondWith(fromCacheFirst(request))
  } else if (STATIC.includes(url.pathname)) {
    event.respondWith(fromNetworkFirst(request))
  }
})
