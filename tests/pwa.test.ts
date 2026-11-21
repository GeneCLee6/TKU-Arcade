// @vitest-environment node
// The installed app's service worker (2026-11-21, docs/ARCHITECTURE.md §4.56; scripts/pwa/): what the
// build writes into it, and what it answers. The worker runs here against stand-ins for its global
// scope, the Cache Storage and the network: pages come from the network with the offline page as the
// only fallback; the build's hashed files are kept; the API, the WebSocket, anything not GET and
// anything from another site are never touched; a new version waits until the page says so.
import { describe, expect, it, vi } from 'vitest'
import template from '../scripts/pwa/sw.js?raw'
import {
  buildVersion,
  serviceWorkerSource,
  shellFiles,
  type BundleFile,
} from '../scripts/pwa/serviceWorker.ts'
import { contentSecurityPolicy } from '../shared/security-headers.ts'

const ORIGIN = 'https://arcade.example'
const SHELL = ['/assets/index-abc.js', '/assets/messages.en-def.js']

type Listener = (event: Record<string, unknown>) => void

/** The worker's global scope, Cache Storage and network, with what it did to them */
function runWorker(network: (request: Request) => Promise<Response>) {
  // The worker fetches its offline page by path, as a page would
  const fetchFor = (request: Request | string) =>
    network(typeof request === 'string' ? new Request(new URL(request, ORIGIN)) : request)
  const listeners = new Map<string, Listener>()
  const stores = new Map<string, Map<string, Response>>()
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>()
    stores.set(name, store)
    return {
      match: async (request: Request | string) => {
        const url = typeof request === 'string' ? new URL(request, ORIGIN).href : request.url
        return store.get(url)?.clone()
      },
      put: async (request: Request | string, response: Response) =>
        void store.set(typeof request === 'string' ? new URL(request, ORIGIN).href : request.url, response),
      addAll: async (urls: string[]) => {
        for (const url of urls) store.set(new URL(url, ORIGIN).href, new Response(`kept ${url}`))
      },
    }
  }
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (request: Request | string, options?: { ignoreSearch?: boolean }) => {
      const url = new URL(typeof request === 'string' ? request : request.url, ORIGIN)
      if (options?.ignoreSearch) url.search = ''
      for (const store of stores.values()) {
        const found = store.get(url.href)
        if (found) return found.clone()
      }
      return undefined
    },
  }
  const fetch = vi.fn(fetchFor)
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}) },
  }
  const source = serviceWorkerSource(template, 'v2', SHELL)
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch)

  /** A lifecycle event; resolves once its waitUntil has */
  const lifecycle = async (type: 'install' | 'activate') => {
    let work: Promise<unknown> = Promise.resolve()
    listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => (work = promise) })
    await work
  }
  /** A request as the page makes it: the worker's answer, or null when it let the request pass */
  const request = async (url: string, init: RequestInit & { mode?: string } = {}) => {
    const { mode = 'cors', ...rest } = init
    const req = new Request(new URL(url, ORIGIN), rest)
    Object.defineProperty(req, 'mode', { value: mode })
    let answer: Promise<Response> | null = null
    listeners.get('fetch')!({ request: req, respondWith: (response: Promise<Response>) => (answer = response) })
    return answer === null ? null : ((await answer) as Response)
  }
  return { self, stores, fetch, lifecycle, request, listeners }
}

const ok = (body: string, type = 'text/javascript') => {
  const response = new Response(body, { headers: { 'content-type': type } })
  Object.defineProperty(response, 'type', { value: 'basic' })
  return response
}
const offline = () => Promise.reject(new TypeError('Failed to fetch'))

