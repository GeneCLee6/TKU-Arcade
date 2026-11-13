import { describe, expect, it } from 'vitest'
import lockupDark from '../docs/brand/lockup-dark.svg?raw'
import lockupLight from '../docs/brand/lockup-light.svg?raw'
import markLight from '../docs/brand/mark-light.svg?raw'
import indexHtml from '../index.html?raw'
import touchIcon from '../public/apple-touch-icon.png?inline'
import favicon32 from '../public/favicon-32.png?inline'
import icon192 from '../public/icon-192.png?inline'
import icon512 from '../public/icon-512.png?inline'
import iconMaskable from '../public/icon-maskable-512.png?inline'
import manifestText from '../public/manifest.webmanifest?raw'
import offlineHtml from '../public/offline.html?raw'
import serviceWorker from '../public/sw.js?raw'
import favicon from '../public/favicon.svg?raw'
import topBar from '../src/components/TopBar.tsx?raw'
import { palette } from '../src/styles/tokens.ts'

// The site's logo files (E3, e7-t16; docs/ASSETS.md, DESIGN §4). An image file cannot read the
// page's CSS variables, so these carry colours as values: each must be one of tokens.ts's.
const SVGS: [file: string, svg: string][] = [
  ['public/favicon.svg', favicon],
  ['docs/brand/mark-light.svg', markLight],
  ['docs/brand/lockup-dark.svg', lockupDark],
  ['docs/brand/lockup-light.svg', lockupLight],
]
const PNGS: [file: string, dataUrl: string, size: number][] = [
  ['public/favicon-32.png', favicon32, 32],
  ['public/apple-touch-icon.png', touchIcon, 180],
  ['public/icon-192.png', icon192, 192],
  ['public/icon-512.png', icon512, 512],
  ['public/icon-maskable-512.png', iconMaskable, 512],
]

const tokenValues = new Set(
  [...Object.values(palette.light), ...Object.values(palette.dark)].map((value) =>
    value.toUpperCase(),
  ),
)

describe('the logo files', () => {
  it.each(SVGS)('%s is a plain, named SVG in token colours only', (file, svg) => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. ]+"><title>/)
    expect(svg.trimEnd()).toMatch(/<\/svg>$/)
    // Nothing to run and nothing to fetch: an <img> would not anyway, but a tab or a README might
    expect(svg).not.toMatch(/<script|<foreignObject|href=|url\(|<style|<text/i)
    const colours = [...svg.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toUpperCase())
    expect(colours.length).toBeGreaterThan(0)
    for (const colour of colours) expect(tokenValues, `${file}: ${colour}`).toContain(colour)
  })

  it.each(PNGS)('%s is a square PNG of the right size', (_file, dataUrl, size) => {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (char) => char.charCodeAt(0))
    const view = new DataView(bytes.buffer)
    expect(String.fromCharCode(...bytes.subarray(1, 4))).toBe('PNG')
    // IHDR: width and height, big-endian, at bytes 16 and 20
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([size, size])
  })

  it('is what index.html links, and the top bar shows', () => {
    expect(indexHtml).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />')
    expect(indexHtml).toContain(
      '<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />',
    )
    expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
    expect(topBar).toContain('src="/favicon.svg"')
  })
})

// The installed app (e7-t09, owner 2026-11-13)
describe('the app manifest', () => {
  const manifest = JSON.parse(manifestText) as {
    name: string
    start_url: string
    display: string
    background_color: string
    theme_color: string
    icons: { src: string; sizes: string; purpose: string }[]
  }

  it('makes the site installable: a name, a start page, standalone, and the icons on disk', () => {
    expect(manifest.name).toBe('TKU Arcade')
    expect(manifest.start_url.startsWith('/')).toBe(true)
    expect(manifest.display).toBe('standalone')
    const icons = manifest.icons.map((icon) => [icon.src, icon.sizes, icon.purpose])
    expect(icons).toEqual([
      ['/icon-192.png', '192x192', 'any'],
      ['/icon-512.png', '512x512', 'any'],
      ['/icon-maskable-512.png', '512x512', 'maskable'],
    ])
  })

  it('uses the night background token, as do index.html and the offline page', () => {
    for (const colour of [manifest.background_color, manifest.theme_color]) {
      expect(tokenValues).toContain(colour.toUpperCase())
    }
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(indexHtml).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`)
    const colours = [...offlineHtml.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toUpperCase())
    for (const colour of colours) expect(tokenValues, colour).toContain(colour)
  })

  it('has a service worker that caches only the offline page, never the app', () => {
    expect(serviceWorker).toContain("'/offline.html'")
    expect(serviceWorker).toContain("request.mode === 'navigate'")
    expect(serviceWorker).not.toMatch(/cache\.put|\/assets\//)
  })
})
