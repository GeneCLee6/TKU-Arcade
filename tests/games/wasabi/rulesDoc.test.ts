import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/wasabi/rules.en.md?raw'
import rulesZh from '../../../shared/games/wasabi/rules.zh-TW.md?raw'
import { wasabiMessages } from '../../../shared/games/wasabi/i18n.ts'
import { PLAIN_START, wasabi, WASABI_START } from '../../../shared/games/wasabi/rules.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Wasabi Dumplings', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = wasabi.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    expect(text).toContain(`${PLAIN_START}`)
    expect(text).toContain(`${WASABI_START}`)
    const goal = wasabi.options.goal
    expect(goal.kind).toBe('int')
    if (goal.kind === 'int') expect(text).toContain(`1 ${language === 'en' ? 'to' : '到'} ${goal.max}`)
    for (const field of Object.values(wasabi.options)) {
      expect(text).toContain(`**${wasabiMessages[language][field.labelKey]}**`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as where the idea comes from (%s)', (language) => {
    expect(DOCS[language].match(/Skull/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('wasabi')).toBe(true)
  })
})
