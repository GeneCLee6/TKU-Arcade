// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve('scripts/check-i18n.mjs')
const NODE_FLAGS = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning']

const SITE_EN = 'src/i18n/en.ts'
const SITE_ZH = 'src/i18n/zh-TW.ts'
const GAMES = 'shared/games/index.ts'

const CLEAN: Record<string, string> = {
  [SITE_EN]: `export const en = { 'home.hi': 'Hi {name}', 'language.zhTW': '繁中' } as const`,
  [SITE_ZH]: `export const zhTW = { 'home.hi': '嗨 {name}', 'language.zhTW': '繁中' }`,
  [GAMES]: `export const GAME_MESSAGES = {
    en: { 'games.x.name': 'Dice {count}' },
    'zh-TW': { 'games.x.name': '骰子 {count}' },
  }`,
}

const dirs: string[] = []

// Fixture files win over the clean catalogs
function run(files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-'))
  dirs.push(dir)
  const all = { 'package.json': '{ "type": "module" }', ...CLEAN, ...files }
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  const result = spawnSync(process.execPath, [...NODE_FLAGS, SCRIPT], { cwd: dir, encoding: 'utf8' })
  return { status: result.status, output: result.stdout + result.stderr }
}

const games = (en: string, zh: string) => ({
  [GAMES]: `export const GAME_MESSAGES = { en: { ${en} }, 'zh-TW': { ${zh} } }`,
})

const page = (body: string) => ({ 'src/pages/Page.tsx': body })

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('check-i18n catalogs', () => {
  it('passes clean catalogs, without scanning en.ts and zh-TW.ts for CJK', () => {
    const { status, output } = run()
    expect(output).toContain('ok   check-i18n')
    expect(status).toBe(0)
  })

  it('fails on a site key missing from zh-TW', () => {
    const { status, output } = run({
      [SITE_EN]: `export const en = { a: 'A word', b: 'B word' }`,
      [SITE_ZH]: `export const zhTW = { a: '甲' }`,
    })
    expect(status).toBe(1)
    expect(output).toContain(`${SITE_ZH}: missing key 'b'`)
  })

  it('fails on an extra site key in zh-TW', () => {
    const { status, output } = run({
      [SITE_EN]: `export const en = { a: 'A word' }`,
      [SITE_ZH]: `export const zhTW = { a: '甲', b: '乙' }`,
    })
    expect(status).toBe(1)
    expect(output).toContain(`${SITE_ZH}: extra key 'b'`)
  })

  it('fails on an empty value in either language', () => {
    const { status, output } = run({
      [SITE_EN]: `export const en = { a: '', b: 'B word' }`,
      [SITE_ZH]: `export const zhTW = { a: '甲', b: '  ' }`,
    })
    expect(status).toBe(1)
    expect(output).toContain(`${SITE_EN}: empty value for 'a'`)
    expect(output).toContain(`${SITE_ZH}: empty value for 'b'`)
  })

  it('fails when the placeholder sets differ, whatever their order', () => {
    const { status, output } = run({
      [SITE_EN]: `export const en = { a: 'Hi {name}', same: '{x} and {y}' }`,
      [SITE_ZH]: `export const zhTW = { a: '嗨 {nick}', same: '{y} 與 {x}' }`,
    })
    expect(status).toBe(1)
    expect(output).toContain(`'a': en {name}, zh-TW {nick}`)
    expect(output).not.toContain(`'same'`)
  })

  it('fails on a site key under games.', () => {
    const { status, output } = run({
      [SITE_EN]: `export const en = { 'games.x.title': 'Title' }`,
      [SITE_ZH]: `export const zhTW = { 'games.x.title': '標題' }`,
    })
    expect(status).toBe(1)
    expect(output).toContain(`${SITE_EN}: 'games.x.title'`)
  })

  it('applies every parity check to GAME_MESSAGES', () => {
    const { status, output } = run(
      games(
        `'games.x.a': 'A word', 'games.x.empty': '', 'games.x.count': '{n} left'`,
        `'games.x.extra': '多', 'games.x.empty': '空', 'games.x.count': '剩 {m}'`,
      ),
    )
    expect(status).toBe(1)
    expect(output).toContain(`${GAMES} (zh-TW): missing key 'games.x.a'`)
    expect(output).toContain(`${GAMES} (zh-TW): extra key 'games.x.extra'`)
    expect(output).toContain(`${GAMES} (en): empty value for 'games.x.empty'`)
    expect(output).toContain(`${GAMES} (zh-TW): placeholders differ for 'games.x.count'`)
  })

  it('fails with a clear message when a catalog cannot be loaded', () => {
    const { status, output } = run({ [SITE_ZH]: 'export const wrongName = {}' })
    expect(status).toBe(1)
    expect(output).toContain(`${SITE_ZH}: no export named zhTW`)
  })
})

