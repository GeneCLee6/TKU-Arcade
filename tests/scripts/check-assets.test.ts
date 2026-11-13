// @vitest-environment node
import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain script, without types
import { checkAssets } from '../../scripts/check-assets.mjs'

// e12-t08 (AC-12.6): what the CI step refuses

const run = (files: string[], listing: string, sizes: Record<string, number> = {}): string[] =>
  checkAssets(files, listing, (file: string) => sizes[file] ?? 1000)

describe('check-assets', () => {
  it('passes listed assets and ignores code', () => {
    expect(
      run(['public/favicon.svg', 'src/App.tsx', 'README.md'], 'the mark `public/favicon.svg`'),
    ).toEqual([])
  })

  it('refuses an unlisted asset, a model or sound in the repository, and a big image', () => {
    const problems = run(
      ['public/new.png', 'assets/kart.glb', 'src/sounds/engine.ogg', 'public/huge.png'],
      '`public/huge.png`',
      { 'public/huge.png': 300 * 1024 },
    )
    expect(problems).toEqual([
      'public/new.png: not listed in docs/ASSETS.md',
      'assets/kart.glb: models, textures and sounds go to R2, not the repository (docs/ASSETS.md)',
      'src/sounds/engine.ogg: models, textures and sounds go to R2, not the repository (docs/ASSETS.md)',
      'public/huge.png: 300 kB, more than 100 kB in the repository',
    ])
  })

  it('leaves the visual baselines alone', () => {
    expect(
      run(['e2e-visual/__screenshots__/lobby.png'], '', {
        'e2e-visual/__screenshots__/lobby.png': 400_000,
      }),
    ).toEqual([])
  })

  it('needs the full path in backticks, not just the name', () => {
    expect(run(['docs/brand/lockup-light.svg'], '`lockup-light.svg`')).toHaveLength(1)
  })
})

describe('the R2 upload names', () => {
  it('hash the content, so a changed file gets a new name', async () => {
    const { hashedName, uploadCommand, CACHE } = await import('../../scripts/assets/upload.ts')
    const a = hashedName('art/Track Riverside.GLB', new TextEncoder().encode('one'))
    const b = hashedName('art/Track Riverside.GLB', new TextEncoder().encode('two'))
    expect(a).toMatch(/^track-riverside\.[0-9a-f]{12}\.glb$/)
    expect(a).not.toBe(b)
    expect(uploadCommand('x.glb', a)).toEqual(
      expect.arrayContaining(['--content-type', 'model/gltf-binary', '--cache-control', CACHE]),
    )
  })
})
