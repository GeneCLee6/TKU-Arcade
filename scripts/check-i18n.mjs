// Translations gate (AC-7.3, docs/DESIGN.md §5): the catalogs match across languages, and src/ has no
// bare strings. Paths are relative to the current directory. Needs --experimental-strip-types: the
// catalogs are imported from their .ts files, so this checks what t() really gets.
//
// The bare-string check reads each src/ file's syntax tree (#6 of docs/NEXT.md §5, 2026-11-22): JSX
// text, a string in a JSX child (`{'Hello'}`, `{ok ? 'Yes' : 'No'}`), a visible attribute however it
// is written (`aria-label`, `title`, `placeholder`...), a string passed to alert(), toast() or a
// canvas's fillText(), one assigned to document.title. Not looked at: className, test ids and other
// attributes, a string without a word in it (symbols, numbers, a lone letter), an address.
//
// A line containing `// i18n-ignore` is skipped by the bare-string checks, and so is the line after
// one containing `// i18n-ignore-next-line`. Inside JSX children, where `//` would render, write
// `{/* // i18n-ignore */}`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSync } from 'vite'

const SITE_EN = 'src/i18n/en.ts'
const SITE_ZH = 'src/i18n/zh-TW.ts'
// The room's own strings, a chunk of their own in each language (src/i18n/roomStrings.ts)
const ROOM_EN = 'src/i18n/room.en.ts'
const ROOM_ZH = 'src/i18n/room.zh-TW.ts'
// What a lobby card says of every game, one language per chunk (shared/games/lobby.ts)
const LOBBY_EN = 'shared/games/lobby.en.ts'
const LOBBY_ZH = 'shared/games/lobby.zh-TW.ts'
const LOBBY_KEY = /^games\.[a-z-]+\.(name|summary|tryAlone)$/
const GAMES = 'shared/games/index.ts'
const GAME_SCREENS = 'shared/games/screenMessages.ts'
const KART = 'shared/kart/i18n.ts' // Registered by the kart's lazy chunk, so not in the site's catalogs
// The kart's screens that register their own strings, not merged into KART_MESSAGES (2026-11-22):
// [file, export]. Every shared/kart/i18n.*.ts must be merged into i18n.ts or listed here
const KART_PARTS = [
  ['shared/kart/i18n.school.ts', 'KART_SCHOOL_MESSAGES'],
  ['shared/kart/i18n.challenge.ts', 'KART_CHALLENGE_MESSAGES'],
  ['shared/kart/i18n.board.ts', 'KART_BOARD_MESSAGES'],
  ['shared/kart/i18n.editor.ts', 'KART_EDITOR_MESSAGES'],
]
const SOURCE_ROOT = 'src'

const USER_VISIBLE_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label'])
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u
const IGNORE = /\/\/\s*i18n-ignore(?!-)/
const IGNORE_NEXT = /\/\/\s*i18n-ignore-next-line/
const PLACEHOLDER = /\{(\w+)\}/g // Same shape as format() in src/i18n/t.ts

const problems = []

async function load(file, exportName) {
  try {
    const catalog = (await import(pathToFileURL(resolve(file)).href))[exportName]
    if (catalog) return catalog
    problems.push(`${file}: no export named ${exportName}`)
  } catch (error) {
    problems.push(`${file}: cannot load: ${error.message}`)
  }
  return {}
}