describe('the service worker', () => {
  it('keeps the shell and the offline page at install, in this version’s cache only', async () => {
    // Cloudflare's /offline.html is a redirect to /offline: what the worker keeps is the page itself
    const worker = runWorker(async () => {
      const page = ok('<h1>offline</h1>', 'text/html')
      page.headers.set('content-security-policy', "default-src 'self'")
      Object.defineProperty(page, 'redirected', { value: true })
      return page
    })
    worker.stores.set('tku-arcade-v1', new Map())
    worker.stores.set('tku-arcade-offline-v1', new Map())
    worker.stores.set('someone-else', new Map())
    await worker.lifecycle('install')
    const kept = [...worker.stores.get('tku-arcade-v2')!.keys()].map((url) => new URL(url).pathname)
    expect(kept).toEqual(expect.arrayContaining(['/offline.html', '/icon-192.png', ...SHELL]))
    const page = worker.stores.get('tku-arcade-v2')!.get(`${ORIGIN}/offline.html`)!
    expect(page.redirected).toBe(false)
    // With the site's policy still on it
    expect(page.headers.get('content-security-policy')).toBe("default-src 'self'")
    expect(await page.clone().text()).toBe('<h1>offline</h1>')
    // A new version waits for the page's word; it never takes over by itself
    expect(worker.self.skipWaiting).not.toHaveBeenCalled()
    await worker.lifecycle('activate')
    expect([...worker.stores.keys()].sort()).toEqual(['someone-else', 'tku-arcade-v2'])
    expect(worker.self.clients.claim).toHaveBeenCalled()
  })

  it('takes over when the page says so, and on nothing else', () => {
    const worker = runWorker(offline)
    worker.listeners.get('message')!({ data: 'something else' })
    expect(worker.self.skipWaiting).not.toHaveBeenCalled()
    worker.listeners.get('message')!({ data: 'skip-waiting' })
    expect(worker.self.skipWaiting).toHaveBeenCalledOnce()
  })

  it('never touches the API, the WebSocket, a POST or another site', async () => {
    const worker = runWorker(async () => ok('network'))
    expect(await worker.request('/api/rooms', { method: 'POST', body: '{}' })).toBeNull()
    expect(await worker.request('/api/lobby')).toBeNull()
    expect(await worker.request('/api/rooms/abcdefghij')).toBeNull()
    expect(await worker.request('/ws/abcdefghij?v=2')).toBeNull()
    expect(await worker.request('/assets/index-abc.js', { method: 'POST', body: 'x' })).toBeNull()
    expect(await worker.request('https://fonts.googleapis.com/css2?family=Saira')).toBeNull()
    expect(await worker.request('https://fonts.gstatic.com/s/saira/v1/a.woff2')).toBeNull()
    expect(worker.fetch).not.toHaveBeenCalled()
  })

  it('takes pages from the network, every time, and the offline page only without one', async () => {
    let online = true
    const worker = runWorker(async (request) =>
      online
        ? ok(new URL(request.url).pathname === '/offline.html' ? 'offline page' : '<html>new</html>', 'text/html')
        : offline(),
    )
    await worker.lifecycle('install')
    expect(await (await worker.request('/r/abcdefghij', { mode: 'navigate' }))!.text()).toBe('<html>new</html>')
    expect(await (await worker.request('/', { mode: 'navigate' }))!.text()).toBe('<html>new</html>')
    // Never kept: nothing but the offline page could come from the cache
    const kept = [...worker.stores.get('tku-arcade-v2')!.keys()].map((url) => new URL(url).pathname)
    expect(kept).not.toContain('/')
    expect(kept).not.toContain('/r/abcdefghij')
    online = false
    expect(await (await worker.request('/', { mode: 'navigate' }))!.text()).toBe('offline page')
  })

  it('keeps the build’s hashed files the first time, but never an error or a page in their place', async () => {
    let answer = () => ok('chunk')
    const worker = runWorker(async () => answer())
    const first = await worker.request('/assets/KartPlay-x1.js')
    expect(await first!.text()).toBe('chunk')
    answer = () => ok('changed')
    // A name means one file for good: the kept one, without the network
    expect(await (await worker.request('/assets/KartPlay-x1.js'))!.text()).toBe('chunk')
    expect(worker.fetch).toHaveBeenCalledTimes(1)
    // The site's fallback page for a file of an older deploy, and a server error: passed on, not kept
    answer = () => ok('<html>', 'text/html')
    await worker.request('/assets/Gone-y2.js')
    answer = () => new Response('oops', { status: 500 })
    await worker.request('/assets/Broken-z3.js')
    const kept = [...worker.stores.get('tku-arcade-v2')!.keys()].map((url) => new URL(url).pathname)
    expect(kept).toEqual(['/assets/KartPlay-x1.js'])
    // A range (a sound's) is the browser's own business
    expect(await worker.request('/assets/engine-a.wav', { headers: { range: 'bytes=0-' } })).toBeNull()
  })

  it('lets everything else of the site pass: the worker script, _headers, a robots file', async () => {
    const worker = runWorker(async () => ok('x'))
    expect(await worker.request('/sw.js')).toBeNull()
    expect(await worker.request('/robots.txt')).toBeNull()
    expect(await worker.request('/icon-512.png')).toBeNull()
  })
})

