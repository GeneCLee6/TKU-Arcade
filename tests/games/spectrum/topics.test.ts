// The topics the server draws from must be the reviewed draft, line for line, until F3 moves them to
// D1. After editing the CSV, run `node scripts/spectrum-topics.mjs` to bring topics.ts along.
import { describe, expect, it } from 'vitest'
import csv from '../../../docs/content/spectrum-topics.zh-TW.csv?raw'
import { SPECTRUM_TOPICS } from '../../../shared/games/spectrum/topics.ts'

const lines = csv.replace(/\r/g, '').trim().split('\n')

describe('the topic bank', () => {
  it('has the header the generator expects', () => {
    expect(lines[0]).toBe('category,topic,scene,low,high')
  })

  it('matches the reviewed CSV line for line', () => {
    const rows = lines.slice(1).map((line) => line.split(',').map((field) => field.trim()))
    expect(SPECTRUM_TOPICS.map((row) => [...row])).toEqual(rows)
  })

  // Rewritten 2026-11-14 (擁有者: too dull, too subjective): fewer, each with a scene
  it('holds at least 220 topics, every field filled, no topic twice', () => {
    expect(SPECTRUM_TOPICS.length).toBeGreaterThanOrEqual(220)
    expect(
      SPECTRUM_TOPICS.every((row) => row.length === 5 && row.every((field) => field !== '')),
    ).toBe(true)
    const names = SPECTRUM_TOPICS.map(([category, topic]) => `${category}/${topic}`)
    expect(new Set(names).size).toBe(names.length)
  })

  it('sets every scene in a sentence of 15 to 45 characters, with no digits anywhere', () => {
    for (const [, topic, scene, low, high] of SPECTRUM_TOPICS) {
      expect([...scene].length, topic).toBeGreaterThanOrEqual(15)
      expect([...scene].length, topic).toBeLessThanOrEqual(45)
      expect(/[0-9]/.test(topic + scene + low + high), topic).toBe(false)
    }
  })

  it('uses twelve categories', () => {
    expect(new Set(SPECTRUM_TOPICS.map(([category]) => category))).toEqual(
      new Set([
        '生活',
        '校園',
        '食物',
        '旅行',
        '工作',
        '科技',
        '娛樂',
        '動物與自然',
        '歷史與文化',
        '人際',
        '運動',
        '奇想',
      ]),
    )
  })
})
