/// <reference types="vitest/config" />
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import { serviceWorker } from './scripts/pwa/serviceWorker.ts'
import { headersFile } from './shared/security-headers.ts'

// Stamps the built commit into index.html so a deployment can be traced back to its commit.
// The deploy workflows set APP_VERSION to the commit they deploy.
const appVersion = (): Plugin => ({
  name: 'app-version',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { name: 'app-version', content: process.env.APP_VERSION ?? 'local' },
      injectTo: 'head',
    },
  ],
})

// Fills in index.html's language chunks (src/i18n/messages.*.ts), so that the page's language is
// fetched alongside the entry rather than after it has run (docs/ARCHITECTURE.md §5)
const LANGUAGE_CHUNKS = '/* language chunks */ {}'
const languageChunks = (): Plugin => ({
  name: 'language-chunks',
  transformIndexHtml: {
    order: 'post',
    handler(html, { bundle }) {
      if (bundle === undefined) return html // vite dev: the entry asks for it
      const chunks: Record<string, string> = {}
      for (const output of Object.values(bundle)) {
        const source = output.type === 'chunk' ? output.facadeModuleId?.replaceAll('\\', '/') : null
        const language = source && /\/src\/i18n\/messages\.(en|zh-TW)\.ts$/.exec(source)?.[1]
        if (language) chunks[language] = `/${output.fileName}`
      }
      if (!chunks.en || !chunks['zh-TW'] || !html.includes(LANGUAGE_CHUNKS)) {
        throw new Error('language-chunks: index.html or the language chunks have moved')
      }
      return html.replace(LANGUAGE_CHUNKS, JSON.stringify(chunks))
    },
  },
})

// Writes the static assets' `_headers` (e12-t13, shared/security-headers.ts, docs/SECURITY.md): the
// Content-Security-Policy allows index.html's inline script by its hash, which changes with every
// build (the language chunks' names are in it), so the file is made here, after index.html
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
const securityHeaders = (): Plugin => ({
  name: 'security-headers',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    if (this.environment.name !== 'client') return
    const page = bundle['index.html']
    if (page?.type !== 'asset') throw new Error('security-headers: no index.html in the client build')
    const html = typeof page.source === 'string' ? page.source : new TextDecoder().decode(page.source)
    const hashes = [...html.matchAll(INLINE_SCRIPT)].map(
      ([, script]) => `sha256-${createHash('sha256').update(script).digest('base64')}`,
    )
    this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(hashes) })
  },
})

// The Cloudflare plugin runs the Worker (API, Durable Objects) inside `vite dev` and builds it
// next to the client; it is left out of Vitest, which tests the Worker's logic directly.
export default defineConfig({
  plugins: [
    react(),
    appVersion(),
    languageChunks(),
    securityHeaders(),
    // The installed app's /sw.js, with this build's version and shell (scripts/pwa/, §4.53)
    serviceWorker(),
    ...(process.env.VITEST ? [] : [cloudflare()])],
  // Port 5175: TKU-BridgeTable uses 5173, BridgeHall 5174
  server: { port: 5175, strictPort: true },
  // The JS budget script (e12-t03) reads the manifest to know which chunks each page loads
  build: { manifest: true },
  environments: {
    client: {
      build: {
        // Everything the entry loads statically goes into one chunk. Left to itself the bundler
        // splits it five ways by which lazy pages share what, and the budget pays for every split:
        // a gzip stream of its own and the import and export names between them, about 2.4 kB on
        // every line (docs/NEXT.md, D4). The lazy chunks still hold only what they add.
        //
        // 2026-11-21 (docs/KART-PERF.md §7): three.js as one chunk. A track's scenery and a family of
        // vehicles (their own lazy chunks) import only its core classes, which would otherwise split
        // it in two and lose a few kB of compression; every page that needs any of it needs all of it.
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                { name: 'app', tags: ['$initial'] },
                { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
              ],
            },
          },
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
