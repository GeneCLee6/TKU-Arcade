// The terms and mission words the server draws from must be the reviewed drafts, line for line.
// After editing a CSV, run `node scripts/bluff-bank.mjs` to bring bank.ts along.
import { describe, expect, it } from 'vitest'
import termsCsv from '../../../docs/content/bluff-terms.zh-TW.csv?raw'
import wordsCsv from '../../../docs/content/bluff-words.zh-TW.csv?raw'
import { BLUFF_TERMS, BLUFF_WORDS } from '../../../shared/games/bluff/bank.ts'
import { MOLE_WORDS } from '../../../shared/games/bluff/rules.ts'

const lines = (csv: string) => csv.replace(/\r/g, '').trim().split('\n')

describe('the term bank', () => {
  const [header, ...rows] = lines(termsCsv)

  it('matches the reviewed CSV line for line', () => {
    expect(header).toBe('term,category,decoy1,decoy2,explanation')
    expect(BLUFF_TERMS.map((row) => [...row])).toEqual(rows.map((line) => line.split(',').map((field) => field.trim())))
  })

  // Rewritten 2026-11-14 (擁有者): rarer, longer terms, each with three categories, one of them true
  it('holds at least 200 terms, none twice', () => {
    expect(BLUFF_TERMS.length).toBeGreaterThanOrEqual(200)
    const terms = BLUFF_TERMS.map(([term]) => term)
    expect(new Set(terms).size).toBe(terms.length)
  })

  it('gives each three different short categories and an explanation of 80 to 160 characters', () => {
    for (const [term, category, decoy1, decoy2, explanation] of BLUFF_TERMS) {
      expect(new Set([category, decoy1, decoy2]).size, term).toBe(3)
      for (const choice of [category, decoy1, decoy2]) {
        expect([...choice].length, term).toBeGreaterThanOrEqual(2)
        expect([...choice].length, term).toBeLessThanOrEqual(6)
      }
      expect([...explanation].length, term).toBeGreaterThanOrEqual(80)
      expect([...explanation].length, term).toBeLessThanOrEqual(160)
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
