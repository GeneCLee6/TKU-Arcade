import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/holdem/rules.en.md?raw'
import rulesZh from '../../../shared/games/holdem/rules.zh-TW.md?raw'
import { holdemMessages } from '../../../shared/games/holdem/i18n.ts'
import { holdemScreenMessages } from '../../../shared/games/holdem/i18n.screen.ts'
import { holdem } from '../../../shared/games/holdem/rules.ts'
import { HAND_CATEGORIES } from '../../../shared/poker/hand.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe("the rules of Texas Hold'em", () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const messages = { ...holdemMessages[language], ...holdemScreenMessages[language] }
    const { minPlayers, maxPlayers } = holdem.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`)
    // Every option by the name the waiting room uses, and each of its choices
    for (const field of Object.values(holdem.options)) {
      expect(text).toContain(`**${messages[field.labelKey]}**`)
      if (field.kind !== 'select') continue
      for (const choice of field.choices) {
        if (choice.value === 0) continue
        expect(text).toContain(`${messages[choice.labelKey].replace(/ seconds| 秒|Every |每 | hands| 手/g, '')}`)
      }
    }
    // Every hand category, by the name the screen uses
    for (const category of [...HAND_CATEGORIES, 'royalFlush']) {
      expect(text.toLowerCase()).toContain(`**${messages[`games.holdem.hand.${category}`].toLowerCase()}**`)
    }
    for (const button of ['sitOut', 'comeBack', 'stopVote']) expect(text).toContain(`**${messages[`games.holdem.ui.${button}`]}**`)
  })

  it('is found by the rules page', () => {
    expect(hasRules('holdem')).toBe(true)
  })
})
