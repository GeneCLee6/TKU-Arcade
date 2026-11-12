import { describe, expect, it } from 'vitest'
import rulesEn from '../../../shared/games/promotion/rules.en.md?raw'
import rulesZh from '../../../shared/games/promotion/rules.zh-TW.md?raw'
import {
  DEFAULT_TURN_LIMIT,
  promotion,
  SIX_SIDED_TABLE,
} from '../../../shared/games/promotion/rules.ts'
import type { IntOption } from '../../../shared/games/types.ts'
import { parseMarkdown } from '../../../src/lib/markdown.ts'
import fullEn from '../../../shared/games/promotion/rulesFull.en.md?raw'
import fullZh from '../../../shared/games/promotion/rulesFull.zh-TW.md?raw'
import { fullBoard } from '../../../shared/games/promotion/boardFull.ts'
const getFullCell = (id: string) => fullBoard(2).get(id)
import {
  birthOf,
  BUY_DISCOUNT,
  BUY_STEP,
  COURTESY,
  DAHE_GIFT,
  DEFAULT_DECISION_SECONDS,
  FULL_ROUND_LIMIT,
  MAX_TITLES,
  RANK_STEP,
  readThrow,
  RUN_REWARD,
  START_MONEY,
} from '../../../shared/games/promotion/rulesFull.ts'

const DOCS: Record<string, string> = { en: rulesEn, 'zh-TW': rulesZh }
const read = (language: string) => DOCS[language]
const shape = (language: string) =>
  parseMarkdown(read(language)).map((block) =>
    block.kind === 'list' ? `list:${block.items.length}` : block.kind,
  )
const turnLimit = promotion.options.turnLimit as IntOption

// Ways out of 81 of getting this many red dice: C(4, r) * 2^(4 - r), with 2 of 6 faces red
const chanceOf = (reds: number[]) => {
  const ways = [16, 32, 24, 8, 1]
  return ((reds.reduce((sum, r) => sum + ways[r], 0) / 81) * 100).toFixed(1)
}

describe('the rules of promotion', () => {
  it('have the same structure in both languages', () => {
    expect(shape('zh-TW')).toEqual(shape('en'))
  })

  it.each(['en', 'zh-TW'])('state what the module does (%s)', (language) => {
    const text = read(language)
    expect(text).toContain(`${turnLimit.min}`)
    expect(text).toContain(`${turnLimit.max}`)
    expect(text).toContain(`${DEFAULT_TURN_LIMIT}`)
    for (const face of ['de', 'cai', 'gong', 'zang'] as const) {
      const reds = SIX_SIDED_TABLE.flatMap((result, r) => (result === face ? [r] : []))
      expect(text).toContain(`${chanceOf(reds)}%`)
    }
  })

  it.each(['en', 'zh-TW'])('name no game this one must not be confused with (%s)', (language) => {
    expect(read(language)).not.toMatch(/kartrider|跑跑|the gang|紙牌幫|wavelength|腦洞|9upper|瞎掰|\bito\b/i)
  })
})

// The full edition's page (C6 drafts it; C7 shows it). Named rulesFull.*.md, not rules.full.*.md:
// src/lib/rulesDoc.ts globs rules.*.md, and would put both in the browser's map before C7 wants them
describe('the rules of the full edition', () => {
  const FULL: Record<string, string> = { en: fullEn, 'zh-TW': fullZh }
  const fullShape = (language: string) =>
    parseMarkdown(FULL[language]).map((block) =>
      block.kind === 'list'
        ? `list:${block.items.length}`
        : block.kind === 'table'
          ? `table:${block.rows.length}`
          : block.kind,
    )
  // Of all 1296 throws of four dice, the share of each pattern and each origin, as the page prints it
  const all = Array.from({ length: 1296 }, (_, n) =>
    [n % 6, Math.floor(n / 6) % 6, Math.floor(n / 36) % 6, Math.floor(n / 216)].map((d) => d + 1),
  )
  const percent = (count: number) => `${((count / 1296) * 100).toFixed(1)}%`

  it('has the same structure in both languages', () => {
    expect(fullShape('zh-TW')).toEqual(fullShape('en'))
  })

  it.each(['en', 'zh-TW'])('states the numbers the module plays by (%s)', (language) => {
    const text = FULL[language]
    // The second rules (C8), which the page describes: what every new game plays by
    const numbers = [START_MONEY, COURTESY, RUN_REWARD, FULL_ROUND_LIMIT, RANK_STEP, DAHE_GIFT, BUY_STEP, BUY_DISCOUNT, DEFAULT_DECISION_SECONDS]
    for (const number of numbers) expect(text).toContain(`${number}`)
    expect(getFullCell('dahe').retire).toBe(DAHE_GIFT)
    expect(MAX_TITLES).toBe(2)
    for (const id of ['xuezheng', 'xunyanyushi']) expect(text).toContain(` ${getFullCell(id).fine} `)
    for (const id of ['zhishi', 'yugao', 'dahe']) expect(text).toContain(`${getFullCell(id).retire}`)
    for (const id of ['jiansheng', 'juanban', 'geizhi']) expect(text).toContain(`${-getFullCell(id).money}`)
    const combos = new Map<string, number>()
    const origins = new Map<string, number>()
    let banner = 0
    for (const pips of all) {
      const { combo } = readThrow(pips)
      combos.set(combo, (combos.get(combo) ?? 0) + 1)
      const birth = birthOf(pips)
      origins.set(birth.origin, (origins.get(birth.origin) ?? 0) + 1)
      if (birth.banner) banner += 1
    }
    // four and all-graft are printed apart; the rest each have their line
    for (const [combo, count] of combos) {
      if (combo !== 'four' && combo !== 'allGraft') expect(text, combo).toContain(percent(count))
    }
    expect(text).toContain(percent((combos.get('four') ?? 0)))
    for (const count of origins.values()) expect(text).toContain(percent(count))
    expect(text).toContain(percent(banner))
  })

  it.each(['en', 'zh-TW'])('names the two households and says they illustrate history (%s)', (language) => {
    const text = FULL[language]
    if (language === 'en') {
      expect(text).toMatch(/Banner/)
      expect(text).toMatch(/Civilian/)
      expect(text).toMatch(/illustrates a Qing institution/)
    } else {
      expect(text).toContain('旗籍')
      expect(text).toContain('民籍')
      expect(text).toContain('示意清代')
    }
  })

  it.each(['en', 'zh-TW'])('names no other game and no other edition of this one (%s)', (language) => {
    expect(FULL[language]).not.toMatch(
      /kartrider|跑跑|the gang|紙牌幫|wavelength|腦洞|9upper|瞎掰|\bito\b|https?:|www\.|\.com|\.tw/i,
    )
  })
})
