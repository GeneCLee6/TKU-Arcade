// A real SQLite (node:sqlite) behind as much of D1's binding as the flags and the cost alerts use,
// with the repository's migrations applied: the SQL under test is the SQL that is deployed.

type SqliteStatement = {
  all(...params: unknown[]): Record<string, unknown>[]
  run(...params: unknown[]): { changes: number | bigint }
}
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): SqliteStatement }

type NodeProcess = {
  getBuiltinModule(id: 'node:sqlite'): { DatabaseSync: new (path: string) => SqliteDatabase }
  getBuiltinModule(id: 'node:fs'): {
    readdirSync(path: string): string[]
    readFileSync(path: string, encoding: 'utf8'): string
  }
}

// Not imports: tests/worker is typed for Workers, which have no node:sqlite or node:fs
const nodeProcess = (globalThis as unknown as { process: NodeProcess }).process

export function migratedD1(): { db: D1Database; sqlite: SqliteDatabase } {
  const { DatabaseSync } = nodeProcess.getBuiltinModule('node:sqlite')
  const fs = nodeProcess.getBuiltinModule('node:fs')
  const sqlite = new DatabaseSync(':memory:')
  for (const file of fs.readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(`migrations/${file}`, 'utf8'))
  }
  const statement = (sql: string, params: unknown[]) => ({
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
  })
  const db = {
    prepare: (sql: string) => ({
      ...statement(sql, []),
      bind: (...params: unknown[]) => statement(sql, params),
    }),
  } as unknown as D1Database
  return { db, sqlite }
}
