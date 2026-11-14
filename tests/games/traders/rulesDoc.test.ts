import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/traders/rules.en.md?raw'
import rulesZh from '../../../shared/games/traders/rules.zh-TW.md?raw'
import {
  DOUBLE_FROM,
  GOLD_TOKENS,
  MAX_RESERVED,
  PATRON_POINTS,
  ROUND_CAP,
  supplyFor,
  TOKEN_LIMIT,
  TRADERS_DEFAULT_TARGET,
  traders,
} from '../../../shared/games/traders/rules.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Tamsui Traders', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state the numbers the module plays by (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = traders.meta
    expect(text).toContain(`${minPlayers} ${language === 'en' ? 'to' : '到'} ${maxPlayers}`)
    for (const players of [2, 3, 4]) expect(text).toContain(`${supplyFor(players)}`)
    for (const number of [GOLD_TOKENS, TOKEN_LIMIT, MAX_RESERVED, DOUBLE_FROM, PATRON_POINTS, TRADERS_DEFAULT_TARGET, ROUND_CAP]) {
      expect(text).toContain(`${number}`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/Splendor/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('traders')).toBe(true)
  })
})
