// The words the server deals must be the reviewed draft, line for line. After editing the CSV, run
// `node scripts/word-bridge-bank.mjs` to bring bank.ts along.
import { describe, expect, it } from 'vitest'
import wordsCsv from '../../../docs/content/word-bridge-words.zh-TW.csv?raw'
import { WB_WORDS } from '../../../shared/games/word-bridge/bank.ts'
import { SAMPLE_CLUES } from '../../../shared/games/word-bridge/rules.ts'
import { overlaps } from '../../../shared/games/wordFold.ts'

const lines = (csv: string) => csv.replace(/\r/g, '').trim().split('\n')
const CATEGORIES = ['牌桌', '校園淡水', '港片江湖', '動物', '食物', '自然', '地方', '人物', '物品', '交通科技', '運動', '身體']

describe('the word bank', () => {
  const [header, ...rows] = lines(wordsCsv)

  it('matches the reviewed CSV line for line', () => {
    expect(header).toBe('category,word')
    expect(WB_WORDS.map((row) => [...row])).toEqual(rows.map((line) => line.split(',').map((field) => field.trim())))
  })

  it('holds 400 words or more, in known categories, with the bridge, campus and film ones well stocked', () => {
    expect(WB_WORDS.length).toBeGreaterThanOrEqual(400)
    expect(new Set(WB_WORDS.map(([category]) => category))).toEqual(new Set(CATEGORIES))
    for (const theme of ['牌桌', '校園淡水', '港片江湖']) {
      expect(WB_WORDS.filter(([category]) => category === theme).length, theme).toBeGreaterThanOrEqual(30)
    }
  })

  it('has every word once, one to four Chinese characters, mostly two or more', () => {
    const words = WB_WORDS.map(([, word]) => word)
    expect(new Set(words).size).toBe(words.length)
    for (const word of words) expect(word, word).toMatch(/^\p{Script=Han}{1,4}$/u)
    expect(words.filter((word) => [...word].length >= 2).length / words.length).toBeGreaterThan(0.85)
  })

  it('leaves room for a full grid: no word holds so many others that 25 cannot be dealt apart', () => {
    const words = WB_WORDS.map(([, word]) => word)
    for (const word of words) {
      expect(words.filter((other) => other !== word && overlaps(other, word)).length, word).toBeLessThan(20)
    }
  })

  it('never clashes with the sample clues the rules list', () => {
    for (const [, word] of WB_WORDS) for (const clue of SAMPLE_CLUES) expect(overlaps(word, clue)).toBe(false)
  })
})
