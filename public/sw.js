// The installed app's service worker (e7-t09). It caches nothing of the app itself, so a new deploy
// is never held back by an old copy: pages, code and the API always come from the network. Only
// when a page cannot be fetched at all (no connection) does it answer with the offline page.
const CACHE = 'tku-arcade-offline-v1'
const OFFLINE = ['/offline.html', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
  } else if (new URL(request.url).pathname === '/icon-192.png') {
    event.respondWith(fetch(request).catch(() => caches.match('/icon-192.png')))
  }
})
