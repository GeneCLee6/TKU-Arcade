// The dump is run against a real SQLite (node:sqlite behind a stand-in for D1's binding), and what
// comes out is restored into an empty one, because only that shows it is a backup at all.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../../worker/app.ts'
import { dumpDatabase, runBackup } from '../../worker/backup.ts'

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[]
    run(...params: unknown[]): void
  }
}

// Not an import: tests/worker is typed for Workers, which have no node:sqlite, and Vite would not
// bundle it for the jsdom environment
function newSqlite(): SqliteDatabase {
  const { process } = globalThis as unknown as {
    process: {
      getBuiltinModule(id: string): { DatabaseSync: new (path: string) => SqliteDatabase }
    }
  }
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
  return new DatabaseSync(':memory:')
}

/** As much of D1's binding as the dump uses; a BLOB comes as an array of bytes, as D1 gives it */
function asD1(db: SqliteDatabase): D1Database {
  return {
    prepare(sql: string) {
      const run = (params: unknown[]) => ({
        results: db
          .prepare(sql)
          .all(...params)
          .map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([key, value]) => [
                key,
                value instanceof Uint8Array ? [...value] : value,
              ]),
            ),
          ),
      })
      return {
        all: async () => run([]),
        bind: (...params: unknown[]) => ({ all: async () => run(params) }),
      }
    },
  } as unknown as D1Database
}

const SCHEMA = `
  CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT);
  CREATE TABLE players (id INTEGER PRIMARY KEY, name TEXT NOT NULL, score REAL, avatar BLOB);
  CREATE TABLE "odd ""name" (k TEXT PRIMARY KEY, player INTEGER REFERENCES players(id)) WITHOUT ROWID;
  CREATE INDEX players_name ON players(name);
  CREATE VIEW top_players AS SELECT name FROM players WHERE score > 1;
  CREATE TRIGGER no_empty BEFORE INSERT ON players WHEN new.name = '' BEGIN SELECT RAISE(ABORT, 'empty'); END;
`

function filled() {
  const db = newSqlite()
  db.exec(SCHEMA)
  db.prepare(`INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)`).run('0001.sql', 'then')
  const insert = db.prepare(`INSERT INTO players (id, name, score, avatar) VALUES (?, ?, ?, ?)`)
  insert.run(1, `O'Brien; DROP TABLE players; --`, 1.5, new Uint8Array([0, 1, 254, 255]))
  insert.run(2, '繁體 "中文" 😀\nline', null, null)
  insert.run(3, 'nul\0inside', -2, null)
  db.prepare(`INSERT INTO "odd ""name" (k, player) VALUES (?, ?)`).run('a', 1)
  return db
}

