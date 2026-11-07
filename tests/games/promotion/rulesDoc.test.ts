import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/promotion/rules.en.md?raw'
import rulesZh from '../../../shared/games/promotion/rules.zh-TW.md?raw'
import {
  DEFAULT_TURN_LIMIT,
  promotion,
  SIX_SIDED_TABLE,
} from '../../../shared/games/promotion/rules.ts'
import type { IntOption } from '../../../shared/games/types.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS: Record<string, string> = { en: rulesEn, 'zh-TW': rulesZh }
const read = (language: string) => DOCS[language]
const shape = (language: string) =>
  parseMarkdown(read(language)).map((block) =>
    block.kind === 'list' ? `list:${block.items.length}` : block.kind,
  )
const turnLimit = promotion.options.turnLimit as IntOption

// Ways out of 81 of getting this many red dice: C(4, r) * 2^(4 - r), with 2 of 6 faces red
const chanceOf = (reds: number[]) => {
  const ways = [16, 32, 24, 8, 1]
  return ((reds.reduce((sum, r) => sum + ways[r], 0) / 81) * 100).toFixed(1)
}

describe('the rules of promotion', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(['en', 'zh-TW'])('state what the module does (%s)', (language) => {
    const text = read(language)
    expect(text).toContain(`${turnLimit.min}`)
    expect(text).toContain(`${turnLimit.max}`)
    expect(text).toContain(`${DEFAULT_TURN_LIMIT}`)
    for (const face of ['de', 'cai', 'gong', 'zang'] as const) {
      const reds = SIX_SIDED_TABLE.flatMap((result, r) => (result === face ? [r] : []))
      expect(text).toContain(`${chanceOf(reds)}%`)
    }
  })

  it.each(['en', 'zh-TW'])('name no game this one must not be confused with (%s)', (language) => {
    expect(read(language)).not.toMatch(/kartrider|跑跑|the gang|紙牌幫|wavelength|腦洞|9upper|瞎掰/i)
  })
})
