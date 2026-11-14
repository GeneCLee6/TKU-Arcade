import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/odd-word/rules.en.md?raw'
import rulesZh from '../../../shared/games/odd-word/rules.zh-TW.md?raw'
import { oddWordMessages } from '../../../shared/games/odd-word/i18n.ts'
import { ODD_DEFAULT_ROUNDS } from '../../../shared/games/odd-word/info.ts'
import { oddWord, TWO_UNDERCOVERS_FROM } from '../../../shared/games/odd-word/rules.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Odd Word Out', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = oddWord.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    expect(text).toContain(`${TWO_UNDERCOVERS_FROM}`)
    expect(text).toContain(`${ODD_DEFAULT_ROUNDS}`)
    const rounds = oddWord.options.rounds
    expect(text).toContain(`${rounds.kind === 'int' ? rounds.max : ''}`)
    for (const field of Object.values(oddWord.options)) {
      expect(text).toContain(`**${oddWordMessages[language][field.labelKey]}**`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/誰是臥底/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('odd-word')).toBe(true)
  })
})