describe('the build', () => {
  const chunk = (
    fileName: string,
    more: Partial<Extract<BundleFile, { type: 'chunk' }>> = {},
  ): BundleFile => ({ type: 'chunk', fileName, isEntry: false, imports: [], facadeModuleId: null, ...more })

  it('puts the entry, what it imports, their styles and the two languages in the shell', () => {
    const bundle: Record<string, BundleFile> = {
      'assets/index-a.js': chunk('assets/index-a.js', {
        isEntry: true,
        imports: ['assets/runtime-b.js'],
        viteMetadata: { importedCss: new Set(['assets/index-c.css']) },
      }),
      'assets/runtime-b.js': chunk('assets/runtime-b.js'),
      'assets/index-c.css': { type: 'asset', fileName: 'assets/index-c.css' },
      'assets/messages.en-d.js': chunk('assets/messages.en-d.js', {
        facadeModuleId: 'C:\\dev\\arcade\\src\\i18n\\messages.en.ts',
      }),
      'assets/messages.zh-TW-e.js': chunk('assets/messages.zh-TW-e.js', {
        facadeModuleId: '/repo/src/i18n/messages.zh-TW.ts',
      }),
      'assets/KartPlay-f.js': chunk('assets/KartPlay-f.js', { facadeModuleId: '/repo/src/kart/bots/KartPlay.tsx' }),
      'index.html': { type: 'asset', fileName: 'index.html' },
    }
    expect(shellFiles(bundle)).toEqual([
      '/assets/index-a.js',
      '/assets/index-c.css',
      '/assets/messages.en-d.js',
      '/assets/messages.zh-TW-e.js',
      '/assets/runtime-b.js',
    ])
  })

  it('names a build by its files, so that the same build is the same worker', () => {
    expect(buildVersion(['b', 'a'])).toBe(buildVersion(['a', 'b']))
    expect(buildVersion(['a', 'b'])).not.toBe(buildVersion(['a', 'c']))
    expect(buildVersion(['a'])).toMatch(/^[0-9a-f]{12}$/)
  })

  it('fills in the template, and refuses one that has lost its placeholders', () => {
    const source = serviceWorkerSource(template, 'abc', ['/assets/x.js'])
    expect(source).toContain('const VERSION = "abc"')
    expect(source).toContain('const SHELL = ["/assets/x.js"]')
    expect(() => serviceWorkerSource('// nothing here', 'abc', [])).toThrow(/placeholders/)
  })

  it('needs nothing more of the Content-Security-Policy than the worker and manifest from this site', () => {
    const policy = contentSecurityPolicy([])
    expect(policy).toContain("worker-src 'self'")
    expect(policy).toContain("manifest-src 'self'")
    // The worker fetches only from this site, which connect-src already allows
    expect(policy).toContain("connect-src 'self'")
    expect(policy).not.toContain('*')
    expect(policy).not.toContain('unsafe-eval')
  })
})
