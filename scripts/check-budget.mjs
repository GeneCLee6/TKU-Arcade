// JS budgets (docs/PRD/e12-platform-security-cost-ops.md): the main site and each board game's first
// screen ≤ 150 kB gzip; the kart, three.js included, ≤ 600 kB gzip counted separately.
//
// A page's JS is what it loads before it can render: the entry chunk and its static imports, plus
// for a board game the lazy room page (once it exists) and the game's lazy chunk with their static
// imports. Reads Vite's manifest, so run it after `npm run build`; paths are relative to the
// current directory. `npm run budget -- --chunks` also lists each line's chunks with their size.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const CLIENT_DIR = 'dist/client'
const MANIFEST = join(CLIENT_DIR, '.vite/manifest.json')
const KB = 1000
const MAIN_LIMIT = 150 * KB
const KART_LIMIT = 600 * KB
const ROOM_PAGE = 'src/pages/RoomPage.tsx'

if (!existsSync(MANIFEST)) {
  console.error(`No ${MANIFEST}: run \`npm run build\` first`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

// Adds a manifest key and its static imports; dynamic imports load later, so they do not count
function collect(key, seen) {
  if (seen.has(key)) return
  const chunk = manifest[key]
  if (!chunk) throw new Error(`Manifest has no chunk for ${key}`)
  seen.add(key)
  for (const imported of chunk.imports ?? []) collect(imported, seen)
}

const collectAll = (keys) => {
  const seen = new Set()
  for (const key of keys) collect(key, seen)
  return seen
}

const SHOW_CHUNKS = process.argv.includes('--chunks')

const chunkSizes = (keys) =>
  [...keys]
    .map((key) => manifest[key].file)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, size: gzipSync(readFileSync(join(CLIENT_DIR, file))).length }))

const gzipSize = (keys) => chunkSizes(keys).reduce((sum, { size }) => sum + size, 0)

const lazyEntriesUnder = (prefix) =>
  Object.keys(manifest).filter((key) => key.startsWith(prefix) && manifest[key].isDynamicEntry)

const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry)
if (entries.length === 0) {
  console.error(`${MANIFEST} has no entry chunk`)
  process.exit(1)
}

const mainKeys = collectAll(entries)
const room = manifest[ROOM_PAGE] ? [ROOM_PAGE] : []

const budgets = [
  { name: 'main site', keys: mainKeys, limit: MAIN_LIMIT },
  ...lazyEntriesUnder('src/games/').map((game) => ({
    name: `first screen of ${game}`,
    keys: collectAll([...entries, ...room, game]),
    limit: MAIN_LIMIT,
  })),
]

// Chunks the main site already loads are its budget's concern, not the kart's
const kartEntries = lazyEntriesUnder('src/kart/')
if (kartEntries.length > 0) {
  const keys = collectAll(kartEntries)
  for (const key of mainKeys) keys.delete(key)
  budgets.push({ name: 'kart', keys, limit: KART_LIMIT })
} else {
  console.log('skip kart: no lazy chunk under src/kart/ yet')
}

let failed = false
for (const { name, keys, limit } of budgets) {
  const size = gzipSize(keys)
  const ok = size <= limit
  if (!ok) failed = true
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}: ${(size / KB).toFixed(1)} kB / ${limit / KB} kB gzip`,
  )
  if (SHOW_CHUNKS) {
    for (const chunk of chunkSizes(keys)) console.log(`       ${chunk.size} B  ${chunk.file}`)
  }
}
process.exit(failed ? 1 : 0)
