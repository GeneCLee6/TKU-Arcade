import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_MESSAGES } from '../../shared/achievements/i18n.ts'
import { BOARD_GAMES, CATEGORIES, evaluate, newlyUnlocked, progressOf, RULES, type Rule } from '../../src/achievements/rules.ts'
import type { Stats } from '../../src/achievements/stats.ts'

const stats = (n: Record<string, number> = {}, t: Record<string, Record<string, number>> = {}): Stats => ({ n, t })
const ones = (ids: readonly string[]) => Object.fromEntries(ids.map((id) => [id, 1]))

/** Stats that just meet the rule, and stats one short of it */
function edges(rule: Rule): [Stats, Stats] {
  const { when } = rule
  if ('n' in when) return [stats({ [when.n]: when.min }), stats({ [when.n]: when.min - 1 })]
  if ('all' in when) return [stats({}, { [when.t]: ones(when.all) }), stats({}, { [when.t]: ones(when.all.slice(0, -1)) })]
  if ('has' in when) return [stats({}, { [when.t]: { [when.has]: 1 } }), stats({}, { [when.t]: { other: 1, [when.has]: 0 } })]
  const ids = Array.from({ length: when.min }, (_, index) => `id${index}`)
  return [stats({}, { [when.t]: ones(ids) }), stats({}, { [when.t]: ones(ids.slice(1)) })]
}

describe('the achievement rules', () => {
  it('has at least 40, each id once, in every category', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(RULES.map((rule) => rule.id)).size).toBe(RULES.length)
    for (const category of CATEGORIES) expect(RULES.some((rule) => rule.category === category)).toBe(true)
    expect(RULES.filter((rule) => rule.hidden).length).toBeGreaterThanOrEqual(3)
  })

  it('names and describes every rule in both languages', () => {
    for (const rule of RULES) {
      for (const language of ['en', 'zh-TW'] as const) {
        const messages: Record<string, string> = ACHIEVEMENT_MESSAGES[language]
        expect(messages[`ach.rule.${rule.id}.name`], `${language} ${rule.id}`).toBeTruthy()
        expect(messages[`ach.rule.${rule.id}.desc`], `${language} ${rule.id}`).toBeTruthy()
      }
    }
  })

  it('gives no two rules the same name', () => {
    for (const language of ['en', 'zh-TW'] as const) {
      const messages: Record<string, string> = ACHIEVEMENT_MESSAGES[language]
      const names = RULES.map((rule) => messages[`ach.rule.${rule.id}.name`])
      expect(new Set(names).size).toBe(names.length)
    }
  })

  for (const rule of RULES) {
    it(`${rule.id}: unlocks at its threshold and not one short of it`, () => {
      const [meets, short] = edges(rule)
      expect(evaluate(rule, meets)).toBe(true)
      expect(evaluate(rule, short)).toBe(false)
      expect(evaluate(rule, stats())).toBe(false)
    })
  }

  it('counts the board games in the lobby, not the kart or the template', () => {
    expect(BOARD_GAMES).toContain('promotion')
    expect(BOARD_GAMES).toContain('holdem')
    expect(BOARD_GAMES).not.toContain('kart')
    expect(BOARD_GAMES).not.toContain('tictactoe')
    expect(BOARD_GAMES.length).toBe(16)
  })

  it('says how far along a rule with a count is', () => {
    const rule = RULES.find((one) => one.id === 'kart-finish-25')!
    expect(progressOf(rule, stats({ 'kart.finishes': 7 }))).toEqual({ have: 7, need: 25 })
    expect(progressOf(rule, stats({ 'kart.finishes': 99 }))).toEqual({ have: 25, need: 25 })
    const garage = RULES.find((one) => one.id === 'kart-all-karts')!
    expect(progressOf(garage, stats({}, { 'kart.karts': { tide: 3, comet: 1 } }))?.have).toBe(2)
    expect(progressOf(RULES.find((one) => one.id === 'kart-first-finish')!, stats())).toBeNull()
  })

  it('lists only what is newly met', () => {
    const met = stats({ 'kart.finishes': 1, 'kart.perfectStarts': 1 })
    expect(newlyUnlocked(met, {}).map((rule) => rule.id)).toEqual(['kart-first-finish', 'kart-perfect-start'])
    expect(newlyUnlocked(met, { 'kart-first-finish': 1 }).map((rule) => rule.id)).toEqual(['kart-perfect-start'])
  })
})
