// The card set the server deals must be the reviewed CSVs, line for line, and keep its balance:
// every good equally served, a cost curve that rises with the tier, and every card within reach.
// After editing a CSV, run `node scripts/traders-cards.mjs` to bring bank.ts along.
import { describe, expect, it } from 'vitest'
import cardsCsv from '../../../docs/content/traders-cards.csv?raw'
import patronsCsv from '../../../docs/content/traders-patrons.csv?raw'
import { TRADERS_CARDS, TRADERS_PATRONS } from '../../../shared/games/traders/bank.ts'
import { supplyFor } from '../../../shared/games/traders/rules.ts'

const GOODS = ['tea', 'camphor', 'indigo', 'sugar', 'pepper']
const lines = (csv: string) => csv.replace(/\r/g, '').trim().split('\n')
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const tier = (n: number) => TRADERS_CARDS.filter((card) => card.tier === n)

/** The curve each tier keeps: tokens it costs in all, and the points it gives */
const CURVE = {
  1: { cost: [3, 5], points: [0, 1] },
  2: { cost: [5, 8], points: [1, 3] },
  3: { cost: [8, 14], points: [3, 5] },
} as const

describe('the card set', () => {
  it('matches the reviewed CSVs line for line', () => {
    const [cardHeader, ...cardRows] = lines(cardsCsv)
    expect(cardHeader).toBe(`id,tier,bonus,points,${GOODS.join(',')}`)
    expect(TRADERS_CARDS.map((card) => [card.id, card.tier, GOODS[card.bonus], card.points, ...card.cost].join(','))).toEqual(cardRows)
    const [patronHeader, ...patronRows] = lines(patronsCsv)
    expect(patronHeader).toBe(`id,zh,en,${GOODS.join(',')}`)
    expect(TRADERS_PATRONS.map((patron) => [patron.id, patron.zh, patron.en, ...patron.need].join(','))).toEqual(patronRows)
  })

  it('holds 90 cards over three tiers (40, 30, 20) and 10 patrons, every id once', () => {
    expect([1, 2, 3].map((n) => tier(n).length)).toEqual([40, 30, 20])
    expect(TRADERS_PATRONS).toHaveLength(10)
    const ids = [...TRADERS_CARDS, ...TRADERS_PATRONS].map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every good the same number of cards in each tier, and the same points', () => {
    for (const n of [1, 2, 3]) {
      const byGood = GOODS.map((_, good) => tier(n).filter((card) => card.bonus === good))
      expect(new Set(byGood.map((cards) => cards.length)).size, `tier ${n} counts`).toBe(1)
      expect(new Set(byGood.map((cards) => sum(cards.map((card) => card.points)))).size, `tier ${n} points`).toBe(1)
    }
  })

  it('asks for every good about equally, in each tier and from the patrons', () => {
    for (const n of [1, 2, 3]) {
      const demand = GOODS.map((_, good) => sum(tier(n).map((card) => card.cost[good])))
      const mean = sum(demand) / GOODS.length
      for (const value of demand) expect(Math.abs(value - mean), `tier ${n}: ${demand}`).toBeLessThanOrEqual(mean * 0.1)
    }
    const wants = GOODS.map((_, good) => sum(TRADERS_PATRONS.map((patron) => patron.need[good])))
    expect(Math.max(...wants) - Math.min(...wants), `patrons: ${wants}`).toBeLessThanOrEqual(2)
  })

  it('keeps the cost and points curve of each tier', () => {
    for (const n of [1, 2, 3] as const) {
      for (const card of tier(n)) {
        const total = sum(card.cost)
        expect(total, card.id).toBeGreaterThanOrEqual(CURVE[n].cost[0])
        expect(total, card.id).toBeLessThanOrEqual(CURVE[n].cost[1])
        expect(card.points, card.id).toBeGreaterThanOrEqual(CURVE[n].points[0])
        expect(card.points, card.id).toBeLessThanOrEqual(CURVE[n].points[1])
      }
    }
    // Dearer tiers cost more on average, and pay more per token spent
    const mean = (n: number, of: (card: (typeof TRADERS_CARDS)[number]) => number) => sum(tier(n).map(of)) / tier(n).length
    expect(mean(1, (card) => sum(card.cost))).toBeLessThan(mean(2, (card) => sum(card.cost)))
    expect(mean(2, (card) => sum(card.cost))).toBeLessThan(mean(3, (card) => sum(card.cost)))
    const rate = (n: number) => sum(tier(n).map((card) => card.points)) / sum(tier(n).map((card) => sum(card.cost)))
    expect(rate(1)).toBeLessThan(rate(2))
    expect(rate(2)).toBeLessThan(rate(3))
    // Within a tier no scoring card is a bargain or a dud: points per token stay near the tier's
    // rate. A cheap card with a high rate wants many of one good, which only bonuses make easy
    for (const n of [2, 3]) {
      for (const card of tier(n)) {
        const ratio = card.points / sum(card.cost) / rate(n)
        expect(ratio, card.id).toBeGreaterThanOrEqual(0.5)
        expect(ratio, card.id).toBeLessThanOrEqual(1.6)
      }
    }
  })

  it('never asks for its own good much, nor the same cost twice in a good', () => {
    for (const card of TRADERS_CARDS) expect(card.cost[card.bonus], card.id).toBeLessThanOrEqual(2)
    for (const n of [1, 2, 3]) {
      for (let good = 0; good < GOODS.length; good++) {
        const costs = tier(n).filter((card) => card.bonus === good).map((card) => card.cost.join(','))
        expect(new Set(costs).size).toBe(costs.length)
      }
    }
  })

  it('puts every card within reach, even with the two-player supply', () => {
    const supply = supplyFor(2)
    for (const card of tier(1)) {
      // From nothing: ten tokens or fewer, no more of a good than the wharf holds
      expect(sum(card.cost), card.id).toBeLessThanOrEqual(10)
      for (const cost of card.cost) expect(cost, card.id).toBeLessThanOrEqual(supply)
    }
    for (const card of TRADERS_CARDS) {
      // With three of each good from stalls (eight of each exist): ten tokens, gold for what the
      // wharf cannot hold
      const owed = card.cost.map((cost) => Math.max(0, cost - 3))
      expect(sum(owed), card.id).toBeLessThanOrEqual(10)
      expect(sum(owed.map((value) => Math.max(0, value - supply))), card.id).toBeLessThanOrEqual(5)
    }
  })

  it('has patrons wanting 8 or 9 bonuses, never more than 4 of a good', () => {
    for (const patron of TRADERS_PATRONS) {
      expect([8, 9], patron.id).toContain(sum(patron.need))
      expect(Math.max(...patron.need), patron.id).toBeLessThanOrEqual(4)
    }
  })
})
