import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/palace/rules.en.md?raw'
import rulesZh from '../../../shared/games/palace/rules.zh-TW.md?raw'
import { palaceMessages } from '../../../shared/games/palace/i18n.ts'
import { palaceScreenMessages } from '../../../shared/games/palace/i18n.screen.ts'
import { PALACE_DEFAULT_WINDOW } from '../../../shared/games/palace/info.ts'
import { ACTS, ARREST_COST, MUST_STORM, palace, ROLES, STORM_COST } from '../../../shared/games/palace/rules.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Palace Bluff', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = palace.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    for (const number of [STORM_COST, ARREST_COST, MUST_STORM, PALACE_DEFAULT_WINDOW]) expect(text).toContain(`${number}`)
    for (const field of Object.values(palace.options)) {
      expect(text).toContain(`**${palaceMessages[language][field.labelKey]}**`)
    }
    // Every role and action, by the names the screen uses
    for (const role of ROLES) expect(text).toContain(`**${palaceScreenMessages[language][`games.palace.role.${role}`]}**`)
    for (const act of ACTS) expect(text).toContain(`**${palaceScreenMessages[language][`games.palace.act.${act}`]}**`)
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/Coup/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('palace')).toBe(true)
  })
})