const everything = (db: SqliteDatabase) => ({
  migrations: db.prepare(`SELECT * FROM d1_migrations`).all(),
  players: db
    .prepare(`SELECT id, name, score, hex(avatar) AS avatar FROM players ORDER BY id`)
    .all(),
  odd: db.prepare(`SELECT * FROM "odd ""name"`).all(),
  schema: db
    .prepare(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name`)
    .all(),
})

function fakeBucket() {
  const objects = new Map<string, { body: ArrayBuffer; uploaded: Date; meta: unknown }>()
  return {
    objects,
    bucket: {
      put: vi.fn(async (key: string, body: ArrayBuffer, meta: unknown) => {
        objects.set(key, { body, uploaded: new Date(NOW), meta })
      }),
      list: async ({ cursor }: { cursor?: string }) => {
        // One object a page, so that paging has to work
        const keys = [...objects.keys()].sort()
        const at = cursor ? Number(cursor) : 0
        const key = keys[at]
        return {
          objects: key ? [{ key, uploaded: objects.get(key)?.uploaded }] : [],
          truncated: at + 1 < keys.length,
          cursor: String(at + 1),
        }
      },
      delete: vi.fn(async (keys: string[]) => {
        for (const key of keys) objects.delete(key)
      }),
    },
  }
}

const NOW = Date.UTC(2026, 10, 6, 19, 0, 0)
const DAY = 24 * 60 * 60_000

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dumpDatabase', () => {
  it('gives SQL that rebuilds the database in an empty one', async () => {
    const source = filled()
    const dump = await dumpDatabase(asD1(source))
    expect(dump.tables).toBe(3)
    expect(dump.rows).toBe(5)
    const restored = newSqlite()
    restored.exec(dump.sql)
    expect(everything(restored)).toEqual(everything(source))
    // The trigger came back too, and did not get in the way of its own restore
    expect(() => restored.exec(`INSERT INTO players (id, name) VALUES (9, '')`)).toThrow('empty')
  })

  it('reads a large table page by page, and leaves out SQLite and Cloudflare’s own', async () => {
    const source = newSqlite()
    source.exec(
      `CREATE TABLE lots (n INTEGER); CREATE TABLE _cf_KV (key TEXT); CREATE TABLE a (b);`,
    )
    const insert = source.prepare(`INSERT INTO lots VALUES (?)`)
    for (let n = 0; n < 1203; n++) insert.run(n)
    const dump = await dumpDatabase(asD1(source))
    expect(dump.rows).toBe(1203)
    expect(dump.sql).not.toContain('_cf_KV')
    const restored = newSqlite()
    restored.exec(dump.sql)
    expect(restored.prepare(`SELECT count(*) AS c, sum(n) AS s FROM lots`).all()).toEqual([
      { c: 1203, s: (1202 * 1203) / 2 },
    ])
  })

  it('has no BEGIN or COMMIT, which wrangler d1 execute --file refuses', async () => {
    const { sql } = await dumpDatabase(asD1(filled()))
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\b/im)
  })
})

describe('runBackup', () => {
  const quietly = () => vi.spyOn(console, 'log').mockImplementation(() => {})

  it('does nothing where there is no bucket: previews', async () => {
    quietly()
    const prepare = vi.fn()
    const env = { DB: { prepare } } as unknown as Env
    expect(await runBackup(env, NOW)).toBeNull()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('stores gzipped SQL under the date, and it restores', async () => {
    quietly()
    const source = filled()
    const { bucket, objects } = fakeBucket()
    const env = { DB: asD1(source), BACKUPS: bucket } as unknown as Env
    const key = await runBackup(env, NOW)
    expect(key).toBe('d1/2026-11-06/tku-arcade-2026-11-06T19-00-00-000Z.sql.gz')
    const stored = objects.get(key as string)
    expect(stored?.meta).toMatchObject({ customMetadata: { tables: '3', rows: '5' } })
    const zipped = new Response(stored?.body as ArrayBuffer).body as ReadableStream<Uint8Array>
    const sql = await new Response(zipped.pipeThrough(new DecompressionStream('gzip'))).text()
    const restored = newSqlite()
    restored.exec(sql)
    expect(everything(restored)).toEqual(everything(source))
  })

  it('deletes only backups past 30 days, in its own folder, after storing the new one', async () => {
    quietly()
    const { bucket, objects } = fakeBucket()
    const old = { body: new ArrayBuffer(0), meta: null }
    objects.set('d1/old', { ...old, uploaded: new Date(NOW - 31 * DAY) })
    objects.set('d1/recent', { ...old, uploaded: new Date(NOW - 29 * DAY) })
    const env = { DB: asD1(filled()), BACKUPS: bucket } as unknown as Env
    await runBackup(env, NOW)
    expect(objects.has('d1/old')).toBe(false)
    expect(objects.has('d1/recent')).toBe(true)
    expect(objects.size).toBe(2)
  })

  it('fails loudly, and deletes nothing, when the new one cannot be stored', async () => {
    quietly()
    const { bucket, objects } = fakeBucket()
    objects.set('d1/old', {
      body: new ArrayBuffer(0),
      meta: null,
      uploaded: new Date(NOW - 31 * DAY),
    })
    bucket.put.mockRejectedValueOnce(new Error('R2 is down'))
    const env = { DB: asD1(filled()), BACKUPS: bucket } as unknown as Env
    await expect(runBackup(env, NOW)).rejects.toThrow('R2 is down')
    expect(objects.has('d1/old')).toBe(true)
  })
})
