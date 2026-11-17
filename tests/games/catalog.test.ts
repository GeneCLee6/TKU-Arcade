import { describe, expect, it } from 'vitest'
import { GAME_INFOS, GAME_MESSAGES, getGameInfo, LOBBY_GAMES } from '../../shared/games/catalog.ts'
import { GAME_IDS, getGame } from '../../shared/games/index.ts'
import { GAME_CARDS, getGameCard } from '../../shared/games/lobby.ts'
import { lobbyEn } from '../../shared/games/lobby.en.ts'
import { lobbyZhTW } from '../../shared/games/lobby.zh-TW.ts'
import type { AnyOptionField } from '../../shared/games/types.ts'

const raw = (files: Record<string, unknown>) => files as Record<string, string>

const SOURCES = raw(
  import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
)
const SHARED = raw(
  import.meta.glob('/shared/**/*.ts', { query: '?raw', import: 'default', eager: true }),
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

/** Static imports and re-exports, as paths from the repo root (`/shared/...`); packages left out */
function localImports(path: string, source: string): string[] {
  const found = [
    ...source.matchAll(
      /^import (?!type )[^;]*?from '([^']+)'|^export (?:\*|\{[^}]*\}) from '([^']+)'|^import '([^']+)'/gm,
    ),
  ].map((match) => match[1] ?? match[2] ?? match[3])
  const folder = path.slice(0, path.lastIndexOf('/'))
  return found
    .filter((from) => from.startsWith('.'))
    .map((from) => {
      const parts = `${folder}/${from}`.split('/')
      const out: string[] = []
      for (const part of parts) {
        if (part === '..') out.pop()
        else if (part !== '.') out.push(part)
      }
      return out.join('/')
    })
}

/** Every file the browser's code pulls in at load time, following imports through shared/ too */
function reachableFromSite(
  skip = (_path: string) => false,
  from = Object.keys(SOURCES),
): Set<string> {
  const all = { ...SOURCES, ...SHARED }
  const seen = new Set<string>()
  const queue = from.filter((path) => !skip(path))
  while (queue.length > 0) {
    const path = queue.pop() as string
    if (seen.has(path) || all[path] === undefined) continue
    seen.add(path)
    queue.push(...localImports(path, all[path]))
  }
  return seen
}

describe('the catalog against the registry', () => {
  it('lists the same games, in the same order', () => {
    expect(GAME_INFOS.map((game) => game.id)).toEqual(GAME_IDS)
    expect(GAME_CARDS.map((game) => game.id)).toEqual(GAME_IDS)
  })

  it.each(GAME_IDS)('%s: the module carries the very info the browser sees', (id) => {
    const info = getGameInfo(id)
    const module = getGame(id)
    expect(module?.meta).toBe(getGameCard(id)?.meta)
    // Field by field: a module may add hidden fields (types.ts), and only those
    const fields = Object.entries((module?.options ?? {}) as Record<string, AnyOptionField>)
    const shown = (info?.options ?? {}) as Record<string, unknown>
    for (const [key, field] of fields) {
      if (field.hidden) expect(shown, key).not.toHaveProperty(key)
      else expect(shown[key], key).toBe(field)
    }
    expect(Object.keys(shown)).toEqual(
      fields.filter(([, field]) => !field.hidden).map(([key]) => key),
    )
  })

  it('answers null for an id it does not know', () => {
    expect(getGameInfo('no-such-game')).toBeNull()
    expect(getGameCard('no-such-game')).toBeNull()
  })

  // A lobby card shows these before anything else loads (shared/games/lobby.ts)
  it.each(GAME_IDS)(
    '%s: has its name and summary in both lobby tables, and nothing else there',
    (id) => {
      const tables: Record<string, string>[] = [lobbyEn, lobbyZhTW]
      for (const table of tables) {
        expect(table[`games.${id}.name`]).toBeTruthy()
        expect(table[`games.${id}.summary`]).toBeTruthy()
      }
      const own = Object.keys(lobbyEn).filter((key) => key.startsWith(`games.${id}.`))
      expect(own.every((key) => /\.(name|summary|tryAlone)$/.test(key))).toBe(true)
      if (getGameCard(id)?.meta.tryAlone)
        expect(GAME_MESSAGES.en).toHaveProperty(`games.${id}.tryAlone`)
    },
  )

  it('keeps unlisted games out of the lobby', () => {
    expect(LOBBY_GAMES.length).toBeGreaterThan(0)
    expect(LOBBY_GAMES.every((game) => !game.meta.unlisted)).toBe(true)
  })
})

// A rules file imported from src/ lands in the browser's download, and the budget only says so once
// it no longer fits. The rules run on the server: a screen shows `view` and needs them for nothing
/**
 * What only the Worker may load: the registry, every rules file, the topic bank, and promotion's full
 * edition's rules (C6). Its board, boardFull.ts, nothing imports statically: since C8 the full
 * edition's screen loads it after its first paint, by a dynamic import in fullData.ts alone
 */
