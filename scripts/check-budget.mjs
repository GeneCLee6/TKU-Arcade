// JS budgets (docs/PRD/e12-platform-security-cost-ops.md): the main site and each board game's first
// screen ≤ 150 kB gzip; the kart, three.js included, ≤ 600 kB gzip counted separately.
//
// A page's JS is what it loads before it can render: the entry chunk and its static imports, the
// page's language (src/i18n/messages.<language>.ts, counted in the heavier of the two), plus for a
// board game the lazy room page, the game's room details (shared/games/<id>/info.ts and i18n.ts) and
// the game's lazy chunk with their static imports; what a screen loads after it has painted is listed
// after it, not counted (C8); the kart's pages and race engine are reported, not limited (2026-11-21).
// Reads Vite's manifest, so run it after `npm run build`; paths are
// relative to the current directory. `npm run budget -- --chunks` also lists each line's chunks.
//
// The guards that keep the room for new games (2026-11-15): the lobby (entry and language) has its
// own, lower limit, so that it cannot regrow unnoticed, and a line within WARN_MARGIN of its limit
// prints a warning.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const CLIENT_DIR = 'dist/client'
const MANIFEST = join(CLIENT_DIR, '.vite/manifest.json')
const KB = 1000
const MAIN_LIMIT = 150 * KB
// The lobby was 109.3 kB with both languages in it, 100 kB with one (2026-11-15). A new game should
// cost it one meta line and a name; anything bigger belongs in the game's own chunks
const LOBBY_LIMIT = 103 * KB
const WARN_MARGIN = 10 * KB
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
const LANGUAGES = ['en', 'zh-TW']
const languageFile = (prefix, language) => `${prefix}.${language}.ts`
const SITE_LANGUAGE = 'src/i18n/messages'
if (!manifest[languageFile(SITE_LANGUAGE, 'en')]) console.log('skip languages: no src/i18n/messages.*.ts chunk')

// A screen whose strings load in the page's language alongside it (src/i18n/t.ts,
// registerLanguageParts), by the prefix of their two files. Every such file must be listed here, so
// that no line leaves out what its screen waits for
const SCREEN_LANGUAGE_PARTS = {
  'src/games/promotion/full/FullScreen.tsx': ['shared/games/promotion/i18n.full'],
}
// And every game screen whose own words come one language at a time (src/games/screenStrings.ts,
// 2026-11-22): src/games/<id>/<Name>Screen.tsx waits for shared/games/<id>/i18n.screen.<language>.ts
for (const key of Object.keys(manifest)) {
  const id = /^src\/games\/([^/]+)\/\w+Screen\.tsx$/.exec(key)?.[1]
  const part = `shared/games/${id}/i18n.screen`
  if (id && manifest[`${part}.en.ts`] && !SCREEN_LANGUAGE_PARTS[key]) SCREEN_LANGUAGE_PARTS[key] = [part]
}
// The room's own words (src/i18n/roomStrings.ts): every room waits for them, the lobby never loads them
const ROOM_LANGUAGE = 'src/i18n/room'
const listedParts = new Set([ROOM_LANGUAGE, ...Object.values(SCREEN_LANGUAGE_PARTS).flat()])
for (const key of Object.keys(manifest)) {
  const part = /^(.*)\.(en|zh-TW)\.ts$/.exec(key)?.[1]
  if (manifest[key].isDynamicEntry && part && part !== SITE_LANGUAGE && !listedParts.has(part)) {
    console.error(`FAIL ${key}: a language part check-budget.mjs does not count (SCREEN_LANGUAGE_PARTS)`)
    process.exitCode = 1
  }
}

// What a room of this game loads before it shows (src/i18n/gameDetails.ts)
const gameId = (game) => /^src\/games\/([^/]+)\//.exec(game)?.[1]
const detailsOf = (game) =>
  ['info.ts', 'i18n.ts']
    .map((file) => `shared/games/${gameId(game)}/${file}`)
    .filter((key) => manifest[key])

// A lazy chunk a game's screen loads after its first paint (the full board's layout, C9) is that
// screen's, not a game of its own
const gameChunks = lazyEntriesUnder('src/games/')
const loadedByGame = new Set(gameChunks.flatMap((key) => manifest[key].dynamicImports ?? []))
const games = gameChunks.filter((key) => !loadedByGame.has(key))

const budgets = [
  { name: 'main site', keys: mainKeys, limit: LOBBY_LIMIT, lobby: true },
  ...games.map((game) => ({
    name: `first screen of ${game}`,
    keys: collectAll([...entries, ...room, ...detailsOf(game), game]),
    limit: MAIN_LIMIT,
    game,
  })),
]

