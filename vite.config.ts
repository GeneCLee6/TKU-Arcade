/// <reference types="vitest/config" />
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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

// The Cloudflare plugin runs the Worker (API, Durable Objects) inside `vite dev` and builds it
// next to the client; it is left out of Vitest, which tests the Worker's logic directly.
export default defineConfig({
  plugins: [react(), appVersion(), ...(process.env.VITEST ? [] : [cloudflare()])],
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
        rolldownOptions: {
          output: { codeSplitting: { groups: [{ name: 'app', tags: ['$initial'] }] } },
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
