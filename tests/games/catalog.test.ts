import { describe, expect, it } from 'vitest'
import { GAME_INFOS, getGameInfo, LOBBY_GAMES } from '../../shared/games/catalog.ts'
import { GAME_IDS, getGame } from '../../shared/games/index.ts'

const raw = (files: Record<string, unknown>) => files as Record<string, string>

const SOURCES = raw(
  import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
)
const INFO_FILES = raw(
  import.meta.glob(['/shared/games/catalog.ts', '/shared/games/*/info.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)

/** What this source imports at load time: `import type` is erased, so it costs nothing */
const staticImports = (source: string): string[] =>
  [...source.matchAll(/^import (?!type )[^;]*?from '([^']+)'/gm)].map((match) => match[1])

describe('the catalog against the registry', () => {
  it('lists the same games, in the same order', () => {
    expect(GAME_INFOS.map((game) => game.id)).toEqual(GAME_IDS)
  })

  it.each(GAME_IDS)('%s: the module carries the very info the browser sees', (id) => {
    const info = getGameInfo(id)
    const module = getGame(id)
    expect(module?.meta).toBe(info?.meta)
    expect(module?.options).toBe(info?.options)
  })

  it('answers null for an id it does not know', () => {
    expect(getGameInfo('no-such-game')).toBeNull()
  })

  it('keeps unlisted games out of the lobby', () => {
    expect(LOBBY_GAMES.length).toBeGreaterThan(0)
    expect(LOBBY_GAMES.every((game) => !game.meta.unlisted)).toBe(true)
  })
})

// A rules file imported from src/ lands in the browser's download, and the budget only says so once
// it no longer fits. The rules run on the server: a screen shows `view` and needs them for nothing
describe('the browser loads no rules', () => {
  const paths = Object.keys(SOURCES)

  it('looks at the site, not at nothing', () => {
    expect(paths).toContain('/src/i18n/t.ts')
  })

  it.each(paths)('%s', (path) => {
    const bad = staticImports(SOURCES[path]).filter((from) =>
      /shared\/games\/index\.ts$|shared\/games\/[^/]+\/rules\.ts$/.test(from),
    )
    expect(bad).toEqual([])
  })

  it('catalog.ts and every info.ts import no rules', () => {
    expect(Object.keys(INFO_FILES)).toHaveLength(GAME_IDS.length + 1)
    for (const source of Object.values(INFO_FILES)) {
      expect(staticImports(source).filter((from) => /rules\.ts$|index\.ts$/.test(from))).toEqual([])
    }
  })
})
