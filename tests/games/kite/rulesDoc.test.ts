import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/kite/rules.en.md?raw'
import rulesZh from '../../../shared/games/kite/rules.zh-TW.md?raw'
import { kiteMessages } from '../../../shared/games/kite/i18n.ts'
import { MAX_BURNS, MAX_NOTES, MAX_TURN_SECONDS } from '../../../shared/games/kite/info.ts'
import { kite } from '../../../shared/games/kite/rules.ts'
import { kiteScreenMessages } from '../../../shared/games/kite/i18n.screen.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Kite Day', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = kite.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    expect(text).toContain(`${MAX_NOTES}`)
    expect(text).toContain(`${MAX_BURNS}`)
    expect(text).toContain(`${MAX_TURN_SECONDS}`)
    for (const field of Object.values(kite.options)) {
      expect(text).toContain(`**${kiteMessages[language][field.labelKey]}**`)
    }
    for (const suit of ['red', 'gold', 'jade', 'blue', 'white']) {
      expect(text).toContain(`**${kiteScreenMessages[language][`games.kite.suit.${suit}`]}**`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/Hanabi/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('kite')).toBe(true)
  })
})