const WORKER_ONLY =
  /(^|\/)shared\/games\/index\.ts$|shared\/games\/[^/]+\/(rules|rulesFull|boardFull|topics|bank)\.ts$/
const FULL_SCREEN = /^\/src\/games\/promotion\/full\//
const FULL_BOARD = /shared\/games\/promotion\/boardFull\.ts$/
/**
 * The one exception (2026-11-17, docs/ARCHITECTURE.md §4.20): racing the computer runs the kart
 * race room's own rules in the browser, so that items are judged exactly as online. Only the bots'
 * lazy chunk (src/kart/bots/) may import them, and nothing else comes with them
 */
const BOTS = /^\/src\/kart\/bots\//
const KART_RULES = /shared\/games\/kart\/rules\.ts$/
/** What a file may not import statically */
const forbidden = (path: string, from: string) =>
  WORKER_ONLY.test(from) && !(BOTS.test(path) && KART_RULES.test(from))

describe('the browser loads no rules', () => {
  const paths = Object.keys(SOURCES)

  it('knows the full edition is Worker only', () => {
    expect(WORKER_ONLY.test('/shared/games/promotion/boardFull.ts')).toBe(true)
    expect(WORKER_ONLY.test('../../../shared/games/promotion/rulesFull.ts')).toBe(true)
    expect(WORKER_ONLY.test('/shared/games/promotion/board.ts')).toBe(false)
  })

  it('looks at the site, not at nothing', () => {
    expect(paths).toContain('/src/i18n/t.ts')
  })

  it.each(paths)('%s', (path) => {
    const bad = staticImports(SOURCES[path]).filter((from) => forbidden(path, from))
    expect(bad).toEqual([])
  })

  // Followed all the way down: a rules file or the topic bank one import away still lands in the download
  it('reaches no rules and no topic bank through any chain of imports', () => {
    const reached = [...reachableFromSite()]
    expect(reached).toContain('/shared/games/lobby.ts')
    expect(reached).toContain('/shared/games/kite/limits.ts')
    expect(reached.filter((path) => WORKER_ONLY.test(path) && !KART_RULES.test(path))).toEqual([])
    expect(reached.some((path) => FULL_SCREEN.test(path))).toBe(true)
  })

  it('lets only the bots’ chunk import the kart race room’s rules', () => {
    const importers = Object.entries(SOURCES)
      .filter(([, source]) => staticImports(source).some((from) => KART_RULES.test(from)))
      .map(([path]) => path)
    expect(importers.length).toBeGreaterThan(0)
    expect(importers.filter((path) => !BOTS.test(path))).toEqual([])
  })

  // The first load stays small as games are added (2026-11-15, docs/ARCHITECTURE.md §5): the entry
  // has the lobby's record and no language at all; every game's options and room strings, the
  // catalog with all of them, and each language's tables load as chunks of their own. Static imports
  // only: a dynamic import() or import.meta.glob is not followed, which is the point
  it('keeps every language, the catalog and each game’s room details out of the entry', () => {
    const entry = [...reachableFromSite(undefined, ['/src/main.tsx'])]
    expect(entry).toContain('/src/pages/HomePage.tsx')
    expect(entry).toContain('/shared/games/lobby.ts')
    const lazyOnly =
      /^\/shared\/games\/(catalog|lobby\.(en|zh-TW))\.ts$|^\/shared\/games\/[^/]+\/(info|i18n[^/]*)\.ts$|^\/src\/i18n\/(en|zh-TW|room\.(en|zh-TW)|messages\.(en|zh-TW))\.ts$/
    expect(entry.filter((path) => lazyOnly.test(path))).toEqual([])
  })

  it('has no static import of the full catalog anywhere in the site', () => {
    const reached = [...reachableFromSite()]
    expect(reached.filter((path) => /\/shared\/games\/(catalog|index)\.ts$/.test(path))).toEqual([])
  })

  it('loads the full board only by the full screen’s dynamic import, after its first paint', () => {
    const dynamic = Object.entries(SOURCES).filter(([, source]) =>
      /import\('[^']*shared\/games\/promotion\/boardFull\.ts'\)/.test(source),
    )
    expect(dynamic.map(([path]) => path)).toEqual(['/src/games/promotion/full/fullData.ts'])
    expect(FULL_BOARD.test('/shared/games/promotion/boardFull.ts')).toBe(true)
  })

  it('catalog.ts and every info.ts import no rules', () => {
    expect(Object.keys(INFO_FILES)).toHaveLength(GAME_IDS.length + 1)
    for (const source of Object.values(INFO_FILES)) {
      const bad = staticImports(source).filter((from) =>
        /rules\.ts$|rulesFull\.ts$|boardFull\.ts$|index\.ts$|topics\.ts$|bank\.ts$/.test(from),
      )
      expect(bad).toEqual([])
    }
  })
})
