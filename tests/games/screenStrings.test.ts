// @vitest-environment node
// A game screen's words come one language at a time (src/games/screenStrings.ts, 2026-11-22): each
// game's i18n.screen.ts is the pair of i18n.screen.en.ts and .zh-TW.ts, and nothing the browser loads
// imports the pair, which would bring both languages back into the screen's first load
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Promotion's simple board is small and its font wants every Chinese glyph (boardFont.ts); the kart's
// room screen registers its own (src/games/kart/messages.ts)
const BOTH_LANGUAGES = new Set(['promotion', 'kart'])

const games = readdirSync('shared/games', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`shared/games/${entry.name}/i18n.screen.ts`))
  .map((entry) => entry.name)

const sources = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .map((path) => `src/${path.replaceAll('\\', '/')}`)
  .filter((path) => /\.tsx?$/.test(path))

describe('game screen strings', () => {
  it.each(games.filter((game) => !BOTH_LANGUAGES.has(game)))('%s comes one language at a time', async (game) => {
    const base = `../../shared/games/${game}/i18n.screen`
    const [pair, en, zhTW] = await Promise.all([
      import(`${base}.ts`),
      import(`${base}.en.ts`),
      import(`${base}.zh-TW.ts`),
    ])
    const both = Object.values(pair)[0] as Record<string, Record<string, string>>
    expect(both.en).toBe(en.messages)
    expect(both['zh-TW']).toBe(zhTW.messages)
    expect(Object.keys(zhTW.messages).sort()).toEqual(Object.keys(en.messages).sort())
  })

  it('are never imported in both languages by the site', () => {
    const offenders = sources.filter((file) => {
      const game = /shared\/games\/([^/]+)\/i18n\.screen\.ts'/.exec(readFileSync(file, 'utf8'))?.[1]
      return game !== undefined && !BOTH_LANGUAGES.has(game)
    })
    expect(offenders).toEqual([])
  })
})
