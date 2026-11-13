import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/bluff/rules.en.md?raw'
import rulesZh from '../../../shared/games/bluff/rules.zh-TW.md?raw'
import { bluffMessages } from '../../../shared/games/bluff/i18n.ts'
import { BLUFF_READ_SECONDS } from '../../../shared/games/bluff/info.ts'
import { bluff, MOLE_MIN_PLAYERS, MOLE_WORDS, PREPARE_MS, SCORE, VOTE_MS } from '../../../shared/games/bluff/rules.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Bluff Reader', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = bluff.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    expect(text).toContain(`${PREPARE_MS / 1000}`)
    expect(text).toContain(`${VOTE_MS / 1000}`)
    expect(text).toContain(`${BLUFF_READ_SECONDS}`)
    expect(text).toContain(`${MOLE_WORDS}`)
    expect(text).toContain(`${MOLE_MIN_PLAYERS}`)
    for (const points of [SCORE.judgeRight, SCORE.fooledJudge, SCORE.stickerOnMole, SCORE.moleUnstuck]) {
      expect(text).toContain(`+${points}`)
    }
    expect(text).toContain(`−${Math.abs(SCORE.stickerOnHonest)}`)
    for (const field of Object.values(bluff.options)) {
      expect(text).toContain(`**${bluffMessages[language][field.labelKey]}**`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as where the idea comes from (%s)', (language) => {
    expect(DOCS[language].match(/9upper/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('bluff')).toBe(true)
  })
})
