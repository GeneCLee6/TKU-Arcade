import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/spectrum/rules.en.md?raw'
import rulesZh from '../../../shared/games/spectrum/rules.zh-TW.md?raw'
import {
  ANSWER_MS,
  GUESS_MS,
  HIGHEST,
  LOWEST,
  MAX_ANSWER_LENGTH,
  spectrum,
} from '../../../shared/games/spectrum/rules.ts'
import { spectrumMessages } from '../../../shared/games/spectrum/i18n.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'

const DOCS = { en: rulesEn, 'zh-TW': rulesZh }
const LANGUAGES = ['en', 'zh-TW'] as const
const shape = (language: (typeof LANGUAGES)[number]) =>
  parseMarkdown(DOCS[language]).map((block) =>
    block.kind === 'list' ? `list:${block.items.length}` : block.kind,
  )

describe('the rules of Spectrum', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(LANGUAGES)('state what the module does (%s)', (language) => {
    const text = DOCS[language]
    const { minPlayers, maxPlayers } = spectrum.meta
    const range = language === 'en' ? `${minPlayers} to ${maxPlayers}` : `${minPlayers}–${maxPlayers}`
    expect(text).toContain(range)
    expect(text).toContain(`${LOWEST}`)
    expect(text).toContain(`${HIGHEST}`)
    expect(text).toContain(`${MAX_ANSWER_LENGTH}`)
    expect(text).toContain(`${ANSWER_MS / 1000}`)
    expect(text).toContain(`${GUESS_MS / 1000}`)
    // Every option the host has, by the name the waiting room gives it
    for (const field of Object.values(spectrum.options)) {
      expect(text).toContain(`**${spectrumMessages[language][field.labelKey]}**`)
    }
  })

  it.each(LANGUAGES)('name the original once, in one descriptive sentence (%s)', (language) => {
    const text = DOCS[language]
    expect(text.match(/\bito\b/gi)).toHaveLength(1)
    const sentence = text.split('\n').find((line) => /\bito\b/i.test(line)) ?? ''
    // One sentence: no full stop before its end
    expect(sentence.trim().replace(/[.。]$/, '')).not.toMatch(/[.。]/)
    expect(text).not.toMatch(/kartrider|跑跑|the gang|紙牌幫|wavelength|腦洞|9upper|瞎掰/i)
  })
})
