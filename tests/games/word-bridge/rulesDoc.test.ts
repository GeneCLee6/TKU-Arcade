import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/word-bridge/rules.en.md?raw'
import rulesZh from '../../../shared/games/word-bridge/rules.zh-TW.md?raw'
import { wordBridgeMessages } from '../../../shared/games/word-bridge/i18n.ts'
import { WB_DEFAULT_TURNS } from '../../../shared/games/word-bridge/info.ts'
import { BYSTANDERS, DUO_TARGETS, SECOND_WORDS, STARTING_WORDS, wordBridge } from '../../../shared/games/word-bridge/rules.ts'
import { MAX_CLUE_LENGTH } from '../../../shared/games/word-bridge/clue.ts'
import { hasRules } from '../../../src/lib/rulesList.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Word Bridge', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = wordBridge.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    for (const number of [STARTING_WORDS, SECOND_WORDS, BYSTANDERS, DUO_TARGETS, WB_DEFAULT_TURNS, MAX_CLUE_LENGTH]) {
      expect(text).toContain(`${number}`)
    }
    for (const field of Object.values(wordBridge.options)) {
      expect(text).toContain(`**${wordBridgeMessages[language][field.labelKey]}**`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/Codenames/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('word-bridge')).toBe(true)
  })
})
