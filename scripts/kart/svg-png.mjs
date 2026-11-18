// Design aid: an SVG file to a PNG, by the Playwright browser.
// Run: node scripts/kart/svg-png.mjs in.svg out.png
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const [input, output] = process.argv.slice(2)
const svg = readFileSync(input, 'utf8')
const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1200)
const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 900)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height } })
await page.setContent(`<body style="margin:0">${svg}</body>`)
await page.screenshot({ path: output })
await browser.close()
