import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/silent-table/rules.en.md?raw'
import rulesZh from '../../../shared/games/silent-table/rules.zh-TW.md?raw'
import { MOVES_PER_ROUND, silentTable } from '../../../shared/games/silent-table/rules.ts'
import type { IntOption } from '../../../shared/games/types.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'
import { HAND_CATEGORIES } from '../../../shared/poker/hand.ts'
import { silentTableScreenMessages } from '../../../shared/games/silent-table/i18n.screen.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) =>
    block.kind === 'list' ? `list:${block.items.length}` : block.kind,
  )

const levels = silentTable.options.levelsToWin as IntOption
const failures = silentTable.options.failureLimit as IntOption

describe('the rules of Silent Table', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    expect(text).toContain(`**${language === 'en' ? `${MOVES_PER_ROUND} moves` : `每人每輪可以移動 ${MOVES_PER_ROUND} 次`}`)
    for (const field of [levels, failures]) {
      expect(text).toContain(`${field.min}`)
      expect(text).toContain(`${field.max}`)
    }
    for (const seconds of ['60', '90', '120']) expect(text).toContain(seconds)
  })

  it.each(LANGUAGES)('list the hands weakest first, in the words of the game (%s)', (language) => {
    const text = DOCS[language]
    const places = HAND_CATEGORIES.map((category) =>
      text.indexOf(silentTableScreenMessages[language][`games.silent-table.hand.${category}`]),
    )
    expect(places.every((place) => place >= 0)).toBe(true)
    expect(places).toEqual([...places].sort((a, b) => a - b))
  })

  it.each(LANGUAGES)('name no game this one must not be confused with (%s)', (language) => {
    expect(DOCS[language]).not.toMatch(/kartrider|跑跑|the gang|紙牌幫|wavelength|腦洞|9upper|瞎掰/i)
  })
})
