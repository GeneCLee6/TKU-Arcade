import { describe, expect, it } from 'vitest'
import { gamesWithRules, hasRules } from '../../src/lib/rulesList.ts'

// The list the first screens ask must name exactly the games whose rules files exist
const files = (pattern: 'rules' | 'rulesFull', language: 'en' | 'zh-TW') =>
  Object.keys(
    pattern === 'rules'
      ? language === 'en'
        ? import.meta.glob('/shared/games/*/rules.en.md')
        : import.meta.glob('/shared/games/*/rules.zh-TW.md')
      : language === 'en'
        ? import.meta.glob('/shared/games/*/rulesFull.en.md')
        : import.meta.glob('/shared/games/*/rulesFull.zh-TW.md'),
  )
    .map((path) => path.split('/')[3])
    .sort()

describe('the list of games with rules', () => {
  it('names every game with a rules file, in both languages, and no other', () => {
    expect([...gamesWithRules('simple')].sort()).toEqual(files('rules', 'en'))
    expect([...gamesWithRules('simple')].sort()).toEqual(files('rules', 'zh-TW'))
    expect([...gamesWithRules('full')].sort()).toEqual(files('rulesFull', 'en'))
    expect([...gamesWithRules('full')].sort()).toEqual(files('rulesFull', 'zh-TW'))
  })

  it('answers for one game and edition', () => {
    expect(hasRules('promotion')).toBe(true)
    expect(hasRules('promotion', 'full')).toBe(true)
    expect(hasRules('bluff', 'full')).toBe(false)
    expect(hasRules('tictactoe')).toBe(false)
  })
})
