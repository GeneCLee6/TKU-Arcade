// The cards the server draws from must be the reviewed draft, line for line, and good to play with:
// after editing the CSV, run `node scripts/misery-bank.mjs` to bring bank.ts along.
import { describe, expect, it } from 'vitest'
import cardsCsv from '../../../docs/content/misery-cards.zh-TW.csv?raw'
import { MISERY_CARDS } from '../../../shared/games/misery/bank.ts'

const lines = (csv: string) => csv.replace(/\r/g, '').trim().split('\n')
const CATEGORIES = [
  '校園',
  '愛情',
  '職場',
  '旅行',
  '美食',
  '科技',
  '家庭',
  '健康',
  '金錢',
  // The friends are a bridge club, and Hong Kong film fans (owner, 2026-11-14)
  '橋牌',
  '港片人生',
  '日常',
]
/** No index on more cards than this, so that neighbours are always worth arguing about */
const MOST_PER_INDEX = 6

describe('the card bank', () => {
  const [header, ...rows] = lines(cardsCsv)

  it('matches the reviewed CSV line for line', () => {
    expect(header).toBe('category,title,index')
    expect(MISERY_CARDS.map(([category, title, index]) => [category, title, String(index)])).toEqual(
      rows.map((line) => line.split(',').map((field) => field.trim())),
    )
  })

  it('holds 300 to 420 cards, each in a known category, every category well filled', () => {
    expect(MISERY_CARDS.length).toBeGreaterThanOrEqual(300)
    expect(MISERY_CARDS.length).toBeLessThanOrEqual(420)
    const counts = new Map<string, number>()
    for (const [category] of MISERY_CARDS) counts.set(category, (counts.get(category) ?? 0) + 1)
    expect(new Set(counts.keys())).toEqual(new Set(CATEGORIES))
    for (const [category, count] of counts) expect(count, category).toBeGreaterThanOrEqual(20)
  })

  it('spreads the indexes over 1 to 100, no index too often', () => {
    const counts = new Map<number, number>()
    for (const [, title, index] of MISERY_CARDS) {
      expect(Number.isInteger(index) && index >= 1 && index <= 100, title).toBe(true)
      counts.set(index, (counts.get(index) ?? 0) + 1)
    }
    for (const [index, count] of counts) expect(count, `index ${index}`).toBeLessThanOrEqual(MOST_PER_INDEX)
    // Every stretch of ten has cards, both ends included
    for (let low = 1; low <= 91; low += 10) {
      const inside = MISERY_CARDS.filter(([, , index]) => index >= low && index < low + 10).length
      expect(inside, `${low}–${low + 9}`).toBeGreaterThanOrEqual(15)
    }
    expect(counts.has(1)).toBe(true)
    expect(counts.has(100)).toBe(true)
  })

  it('never has a title twice, and keeps every title short and vivid', () => {
    const titles = MISERY_CARDS.map(([, title]) => title)
    expect(new Set(titles).size).toBe(titles.length)
    for (const title of titles) {
      expect([...title].length, title).toBeGreaterThanOrEqual(8)
      expect([...title].length, title).toBeLessThanOrEqual(30)
    }
  })
})
