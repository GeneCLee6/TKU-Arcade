// The topics the server draws from must be the reviewed draft, line for line, until F3 moves them to
// D1. After editing the CSV, run `node scripts/spectrum-topics.mjs` to bring topics.ts along.
import { describe, expect, it } from 'vitest'
import csv from '../../../docs/content/spectrum-topics.zh-TW.csv?raw'
import { SPECTRUM_TOPICS } from '../../../shared/games/spectrum/topics.ts'

const lines = csv.replace(/\r/g, '').trim().split('\n')

describe('the topic bank', () => {
  it('has the header the generator expects', () => {
    expect(lines[0]).toBe('category,topic,low,high')
  })

  it('matches the reviewed CSV line for line', () => {
    const rows = lines.slice(1).map((line) => line.split(',').map((field) => field.trim()))
    expect(SPECTRUM_TOPICS.map((row) => [...row])).toEqual(rows)
  })

  it('holds at least 300 topics, every field filled, no topic twice', () => {
    expect(SPECTRUM_TOPICS.length).toBeGreaterThanOrEqual(300)
    expect(
      SPECTRUM_TOPICS.every((row) => row.length === 4 && row.every((field) => field !== '')),
    ).toBe(true)
    const names = SPECTRUM_TOPICS.map(([category, topic]) => `${category}/${topic}`)
    expect(new Set(names).size).toBe(names.length)
  })

  it('uses the eleven categories of the epic', () => {
    expect(new Set(SPECTRUM_TOPICS.map(([category]) => category))).toEqual(
      new Set([
        '食物',
        '校園',
        '橋牌與遊戲',
        '生活',
        '娛樂',
        '人際',
        '旅行',
        '怪問題',
        '科技',
        '工作',
        '動物與自然',
      ]),
    )
  })
})
