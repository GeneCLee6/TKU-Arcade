import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/secret-scroll/rules.en.md?raw'
import rulesZh from '../../../shared/games/secret-scroll/rules.zh-TW.md?raw'
import { secretScrollMessages } from '../../../shared/games/secret-scroll/i18n.ts'
import { secretScrollScreenMessages } from '../../../shared/games/secret-scroll/i18n.screen.ts'
import { DECK_COUNTS } from '../../../shared/games/secret-scroll/deck.ts'
import { GOALS, secretScroll } from '../../../shared/games/secret-scroll/rules.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Secret Scroll', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = secretScroll.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    for (const field of Object.values(secretScroll.options)) {
      expect(text).toContain(`**${secretScrollMessages[language][field.labelKey]}**`)
    }
    // Every card, with its value and its count
    for (let card = 1; card <= 8; card++) {
      const name = secretScrollScreenMessages[language][`games.secret-scroll.card.${card}`]
      const count = DECK_COUNTS[card as keyof typeof DECK_COUNTS]
      const copies = language === 'zh-TW' ? `（${count} 張）` : card === 1 ? ` (${count} cards)` : ` (${count})`
      expect(text).toContain(`**${card} ${name}**${copies}`)
    }
    for (const goal of [...GOALS.standard, ...GOALS.short]) expect(text).toContain(`${goal}`)
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as where the idea comes from (%s)', (language) => {
    expect(DOCS[language].match(/Love Letter/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('secret-scroll')).toBe(true)
  })
})
