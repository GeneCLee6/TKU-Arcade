import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/misery/rules.en.md?raw'
import rulesZh from '../../../shared/games/misery/rules.zh-TW.md?raw'
import { miseryMessages } from '../../../shared/games/misery/i18n.ts'
import { MISERY_DEFAULT_START, MISERY_DEFAULT_TARGET, MISERY_MAX_START } from '../../../shared/games/misery/info.ts'
import { misery } from '../../../shared/games/misery/rules.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Misery Line', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = misery.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    expect(text).toContain(language === 'en' ? `1 to ${MISERY_MAX_START}` : `1–${MISERY_MAX_START}`)
    expect(text).toContain(`${MISERY_DEFAULT_TARGET}`)
    expect(text).toContain(`${MISERY_DEFAULT_START}`)
    for (const field of Object.values(misery.options)) {
      expect(text).toContain(`**${miseryMessages[language][field.labelKey]}**`)
    }
  })

  // The original is named in one descriptive sentence, on this page only (legal analysis §2.7)
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/Shit Happens/g)).toHaveLength(1)
    expect(DOCS[language].match(/Goliath/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('misery')).toBe(true)
  })
})
