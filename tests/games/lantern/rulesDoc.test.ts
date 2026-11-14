import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/lantern/rules.en.md?raw'
import rulesZh from '../../../shared/games/lantern/rules.zh-TW.md?raw'
import { lanternMessages } from '../../../shared/games/lantern/i18n.ts'
import { LEVEL_TABLES, MAX_LIVES, MAX_MOONS, REWARDS, START_MOONS } from '../../../shared/games/lantern/rules.ts'
import { lantern } from '../../../shared/games/lantern/rules.ts'
import { hasRules } from '../../../src/lib/rulesList.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Lantern Lane', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = lantern.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers} 到 ${maxPlayers}`)
    // Every level table, row by row
    for (let players = 2; players <= 6; players++) {
      const row = `| ${players} | ${LEVEL_TABLES.standard[players]} | ${LEVEL_TABLES.short[players]} | ${LEVEL_TABLES.taster[players]} |`
      expect(text).toContain(row)
    }
    // Every reward
    for (const level of Object.keys(REWARDS)) expect(text).toMatch(new RegExp(`\\| ${level} \\|`))
    expect(text).toContain(`${MAX_LIVES}`)
    expect(text).toContain(`${MAX_MOONS}`)
    expect(text).toContain(`${START_MOONS}`)
    for (const field of Object.values(lantern.options)) {
      expect(text).toContain(`**${lanternMessages[language][field.labelKey]}**`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/The Mind/g)).toHaveLength(1)
  })

  it('asks the table not to talk about numbers', () => {
    expect(rulesEn).toContain("don't say numbers")
    expect(rulesZh).toContain('不要說數字')
  })

  it('is found by the rules page', () => {
    expect(hasRules('lantern')).toBe(true)
  })
})