// Chunks the main site already loads are its budget's concern, not the kart's
const kartEntries = lazyEntriesUnder('src/kart/')
if (kartEntries.length > 0) {
  const keys = collectAll(kartEntries)
  for (const key of mainKeys) keys.delete(key)
  budgets.push({ name: 'kart', keys, limit: KART_LIMIT, ownLanguage: false })
} else {
  console.log('skip kart: no lazy chunk under src/kart/ yet')
}

/**
 * What a game's screen loads after its first paint (promotion's full board, C8, and its layout, C9):
 * its dynamic imports, with their static imports, less what the first screen already has. Reported,
 * not limited: the first screen is what the budget is for
 */
function afterPaint(game, firstKeys) {
  const later = manifest[game]?.dynamicImports ?? []
  const keys = collectAll(later)
  for (const key of firstKeys) keys.delete(key)
  return keys
}

/** A line's keys with the heavier language's chunks added (the site's, the screen's), and which */
function withLanguage(keys, game) {
  const prefixes = [SITE_LANGUAGE, ...(game ? [ROOM_LANGUAGE] : []), ...(SCREEN_LANGUAGE_PARTS[game] ?? [])]
  let heaviest = { keys, language: null, size: gzipSize(keys) }
  for (const language of LANGUAGES) {
    const files = prefixes.map((prefix) => languageFile(prefix, language)).filter((key) => manifest[key])
    if (files.length === 0) continue
    const withIt = new Set([...keys, ...collectAll(files)])
    const size = gzipSize(withIt)
    if (size > heaviest.size) heaviest = { keys: withIt, language, size }
  }
  return heaviest
}

// 2026-11-21 (docs/KART-PERF.md §7): what a kart page loads before it can show anything (its loading
// screen and menu), and what its race then fetches: the engine, and each track's own scenery on top.
// Reported, not limited: all of it is inside the kart's line
const KART_PAGE = 'src/kart/bots/KartPlay.tsx'
const KART_ENGINE = 'src/kart/spikeLoop.ts'
const kartReport = []
if (manifest[KART_PAGE]) {
  kartReport.push({ name: 'first screen of /kart', keys: withLanguage(collectAll([...entries, KART_PAGE])).keys })
}
if (manifest[KART_ENGINE]?.isDynamicEntry) {
  const engine = collectAll([KART_ENGINE])
  for (const key of mainKeys) engine.delete(key)
  kartReport.push({ name: `a race's engine (${KART_ENGINE})`, keys: engine })
  for (const scenery of lazyEntriesUnder('src/kart/art/').filter((key) => /Art\.ts$/.test(key))) {
    const keys = collectAll([scenery])
    for (const key of collectAll([KART_ENGINE])) keys.delete(key)
    kartReport.push({ name: `  + ${scenery}`, keys })
  }
}

let failed = false
for (const { name, keys } of kartReport) {
  console.log(`info ${name}: ${(gzipSize(keys) / KB).toFixed(1)} kB gzip (not limited)`)
  if (SHOW_CHUNKS) {
    for (const chunk of chunkSizes(keys)) console.log(`       ${chunk.size} B  ${chunk.file}`)
  }
}
for (const budget of budgets) {
  const { name, limit, game } = budget
  const { keys, language, size } =
    budget.ownLanguage === false
      ? { keys: budget.keys, language: null, size: gzipSize(budget.keys) }
      : withLanguage(budget.keys, game)
  const ok = size <= limit
  if (!ok) failed = true
  const mark = !ok ? 'FAIL' : size > limit - WARN_MARGIN && !budget.lobby ? 'warn' : 'ok  '
  const lang = language ? ` (${language})` : ''
  console.log(`${mark} ${name}${lang}: ${(size / KB).toFixed(1)} kB / ${limit / KB} kB gzip`)
  if (SHOW_CHUNKS) {
    for (const chunk of chunkSizes(keys)) console.log(`       ${chunk.size} B  ${chunk.file}`)
  }
  const later = game ? afterPaint(game, keys) : new Set()
  if (later.size > 0) {
    console.log(`       + after the first paint: ${(gzipSize(later) / KB).toFixed(1)} kB gzip (not limited)`)
    if (SHOW_CHUNKS) {
      for (const chunk of chunkSizes(later)) console.log(`         ${chunk.size} B  ${chunk.file}`)
    }
  }
}
process.exit(failed || process.exitCode ? 1 : 0)
