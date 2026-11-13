// The terms and mission words the server draws from must be the reviewed drafts, line for line.
// After editing a CSV, run `node scripts/bluff-bank.mjs` to bring bank.ts along.
import { describe, expect, it } from 'vitest'
import termsCsv from '../../../docs/content/bluff-terms.zh-TW.csv?raw'
import wordsCsv from '../../../docs/content/bluff-words.zh-TW.csv?raw'
import { BLUFF_TERMS, BLUFF_WORDS } from '../../../shared/games/bluff/bank.ts'
import { MOLE_WORDS } from '../../../shared/games/bluff/rules.ts'

const lines = (csv: string) => csv.replace(/\r/g, '').trim().split('\n')
const CATEGORIES = ['動物', '植物', '食物', '歷史', '科學', '語言', '生活', '職業']

describe('the term bank', () => {
  const [header, ...rows] = lines(termsCsv)

  it('matches the reviewed CSV line for line', () => {
    expect(header).toBe('category,term,hint,explanation')
    expect(BLUFF_TERMS.map((row) => [...row])).toEqual(rows.map((line) => line.split(',').map((field) => field.trim())))
  })

  it('holds at least 100 terms (e6), each in a known category, none twice', () => {
    expect(BLUFF_TERMS.length).toBeGreaterThanOrEqual(100)
    expect(new Set(BLUFF_TERMS.map(([category]) => category))).toEqual(new Set(CATEGORIES))
    const terms = BLUFF_TERMS.map(([, term]) => term)
    expect(new Set(terms).size).toBe(terms.length)
  })

  it('gives each a short hint without the term, and an explanation of 60 to 120 characters', () => {
    for (const [, term, hint, explanation] of BLUFF_TERMS) {
      expect(hint.includes(term), term).toBe(false)
      expect([...hint].length, term).toBeLessThanOrEqual(14)
      expect([...explanation].length, term).toBeGreaterThanOrEqual(60)
      expect([...explanation].length, term).toBeLessThanOrEqual(120)
    }
  })
})

describe('the mole’s words', () => {
  const [header, ...rows] = lines(wordsCsv)

  it('match the reviewed CSV, and are enough for many rounds without a repeat in one', () => {
    expect(header).toBe('word')
    expect([...BLUFF_WORDS]).toEqual(rows.map((line) => line.trim()))
    expect(new Set(BLUFF_WORDS).size).toBe(BLUFF_WORDS.length)
    expect(BLUFF_WORDS.length).toBeGreaterThanOrEqual(MOLE_WORDS * 30)
  })
})
