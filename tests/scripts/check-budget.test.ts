// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve('scripts/check-budget.mjs')
const KB = 1000

// Random hex holds 4 bits of entropy per character, so it gzips to about the size of the bytes
const jsOfGzipKb = (kb: number) => randomBytes(kb * KB).toString('hex')

interface FakeChunk {
  file: string
  kb: number
  isEntry?: boolean
  isDynamicEntry?: boolean
  imports?: string[]
}

const dirs: string[] = []

function runBudget(chunks: Record<string, FakeChunk>) {
  const dir = mkdtempSync(join(tmpdir(), 'budget-'))
  dirs.push(dir)
  const client = join(dir, 'dist/client')
  mkdirSync(join(client, '.vite'), { recursive: true })
  mkdirSync(join(client, 'assets'))
  for (const chunk of Object.values(chunks)) {
    writeFileSync(join(client, chunk.file), jsOfGzipKb(chunk.kb))
  }
  writeFileSync(join(client, '.vite/manifest.json'), JSON.stringify(chunks))
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' })
  return { status: result.status, output: result.stdout + result.stderr }
}

const entry = (kb: number, imports?: string[]): FakeChunk => ({
  file: 'assets/index.js',
  kb,
  isEntry: true,
  imports,
})

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('check-budget', () => {
  it('passes under budget and skips the kart when no kart chunk exists', () => {
    const { status, output } = runBudget({ 'index.html': entry(10) })
    expect(status).toBe(0)
    expect(output).toMatch(/ok\s+main site/)
    expect(output).toContain('skip kart')
  })

  it('fails when the main site is over budget, counting static imports', () => {
    const { status, output } = runBudget({
      'index.html': entry(100, ['_vendor.js']),
      '_vendor.js': { file: 'assets/vendor.js', kb: 100 },
    })
    expect(status).toBe(1)
    expect(output).toMatch(/FAIL main site/)
  })

  it('does not count lazy chunks in the main site', () => {
    const { status } = runBudget({
      'index.html': entry(10),
      'src/pages/AdminPage.tsx': { file: 'assets/admin.js', kb: 200, isDynamicEntry: true },
    })
    expect(status).toBe(0)
  })

  it("adds a board game's lazy chunk and the room page to its first screen", () => {
    const { status, output } = runBudget({
      'index.html': entry(60),
      'src/pages/RoomPage.tsx': { file: 'assets/room.js', kb: 60, isDynamicEntry: true },
      'src/games/promotion/Screen.tsx': { file: 'assets/promo.js', kb: 60, isDynamicEntry: true },
    })
    expect(status).toBe(1)
    expect(output).toMatch(/ok\s+main site/)
    expect(output).toMatch(/FAIL first screen of src\/games\/promotion/)
  })

  it('counts the kart separately, with its own limit', () => {
    const under = runBudget({
      'index.html': entry(10),
      'src/kart/Scene.tsx': { file: 'assets/kart.js', kb: 400, isDynamicEntry: true },
    })
    expect(under.status).toBe(0)
    expect(under.output).toMatch(/ok\s+main site/)
    expect(under.output).toMatch(/ok\s+kart/)

    const over = runBudget({
      'index.html': entry(10),
      'src/kart/Scene.tsx': {
        file: 'assets/kart.js',
        kb: 400,
        isDynamicEntry: true,
        imports: ['_three.js'],
      },
      '_three.js': { file: 'assets/three.js', kb: 300 },
    })
    expect(over.status).toBe(1)
    expect(over.output).toMatch(/FAIL kart/)
  })

  it('fails with a clear message when the build has not run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-'))
    dirs.push(dir)
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('run `npm run build` first')
  })
})
