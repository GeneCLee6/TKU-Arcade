import { describe, expect, it } from 'vitest'
import { GAME_INFOS, getGameInfo, LOBBY_GAMES } from '../../shared/games/catalog.ts'
import { GAME_IDS, getGame } from '../../shared/games/index.ts'
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
function reachableFromSite(): Set<string> {
  const all = { ...SOURCES, ...SHARED }
  const seen = new Set<string>()
  const queue = Object.keys(SOURCES)
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
  })

  it.each(GAME_IDS)('%s: the module carries the very info the browser sees', (id) => {
    const info = getGameInfo(id)
    const module = getGame(id)
    expect(module?.meta).toBe(info?.meta)
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
  })

  it('keeps unlisted games out of the lobby', () => {
    expect(LOBBY_GAMES.length).toBeGreaterThan(0)
    expect(LOBBY_GAMES.every((game) => !game.meta.unlisted)).toBe(true)
  })
})

// A rules file imported from src/ lands in the browser's download, and the budget only says so once
// it no longer fits. The rules run on the server: a screen shows `view` and needs them for nothing
/**
 * What only the Worker may load: the registry, every rules file, the topic bank, and promotion's full
 * edition (its board and rules, C6): the browser gets none of it until C7 decides how (NEXT.md)
 */
const WORKER_ONLY =
  /(^|\/)shared\/games\/index\.ts$|shared\/games\/[^/]+\/(rules|rulesFull|boardFull|topics)\.ts$/

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
    const bad = staticImports(SOURCES[path]).filter((from) => WORKER_ONLY.test(from))
    expect(bad).toEqual([])
  })

  // Followed all the way down: a rules file or the topic bank one import away still lands in the download
  it('reaches no rules and no topic bank through any chain of imports', () => {
    const reached = [...reachableFromSite()]
    expect(reached).toContain('/shared/games/catalog.ts')
    expect(reached).toContain('/shared/games/spectrum/info.ts')
    expect(reached.filter((path) => WORKER_ONLY.test(path))).toEqual([])
  })

  it('catalog.ts and every info.ts import no rules', () => {
    expect(Object.keys(INFO_FILES)).toHaveLength(GAME_IDS.length + 1)
    for (const source of Object.values(INFO_FILES)) {
      const bad = staticImports(source).filter((from) =>
        /rules\.ts$|rulesFull\.ts$|boardFull\.ts$|index\.ts$|topics\.ts$/.test(from),
      )
      expect(bad).toEqual([])
    }
  })
})
