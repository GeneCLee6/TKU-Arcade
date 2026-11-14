import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/clue-clash/rules.en.md?raw'
import rulesZh from '../../../shared/games/clue-clash/rules.zh-TW.md?raw'
import { MAX_CLUE_LENGTH } from '../../../shared/games/clue-clash/clue.ts'
import { clueClashMessages } from '../../../shared/games/clue-clash/i18n.ts'
import { CC_CARDS } from '../../../shared/games/clue-clash/info.ts'
import { clueClash, REVIEW_MS } from '../../../shared/games/clue-clash/rules.ts'
import { hasRules } from '../../../src/lib/rulesList.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Clue Clash', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = clueClash.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    for (const number of [CC_CARDS, MAX_CLUE_LENGTH, REVIEW_MS / 1000]) expect(text).toContain(`${number}`)
    for (const field of Object.values(clueClash.options)) {
      expect(text).toContain(`**${clueClashMessages[language][field.labelKey]}**`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/Just One/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('clue-clash')).toBe(true)
  })
})