const placeholders = (message) =>
  [...new Set([...message.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort().join(', ')

const isEmpty = (message) => typeof message !== 'string' || message.trim() === ''

function checkParity(en, enLabel, zh, zhLabel) {
  for (const key of Object.keys(en)) {
    if (!(key in zh)) problems.push(`${zhLabel}: missing key '${key}'`)
  }
  for (const key of Object.keys(zh)) {
    if (!(key in en)) problems.push(`${zhLabel}: extra key '${key}'`)
  }
  for (const [catalog, label] of [[en, enLabel], [zh, zhLabel]]) {
    for (const [key, message] of Object.entries(catalog)) {
      if (isEmpty(message)) problems.push(`${label}: empty value for '${key}'`)
    }
  }
  for (const key of Object.keys(en)) {
    if (isEmpty(en[key]) || isEmpty(zh[key])) continue
    const [inEn, inZh] = [placeholders(en[key]), placeholders(zh[key])]
    if (inEn !== inZh) {
      problems.push(`${zhLabel}: placeholders differ for '${key}': en {${inEn}}, zh-TW {${inZh}}`)
    }
  }
}

// HTML entities are not words; a lone letter (an icon, a grade) reads the same in both languages
const hasWords = (text) => /[A-Za-z]{2,}/.test(text.replace(/&#?\w+;/g, ' '))
// Where a string is an address rather than words (an href in a ternary, a route)
const URL_LIKE = /^(?:[a-z][a-z\d+.-]*:|\/|#|\.{1,2}\/)\S*$/i
const isWords = (text) => hasWords(text) && !URL_LIKE.test(text.trim())

// The strings an expression can evaluate to and show as written: a literal, either side of a ternary,
// the fallback of `||` and `??`, the right of `&&`, both sides of `+`, a template's own text. A call
// (t('key'), a formatter) is never one: its arguments are not what shows
function visibleStrings(node, found = []) {
  switch (node?.type) {
    case 'Literal':
      if (typeof node.value === 'string') found.push({ at: node.start, text: node.value })
      break
    case 'TemplateLiteral':
      found.push({ at: node.start, text: node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(' ') })
      break
    case 'ConditionalExpression':
      visibleStrings(node.consequent, found)
      visibleStrings(node.alternate, found)
      break
    case 'LogicalExpression':
      if (node.operator !== '&&') visibleStrings(node.left, found)
      visibleStrings(node.right, found)
      break
    case 'BinaryExpression':
      if (node.operator === '+') {
        visibleStrings(node.left, found)
        visibleStrings(node.right, found)
      }
      break
    case 'ParenthesizedExpression':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      visibleStrings(node.expression, found)
      break
    case 'ArrayExpression':
      for (const element of node.elements) visibleStrings(element, found)
      break
    case 'SequenceExpression':
      visibleStrings(node.expressions.at(-1), found)
      break
  }
  return found
}

// A JSX attribute whose value is read out or shown: the DOM's, and the props of this site's components
// that end up as text. Any other (className, data-testid, href, a variant) is not looked at
const VISIBLE_ATTRIBUTES = new Set([
  ...USER_VISIBLE_ATTRIBUTES,
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'caption',
  'description',
  'heading',
  'hint',
  'message',
  'subtitle',
  'summary',
  'text',
  'tooltip',
])
// Calls that put their arguments in front of the player: the browser's dialogs, a toast, a canvas that
// draws words (the kart's scenery draws its signs with fillText)
const TEXT_CALLS = new Set(['alert', 'confirm', 'prompt', 'toast', 'notify', 'fillText', 'strokeText'])
// Assigned to one of these, a string shows: document.title, an element's text
const TEXT_PROPERTIES = new Set(['title', 'textContent', 'innerText', 'placeholder', 'ariaLabel'])

const attributeName = (name) =>
  name.type === 'JSXNamespacedName' ? `${name.namespace.name}:${name.name.name}` : name.name
const calleeName = (callee) =>
  callee.type === 'Identifier'
    ? callee.name
    : callee.type === 'MemberExpression' && !callee.computed
      ? callee.property.name
      : undefined

// Walks a file's syntax tree for the places where a string reaches the screen as written. The tree is
// Vite's parser's (oxc): TypeScript 7, this repo's compiler, has no JavaScript API to parse with
function bareStrings(program) {
  const bare = []
  const report = (strings, what) => {
    for (const { at, text } of strings) if (isWords(text)) bare.push({ at, what, text: text.trim() })
  }
  const visit = (node, parent) => {
    switch (node.type) {
      case 'JSXText': {
        let at = node.start
        for (const line of node.value.split('\n')) {
          if (hasWords(line)) bare.push({ at, what: 'bare JSX text', text: line.trim() })
          at += line.length + 1
        }
        break
      }
      case 'JSXExpressionContainer':
        if (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment') {
          report(visibleStrings(node.expression), 'bare string in JSX')
        }
        break
      case 'JSXAttribute': {
        const name = attributeName(node.name)
        if (!VISIBLE_ATTRIBUTES.has(name) || node.value === null) break
        const value = node.value.type === 'JSXExpressionContainer' ? node.value.expression : node.value
        report(visibleStrings(value), `bare ${name} attribute`)
        break
      }
      case 'CallExpression':
      case 'NewExpression': {
        const name = calleeName(node.callee)
        if (TEXT_CALLS.has(name) || (node.type === 'NewExpression' && name === 'Notification')) {
          for (const argument of node.arguments) report(visibleStrings(argument), `bare string passed to ${name}()`)
        }
        break
      }
      case 'AssignmentExpression': {
        const { left } = node
        if (left.type === 'MemberExpression' && !left.computed && TEXT_PROPERTIES.has(left.property.name)) {
          report(visibleStrings(node.right), `bare string assigned to .${left.property.name}`)
        }
        break
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' || value === null || typeof value !== 'object') continue
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child !== null && typeof child === 'object' && typeof child.type === 'string') visit(child, node)
      }
    }
  }
  visit(program, null)
  return bare
}

const lineAt = (source, at) => source.slice(0, at).split('\n').length

function checkSource(file) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  const { program, comments, errors } = parseSync(file, source, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' })
  if (errors.length > 0) {
    const at = errors[0].labels?.[0]?.start ?? 0
    problems.push(`${file}:${lineAt(source, at)}: cannot parse: ${errors[0].message}`)
    return
  }

  const found = []
  const ignored = (line) => IGNORE.test(lines[line - 1]) || IGNORE_NEXT.test(lines[line - 2] ?? '')
  const report = (line, what, text) => {
    if (!ignored(line)) found.push({ line, what, text })
  }

  let withoutComments = source
  for (const { start, end } of comments) {
    const blank = source.slice(start, end).replace(/[^\n]/g, ' ')
    withoutComments = withoutComments.slice(0, start) + blank + withoutComments.slice(end)
  }
  withoutComments.split('\n').forEach((line, index) => {
    if (CJK.test(line)) report(index + 1, 'CJK outside comments', line.trim())
  })
  for (const { at, what, text } of bareStrings(program)) report(lineAt(source, at), what, text)

  found.sort((a, b) => a.line - b.line)
  for (const { line, what, text } of found) problems.push(`${file}:${line}: ${what}: ${text}`)
}

const sourceFiles = existsSync(SOURCE_ROOT)
  ? readdirSync(SOURCE_ROOT, { recursive: true, encoding: 'utf8' })
      .map((path) => `${SOURCE_ROOT}/${path.replaceAll('\\', '/')}`)
      .filter((path) => /\.tsx?$/.test(path) && ![SITE_EN, SITE_ZH, ROOM_EN, ROOM_ZH].includes(path))
      .sort()
  : []

const siteEn = await load(SITE_EN, 'en')
const siteZh = await load(SITE_ZH, 'zhTW')
const gameMessages = await load(GAMES, 'GAME_MESSAGES')
const gamesEn = gameMessages.en ?? {}
const gamesZh = gameMessages['zh-TW'] ?? {}

checkParity(siteEn, SITE_EN, siteZh, SITE_ZH)
// Each is checked when it exists (the tests' fixtures have only some)
const roomEn = existsSync(ROOM_EN) ? await load(ROOM_EN, 'roomEn') : {}
if (existsSync(ROOM_EN)) checkParity(roomEn, ROOM_EN, await load(ROOM_ZH, 'roomZhTW'), ROOM_ZH)
for (const key of Object.keys(roomEn)) {
  if (key in siteEn) problems.push(`${ROOM_EN}: '${key}' is in ${SITE_EN} too`)
}
// The lobby tables are in everyone's first load: a game's name and summary, and nothing more
const lobbyEn = existsSync(LOBBY_EN) ? await load(LOBBY_EN, 'lobbyEn') : {}
if (existsSync(LOBBY_EN)) checkParity(lobbyEn, LOBBY_EN, await load(LOBBY_ZH, 'lobbyZhTW'), LOBBY_ZH)
for (const key of Object.keys(lobbyEn)) {
  if (!LOBBY_KEY.test(key)) problems.push(`${LOBBY_EN}: '${key}': only names, summaries and tryAlone here`)
}
checkParity(gamesEn, `${GAMES} (en)`, gamesZh, `${GAMES} (zh-TW)`)
const screenMessages = existsSync(GAME_SCREENS) ? await load(GAME_SCREENS, 'SCREEN_MESSAGES') : {}
const screensEn = screenMessages.en ?? {}
checkParity(screensEn, `${GAME_SCREENS} (en)`, screenMessages['zh-TW'] ?? {}, `${GAME_SCREENS} (zh-TW)`)
for (const key of Object.keys(screensEn)) {
  // `room.extra.`: the room's own strings that load later (shared/games/roomExtras.ts, I3)
  if (!key.startsWith('games.') && !key.startsWith('room.extra.')) {
    problems.push(`${GAME_SCREENS}: '${key}': keys here start with games. or room.extra.`)
  }
}
const kartMessages = existsSync(KART) ? await load(KART, 'KART_MESSAGES') : {}
const kartEn = kartMessages.en ?? {}
checkParity(kartEn, `${KART} (en)`, kartMessages['zh-TW'] ?? {}, `${KART} (zh-TW)`)
for (const key of Object.keys(kartEn)) {
  if (!key.startsWith('kart.')) problems.push(`${KART}: '${key}': keys here start with kart.`)
}
const kartKeys = new Set(Object.keys(kartEn))
let kartPartKeys = 0
for (const [file, exportName] of KART_PARTS) {
  if (!existsSync(file)) continue
  const part = await load(file, exportName)
  const partEn = part.en ?? {}
  checkParity(partEn, `${file} (en)`, part['zh-TW'] ?? {}, `${file} (zh-TW)`)
  for (const key of Object.keys(partEn)) {
    if (!key.startsWith('kart.')) problems.push(`${file}: '${key}': keys here start with kart.`)
    if (kartKeys.has(key)) problems.push(`${file}: '${key}' is in ${KART} or another part too`)
    kartKeys.add(key)
    kartPartKeys++
  }
}
// A string file of the kart's that nothing checks would let a missing translation through
if (existsSync(KART)) {
  const kartSource = readFileSync(KART, 'utf8')
  const listed = new Set(KART_PARTS.map(([file]) => file))
  for (const name of readdirSync('shared/kart').filter((one) => /^i18n\..+\.ts$/.test(one))) {
    const file = `shared/kart/${name}`
    const merged = kartSource
      .split(/\r?\n/)
      .some((line) => line.startsWith('import {') && line.endsWith(`from './${name}'`))
    if (!merged && !listed.has(file)) {
      problems.push(`${file}: neither merged into ${KART} nor listed in check-i18n.mjs KART_PARTS`)
    }
  }
}
for (const [catalog, file] of [[siteEn, SITE_EN], [siteZh, SITE_ZH], [roomEn, ROOM_EN]]) {
  for (const key of Object.keys(catalog)) {
    if (key.startsWith('games.')) problems.push(`${file}: '${key}': games.* belongs to game modules`)
  }
}
for (const file of sourceFiles) checkSource(file)

for (const problem of problems) console.log(problem)
if (problems.length > 0) {
  console.log(`FAIL check-i18n: ${problems.length} problem(s)`)
  // Not process.exit(): on Windows stdout to a pipe is async, and the list must reach the end
  process.exitCode = 1
} else {
  const keys =
    Object.keys(siteEn).length +
    Object.keys(roomEn).length +
    Object.keys(gamesEn).length +
    Object.keys(screensEn).length +
    Object.keys(kartEn).length +
    kartPartKeys
  console.log(`ok   check-i18n: ${keys} keys, ${sourceFiles.length} source files`)
}
