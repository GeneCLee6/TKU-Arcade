import type { Env } from './app.ts'

/** Rows read at a time */
const PAGE_ROWS = 500
/** Backups older than this are deleted, once today's is safely stored */
const KEEP_MS = 30 * 24 * 60 * 60_000
const KEY_PREFIX = 'd1/'

const quoteName = (name: string) => `"${name.replace(/"/g, '""')}"`

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'string') {
    // A NUL inside a string literal would end it for SQLite
    return `'${value.replace(/'/g, "''").replace(/\0/g, "'||char(0)||'")}'`
  }
  // D1 gives a BLOB as an array of bytes
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : Array.isArray(value)
          ? (value as number[])
          : null
  if (!bytes) throw new Error(`Cannot back up a value of type ${typeof value}`)
  return `X'${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}'`
}

type SchemaRow = { type: string; name: string; sql: string }

export type Dump = { sql: string; tables: number; rows: number }

/**
 * The whole database as SQL that rebuilds it in an empty one (`wrangler d1 execute --file`, which
 * refuses BEGIN and COMMIT, hence none here). `d1_migrations` comes along, so a restored database
 * knows which migrations it has. Read a page at a time, not as a snapshot: a write during the dump
 * may or may not be in it. Time Travel (DEPLOY.md §10) is the exact one, for its shorter window.
 */
export async function dumpDatabase(db: D1Database): Promise<Dump> {
  const { results: schema } = await db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL
         AND substr(name, 1, 7) <> 'sqlite_'
         AND substr(name, 1, 4) <> '_cf_'
       ORDER BY rowid`,
    )
    .all<SchemaRow>()
  const tables = schema.filter((entry) => entry.type === 'table')
  // Foreign keys are checked at the end, since tables come in the order they were created
  const lines = ['PRAGMA defer_foreign_keys = ON;']
  for (const table of tables) lines.push(`${table.sql};`)
  let rows = 0
  for (const table of tables) {
    const name = quoteName(table.name)
    for (let offset = 0; ; offset += PAGE_ROWS) {
      const { results } = await db
        .prepare(`SELECT * FROM ${name} LIMIT ? OFFSET ?`)
        .bind(PAGE_ROWS, offset)
        .all<Record<string, unknown>>()
      for (const row of results) {
        const columns = Object.keys(row).map(quoteName).join(', ')
        const values = Object.values(row).map(sqlValue).join(', ')
        lines.push(`INSERT INTO ${name} (${columns}) VALUES (${values});`)
      }
      rows += results.length
      if (results.length < PAGE_ROWS) break
    }
  }
  // After the rows: indexes are quicker to build then, and no trigger fires for the restore itself
  for (const entry of schema) if (entry.type !== 'table') lines.push(`${entry.sql};`)
  return { sql: `${lines.join('\n')}\n`, tables: tables.length, rows }
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const plain = new Response(text).body as ReadableStream<Uint8Array>
  return new Response(plain.pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
}

async function pruneBackups(bucket: R2Bucket, now: number): Promise<number> {
  let dropped = 0
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: KEY_PREFIX, cursor })
    const old = page.objects.filter((object) => now - object.uploaded.getTime() > KEEP_MS)
    if (old.length > 0) await bucket.delete(old.map((object) => object.key))
    dropped += old.length
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return dropped
}

/**
 * The daily cron (e12-t05): the database goes to the BACKUPS bucket as gzipped SQL. Only production
 * has that bucket; anywhere else this does nothing. A failure throws, so the run shows as failed.
 */
export async function runBackup(env: Env, now: number = Date.now()): Promise<string | null> {
  if (!env.BACKUPS) {
    console.log(JSON.stringify({ event: 'backup_skipped', reason: 'no BACKUPS bucket' }))
    return null
  }
  const dump = await dumpDatabase(env.DB)
  const body = await gzip(dump.sql)
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-')
  const key = `${KEY_PREFIX}${stamp.slice(0, 10)}/tku-arcade-${stamp}.sql.gz`
  await env.BACKUPS.put(key, body, {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: { tables: String(dump.tables), rows: String(dump.rows) },
  })
  const dropped = await pruneBackups(env.BACKUPS, now)
  console.log(
    JSON.stringify({
      event: 'backup_done',
      key,
      tables: dump.tables,
      rows: dump.rows,
      bytes: body.byteLength,
      dropped,
    }),
  )
  return key
}
