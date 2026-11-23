// 2026-11-23: the few numbers a player card shows, from this browser's achievements
import { afterEach, describe, expect, it } from 'vitest'
import { setTitleChoice } from '../../src/achievements/cardPrefs.ts'
import { RULES } from '../../src/achievements/rules.ts'
import { save } from '../../src/achievements/store.ts'
import { buildSummary, currentSummary, doneRules, pickTitle } from '../../src/achievements/summary.ts'
import { parseProfileSummary } from '../../shared/social.ts'

afterEach(() => localStorage.clear())

const saved = {
  stats: {
    n: { 'kart.finishes': 30, 'platform.games': 40, 'board.wins': 3, 'kart.wins': 2 },
    t: {
      'kart.karts': { tide: 1, comet: 5 },
      'kart.bestLap': { harbour: 61_234.4, riverside: 58_000, nowhere: 10 },
    },
  },
  unlocked: { 'kart-first-finish': 1000 },
}

describe('a player card from the save', () => {
  it('counts what is unlocked, the favourite kart, the best lap and the wins; no more', () => {
    const summary = buildSummary(saved, 'auto', 'club')
    expect(summary).toEqual(parseProfileSummary(summary))
    expect(summary).toMatchObject({
      unlocked: doneRules(saved).length,
      total: RULES.length,
      games: 40,
      boardWins: 3,
      kartWins: 2,
      kart: 'comet',
      driver: 'club',
      lap: { track: 'riverside', ms: 58_000 },
    })
    expect(Object.keys(summary ?? {})).not.toContain('stats')
  })

  it('shows the chosen title if unlocked, else the best badge, or none', () => {
    const done = doneRules(saved)
    const best = pickTitle(done, saved, 'auto')
    expect(done.some((rule) => rule.id === best)).toBe(true)
    const top = Math.max(...done.map((rule) => rule.tier))
    expect(done.find((rule) => rule.id === best)?.tier).toBe(top)
    expect(pickTitle(done, saved, 'kart-first-finish')).toBe('kart-first-finish')
    expect(pickTitle(done, saved, 'never-unlocked')).toBe(best)
    expect(pickTitle(done, saved, 'none')).toBeUndefined()
    expect(buildSummary({ stats: { n: {}, t: {} }, unlocked: {} }, 'auto', null)).not.toHaveProperty('title')
  })

  it('reads the stores: the save, the title chosen and the driver', () => {
    save(saved)
    localStorage.setItem('tku-arcade.kart.driver', 'heart')
    setTitleChoice('kart-first-finish')
    expect(currentSummary()).toMatchObject({ title: 'kart-first-finish', driver: 'heart' })
  })
})
