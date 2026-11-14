// The words the server draws must be the reviewed draft, line for line, and good to play. After
// editing the CSV, run `node scripts/clue-clash-bank.mjs` to bring bank.ts along.
import { describe, expect, it } from 'vitest'
import wordsCsv from '../../../docs/content/clue-clash-words.zh-TW.csv?raw'
import { CC_WORDS } from '../../../shared/games/clue-clash/bank.ts'
import { SAMPLE_CLUES } from '../../../shared/games/clue-clash/rules.ts'
import { foldText, overlaps } from '../../../shared/games/wordFold.ts'

const lines = (csv: string) => csv.replace(/\r/g, '').trim().split('\n')
const CATEGORIES = [
  '台灣美食',
  '世界美食',
  '港片江湖',
  '校園',
  '橋牌桌遊',
  '動物',
  '生活物品',
  '地點',
  '職業角色',
  '運動',
  '娛樂',
  '節日習俗',
  '自然天文',
  '交通科技',
  '傳說奇幻',
]

describe('the mystery-word bank', () => {
  const [header, ...rows] = lines(wordsCsv)

  it('matches the reviewed CSV line for line', () => {
    expect(header).toBe('category,word,alts')
    expect(CC_WORDS.map((row) => [...row])).toEqual(rows.map((line) => line.split(',').map((field) => field.trim())))
  })

  it('holds 400 words or more in known categories, each with at least 20', () => {
    expect(CC_WORDS.length).toBeGreaterThanOrEqual(400)
    expect(new Set(CC_WORDS.map(([category]) => category))).toEqual(new Set(CATEGORIES))
    for (const category of CATEGORIES) {
      expect(CC_WORDS.filter(([c]) => c === category).length, category).toBeGreaterThanOrEqual(20)
    }
  })

  it('keeps every word and answer short, and never twice across the bank', () => {
    const answers = CC_WORDS.flatMap(([, word, alts]) => [word, ...(alts === '' ? [] : alts.split('/'))])
    const folded = answers.map(foldText)
    expect(new Set(folded).size).toBe(folded.length)
    for (const answer of answers) {
      expect(answer.trim(), answer).toBe(answer)
      expect([...answer].length, answer).toBeGreaterThanOrEqual(1)
      expect([...answer].length, answer).toBeLessThanOrEqual(8)
    }
  })

  it('lists other answers that are really other names, not the word again', () => {
    for (const [, word, alts] of CC_WORDS) {
      if (alts === '') continue
      for (const alt of alts.split('/')) expect(foldText(alt), `${word}/${alt}`).not.toBe(foldText(word))
    }
  })

  it('leaves the sample clues the rules list playable on every word', () => {
    for (const [, word, alts] of CC_WORDS) {
      const answers = [word, ...(alts === '' ? [] : alts.split('/'))]
      const fine = SAMPLE_CLUES.filter((clue) => !answers.some((answer) => overlaps(answer, clue)))
      expect(fine.length, word).toBeGreaterThanOrEqual(2)
    }
  })
})