describe('check-i18n bare strings', () => {
  it('reports every problem, not just the first, with file and line', () => {
    const { status, output } = run({
      'src/a.tsx': `export const A = () => (\n  <p>Hello there</p>\n)\n`,
      'src/deep/b.ts': `export const b = 1\nexport const c = '你好'\n`,
    })
    expect(status).toBe(1)
    expect(output).toContain('src/a.tsx:2: bare JSX text: Hello there')
    expect(output).toContain('src/deep/b.ts:2: CJK outside comments')
    expect(output).toContain('2 problem(s)')
  })

  it.each([
    ['a string in .ts', 'src/x.ts', `export const x = '開始'`],
    ['a template literal', 'src/x.ts', 'export const x = `開始`'],
    ['JSX text', 'src/x.tsx', `export const X = () => <p>開始</p>`],
    ['fullwidth punctuation', 'src/x.ts', `export const x = 'a，b'`],
    ['JSX text that only looks like a comment', 'src/x.tsx', `export const X = () => <p>// 開始</p>`],
  ])('finds CJK in %s', (_name, path, body) => {
    const { status, output } = run({ [path]: body })
    expect(status).toBe(1)
    expect(output).toContain(`${path}:1: CJK outside comments`)
  })

  it.each([
    ['plain text', `const A = () => <p>Hello there</p>`],
    ['text in a fragment', `const A = () => <>Hello there</>`],
    ['text after an apostrophe', `const A = () => <p>Don't stop</p>`],
    ['text with //', `const A = () => <a href={u}>see http://x.test</a>`],
    ['text after an expression child', `const A = () => <p>{n} players</p>`],
    ['text in a nested element', `const A = () => <div><span><b>Bold</b></span></div>`],
    ['text in an attribute element', `const A = () => <B icon=<i>Icon</i> />`],
    ['text in a map callback', `const A = () => <ul>{xs.map((x) => <li key={x}>Item</li>)}</ul>`],
    ['text in a template expression', 'const a = `${ok ? <b>Bold</b> : null}`'],
    ['text after a generic call', `const A = () => { useState<string>(x); return <p>Hello</p> }`],
    ['text after a generic arrow', `const f = <T,>(x: T) => <p>Hello {x}</p>`],
    ['text after a quote in a regex', `const r = /'/\nconst A = () => <p>Hello</p>`],
    ['text in a generic component', `const A = () => <Select<string> id="x">Hello</Select>`],
  ])('finds %s', (_name, body) => {
    const { status, output } = run(page(body))
    expect(output).toContain('bare JSX text')
    expect(status).toBe(1)
  })

  it('reports each line of multi-line JSX text at its own line', () => {
    const { output } = run(page(`const A = () => (\n  <p>\n    First line\n    Second line\n  </p>\n)`))
    expect(output).toContain('src/pages/Page.tsx:3: bare JSX text: First line')
    expect(output).toContain('src/pages/Page.tsx:4: bare JSX text: Second line')
  })

  it.each([
    ['aria-label', `<button aria-label="Close" />`],
    ['title', `<div title="Details" />`],
    ['placeholder', `<input placeholder='Nickname' />`],
    ['alt', `<img alt="A dice" />`],
    ['label', `<Field label="Name" />`],
    ['label', `<Field label={'Name'} />`],
    ['title', `<Field title={"Don't"} />`],
  ])('finds a literal %s attribute: %s', (attribute, jsx) => {
    const { status, output } = run(page(`const A = () => ${jsx}`))
    expect(status).toBe(1)
    expect(output).toContain(`bare ${attribute} attribute`)
  })

  it.each([
    ['a generic call', `const A = () => { const [s] = useState<string>(x); return <p>{s}</p> }`],
    ['nested generics', `const m: Map<string, Array<number>> = new Map<string, Array<number>>()`],
    ['a generic function', `function f<T>(x: T): Promise<T> { return g<T>(x) }`],
    ['a generic arrow', `const f = <T,>(x: T) => x`],
    ['a constrained generic arrow', `const f = <T extends object>(x: T) => x`],
    ['a generic function type', `type F = <T>(x: T) => void\nconst a = 1`],
    ['comparisons', `const x = a > b && c < d`],
    ['comparisons without spaces', `const x = a>b && c<d`],
    ['comparisons in a child', `const A = () => <p>{a > b && c < d}</p>`],
    ['a comparison in a loop', `for (let i = 0; i<n; i++) { if (i>2) break }`],
    ['arrow functions', `const f = (x) => y\nconst g = (x) => z < 1`],
    ['expression children', `const A = () => <p>{t('home.hi')} {name}</p>`],
    ['a string child', `const A = () => <p>{' '}</p>`],
    ['styled CSS', 'const S = styled.div`\n  & > div { color: red; }\n  a < b;\n`'],
    ['CSS next to JSX', 'const S = styled.div`& > a {}`\nconst A = () => <S>{x}</S>'],
    ['punctuation', `const A = () => <p> - / · ... ( ) : </p>`],
    ['numbers', `const A = () => <p>1,234 / 56</p>`],
    ['entities', `const A = () => <p>&nbsp;&times;&#215;</p>`],
    ['a single letter', `const A = () => <kbd>K</kbd>`],
    ['tags in a string', `const x = '<p>Hello there</p>'`],
    ['a string with angle brackets', `const x = 'a > b and c < d'`],
    ['a line comment', `// <p>Hello there</p> 你好\nconst A = () => <p>{x}</p>`],
    ['a block comment', `/* <p>Hello there</p>\n 你好 */\nconst x = 1`],
    ['a JSX comment', `const A = () => <p>{/* Hello 你好 */}</p>`],
    ['a comment among attributes', `const A = () => <p\n  // Hello 你好\n  id="x"\n/>`],
    ['an empty alt', `const A = () => <img alt="" />`],
    ['a translated attribute', `const A = () => <i title={t('a')} alt={t('b')} />`],
    ['another attribute', `const A = () => <p className="hello there" id="main" />`],
    ['a dynamic attribute', `const A = () => <p title={ok ? t('a') : t('b')} label={name} />`],
  ])('accepts %s', (_name, body) => {
    const { status, output } = run(page(body))
    expect(output).toContain('ok   check-i18n')
    expect(status).toBe(0)
  })

  it('does not look for JSX in .ts files', () => {
    expect(run({ 'src/x.ts': `const a = 1 // not JSX\nconst p = '<p>Hello there</p>'` }).status).toBe(0)
  })

  it.each([
    ['a CJK string', 'src/x.ts', `export const x = '開始' // i18n-ignore`],
    ['JSX text in a child', 'src/x.tsx', `const A = () => <p>Hello {/* // i18n-ignore */}</p>`],
    ['an attribute', 'src/x.tsx', `const A = () => (\n  <p title="Hello" /> // i18n-ignore\n)`],
  ])('skips %s on a line with // i18n-ignore', (_name, path, body) => {
    const { status, output } = run({ [path]: body })
    expect(output).toContain('ok   check-i18n')
    expect(status).toBe(0)
  })

  it('skips only that line', () => {
    const { status, output } = run({
      'src/x.ts': `const a = '開始' // i18n-ignore\nconst b = '結束'\n`,
    })
    expect(status).toBe(1)
    expect(output).toContain('src/x.ts:2:')
    expect(output).not.toContain('src/x.ts:1:')
  })
})
