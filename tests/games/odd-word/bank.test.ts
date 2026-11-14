// The pairs the server draws from must be the reviewed draft, line for line. After editing the CSV,
// run `node scripts/odd-word-bank.mjs` to bring bank.ts along.
import { describe, expect, it } from 'vitest'
import pairsCsv from '../../../docs/content/odd-word-pairs.zh-TW.csv?raw'
import { ODD_PAIRS } from '../../../shared/games/odd-word/bank.ts'

const lines = (csv: string) => csv.replace(/\r/g, '').trim().split('\n')
const CATEGORIES = [
  '食物飲料',
  '校園',
  '生活用品',
  '地點',
  '交通',
  '職業',
  '娛樂',
  '運動',
  '動物',
  '節日習俗',
  '科技網路',
  '穿搭',
  '日常',
  // The owner's request, 2026-11-14: the friends are TVB drama and Stephen Chow fans
  '港劇港片',
]

describe('the word bank', () => {
  const [header, ...rows] = lines(pairsCsv)

  it('matches the reviewed CSV line for line', () => {
    expect(header).toBe('category,first,second')
    expect(ODD_PAIRS.map((row) => [...row])).toEqual(rows.map((line) => line.split(',').map((field) => field.trim())))
  })

  it('holds about 220 pairs, each in a known category', () => {
    expect(ODD_PAIRS.length).toBeGreaterThanOrEqual(200)
    expect(new Set(ODD_PAIRS.map(([category]) => category))).toEqual(new Set(CATEGORIES))
  })

  it('never has a word twice, in a pair or across the bank, and keeps every word short', () => {
    const words = ODD_PAIRS.flatMap(([, first, second]) => [first, second])
    expect(new Set(words).size).toBe(words.length)
    for (const word of words) expect([...word].length, word).toBeLessThanOrEqual(8)
  })
})
