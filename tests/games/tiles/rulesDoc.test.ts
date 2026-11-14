import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/tiles/rules.en.md?raw'
import rulesZh from '../../../shared/games/tiles/rules.zh-TW.md?raw'
import { tilesMessages } from '../../../shared/games/tiles/i18n.ts'
import { TILES_MAX_ROUNDS } from '../../../shared/games/tiles/info.ts'
import { SCORED_MS, tiles } from '../../../shared/games/tiles/rules.ts'
import { JOKER_PENALTY, OPENING_POINTS, RACK_SIZE, TILE_COUNT } from '../../../shared/games/tiles/tiles.ts'
import { hasRules } from '../../../src/lib/rulesDoc.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) => (block.kind === 'list' ? `list:${block.items.length}` : block.kind))

describe('the rules of Clubroom Tiles', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = tiles.meta
    expect(text).toContain(language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers} 到 ${maxPlayers}`)
    for (const number of [TILE_COUNT, RACK_SIZE, OPENING_POINTS, JOKER_PENALTY, TILES_MAX_ROUNDS, SCORED_MS / 1000, 60, 90, 120]) {
      expect(text).toContain(`${number}`)
    }
    for (const field of Object.values(tiles.options)) {
      expect(text).toContain(`**${tilesMessages[language][field.labelKey]}**`)
    }
  })

  // Rule 1 of CLAUDE.md: the original is named in one descriptive sentence, on this page only
  it.each(LANGUAGES)('names the original once, as what it plays like (%s)', (language) => {
    expect(DOCS[language].match(/Rummikub/g)).toHaveLength(1)
  })

  it('is found by the rules page', () => {
    expect(hasRules('tiles')).toBe(true)
  })
})
