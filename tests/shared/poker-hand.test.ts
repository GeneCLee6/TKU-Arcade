import { describe, expect, it, vi } from 'vitest'
import { createRng } from '../../shared/games/rng.ts'
import {
  bestHand,
  compareHands,
  evaluateFive,
  fullDeck,
  HAND_CATEGORIES,
  RANKS,
  type Card,
  type HandCategory,
} from '../../shared/poker/hand.ts'

// Walks every five-card hand, which goes past 5 s on a busy machine
vi.setConfig({ testTimeout: 120_000 })

const cards = (text: string) => text.split(' ') as Card[]
const five = (text: string) => evaluateFive(cards(text))
const best = (text: string) => bestHand(cards(text))

describe('the deck', () => {
  it('has 52 different cards', () => {
    expect(new Set(fullDeck()).size).toBe(52)
  })
})

describe('every five-card hand there is', () => {
  // The published counts for a 52-card deck, and the 7462 distinct hand values that follow from them
  const KNOWN_COUNTS: Record<HandCategory, number> = {
    highCard: 1_302_540,
    pair: 1_098_240,
    twoPair: 123_552,
    threeOfAKind: 54_912,
    straight: 10_200,
    flush: 5_108,
    fullHouse: 3_744,
    fourOfAKind: 624,
    straightFlush: 40,
  }

  it('falls into the known counts, with the known number of distinct strengths', () => {
    const deck = fullDeck()
    const found = Object.fromEntries(HAND_CATEGORIES.map((name) => [name, 0])) as Record<
      HandCategory,
      number
    >
    const scores = new Set<number>()
    for (let a = 0; a < 48; a++) {
      for (let b = a + 1; b < 49; b++) {
        for (let c = b + 1; c < 50; c++) {
          for (let d = c + 1; d < 51; d++) {
            for (let e = d + 1; e < 52; e++) {
              const hand = evaluateFive([deck[a], deck[b], deck[c], deck[d], deck[e]])
              found[hand.category]++
              scores.add(hand.score)
            }
          }
        }
      }
    }
    expect(found).toEqual(KNOWN_COUNTS)
    expect(scores.size).toBe(7462)
  })
})

describe('comparing hands', () => {
  const ladder: [string, HandCategory][] = [
    ['2s 3h 4d 5c 7s', 'highCard'],
    ['Ad Kd Qh Jh 9s', 'highCard'],
    ['2s 2h 3d 4c 5s', 'pair'],
    ['As Ah Kd Qc Js', 'pair'],
    ['2s 2h 3d 3c 4s', 'twoPair'],
    ['As Ah Kd Kc Qs', 'twoPair'],
    ['2s 2h 2d 3c 4s', 'threeOfAKind'],
    ['As Ah Ad Kc Qs', 'threeOfAKind'],
    ['As 2h 3d 4c 5s', 'straight'],
    ['2s 3h 4d 5c 6s', 'straight'],
    ['Ts Jh Qd Kc As', 'straight'],
    ['2s 3s 4s 5s 7s', 'flush'],
    ['As Ks Qs Js 9s', 'flush'],
    ['2s 2h 2d 3c 3s', 'fullHouse'],
    ['As Ah Ad Kc Ks', 'fullHouse'],
    ['2s 2h 2d 2c 3s', 'fourOfAKind'],
    ['As Ah Ad Ac Ks', 'fourOfAKind'],
    ['As 2s 3s 4s 5s', 'straightFlush'],
    ['2s 3s 4s 5s 6s', 'straightFlush'],
    ['Ts Js Qs Ks As', 'straightFlush'],
  ]

  it('puts a ladder of known hands in order, each with the right name', () => {
    ladder.forEach(([hand, category], index) => {
      expect(five(hand).category, hand).toBe(category)
      if (index > 0) {
        expect(five(hand).score, hand).toBeGreaterThan(five(ladder[index - 1][0]).score)
      }
    })
  })

  it.each([
    ['the higher pair', 'Ks Kh 2d 3c 4s', 'Qs Qh Ad Kc Js'],
    ['the first kicker', 'As Ah Kd 3c 2s', 'Ad Ac Qd Jc Ts'],
    ['the last kicker', 'As Ah Kd Qc 3s', 'Ad Ac Kh Qd 2s'],
    ['the higher of two pairs', 'As Ah 2d 2c 3s', 'Ks Kh Qd Qc Js'],
    ['the lower of two pairs', 'As Ah 3d 3c 2s', 'Ad Ac 2h 2s Ks'],
    ['the kicker of two pairs', 'As Ah Kd Kc 3s', 'Ad Ac Kh Ks 2s'],
    ['the triple of a full house', '3s 3h 3d 2c 2s', '2d 2h 2c As Ah'],
    ['the pair of a full house', 'As Ah Ad 3c 3s', 'As Ah Ad 2c 2s'],
    ['the kicker of four of a kind', 'As Ah Ad Ac 3s', 'As Ah Ad Ac 2s'],
    ['a flush card by card', 'As Ks Qs Js 9s', 'Ah Kh Qh Jh 8h'],
    ['the top of a straight', '3s 4h 5d 6c 7s', '2s 3h 4d 5c 6s'],
  ])('decides on %s', (_, higher, lower) => {
    expect(compareHands(five(higher), five(lower))).toBeGreaterThan(0)
    expect(compareHands(five(lower), five(higher))).toBeLessThan(0)
  })

  it('ties on the same ranks, whatever the suits', () => {
    expect(compareHands(five('As Kh Qd Jc 9s'), five('Ah Kd Qc Js 9h'))).toBe(0)
    expect(compareHands(five('As Ks Qs Js 9s'), five('Ah Kh Qh Jh 9h'))).toBe(0)
    expect(compareHands(five('As 2h 3d 4c 5s'), five('Ah 2d 3c 4s 5h'))).toBe(0)
  })

  it('lets an ace count low only in the five-high straight, which is the lowest', () => {
    expect(five('As 2h 3d 4c 6s').category).toBe('highCard')
    expect(five('Qs Kh Ad 2c 3s').category).toBe('highCard')
    expect(five('As 2h 3d 4c 5s').best).toEqual(cards('5s 4c 3d 2h As'))
  })

  it('names the five cards with the strongest group first', () => {
    expect(five('2s Ah 2d Kc Qs').best).toEqual(cards('2s 2d Ah Kc Qs'))
    expect(five('4s 9h 4d 9c 9s').best).toEqual(cards('9s 9h 9c 4s 4d'))
  })

  it('refuses a wrong number of cards', () => {
    expect(() => five('As Ks Qs Js')).toThrow(RangeError)
    expect(() => best('As Ks Qs Js')).toThrow(RangeError)
    expect(() => best('As Ks Qs Js Ts 9s 8s 7s')).toThrow(RangeError)
  })
})

describe('the best five of seven', () => {
  it.each<[string, string, HandCategory, string]>([
    ['a straight flush over the flush and straight', 'Ts Js Qs Ks As 2h 2d', 'straightFlush', 'As Ks Qs Js Ts'],
    ['the higher of two possible straights', '2h 3d 4c 5s 6h 7d Ah', 'straight', '7d 6h 5s 4c 3d'],
    ['the top five cards of a seven-card flush', '2s 4s 6s 8s Ts Qs As', 'flush', 'As Qs Ts 8s 6s'],
    ['the two best of three pairs, with the best kicker', 'As Ah Kd Kc Qs Qh 2d', 'twoPair', 'As Ah Kd Kc Qs'],
    ['a full house from two triples', 'As Ah Ad Kc Ks Kh 2d', 'fullHouse', 'As Ah Ad Ks Kc'],
    ['four of a kind and the best kicker', '7s 7h 7d 7c Ks Qh Jd', 'fourOfAKind', '7s 7h 7d 7c Ks'],
    ['a flush over the three of a kind it shares a card with', 'As Ks 9s 5s 2s Ad Ah', 'flush', 'As Ks 9s 5s 2s'],
  ])('finds %s', (_, hand, category, expected) => {
    const found = best(hand)
    expect(found.category).toBe(category)
    expect(found.best).toEqual(cards(expected))
  })

  it('ties when the shared cards make the best hand for both', () => {
    const board = 'Ts Js Qs Ks As'
    expect(compareHands(best(`2h 3d ${board}`), best(`4c 5h ${board}`))).toBe(0)
  })

  it('ties when a kicker below the best five cannot play', () => {
    const board = 'As Ad Kh Kc Qs'
    expect(compareHands(best(`2h 3d ${board}`), best(`4c 5h ${board}`))).toBe(0)
  })

  it('breaks a shared pair on the kicker in hand', () => {
    const board = '9s 9d 2h 5c 7s'
    expect(compareHands(best(`Ah 3d ${board}`), best(`Kc 3h ${board}`))).toBeGreaterThan(0)
  })

  /** The category by reading all seven cards at once, a different way from trying each five */
  function readSeven(hand: readonly Card[]): HandCategory {
    const bySuit = new Map<string, number[]>()
    const counts = new Array<number>(RANKS.length).fill(0)
    for (const card of hand) {
      const rank = RANKS.indexOf(card[0] as (typeof RANKS)[number])
      counts[rank]++
      bySuit.set(card[1], [...(bySuit.get(card[1]) ?? []), rank])
    }
    const hasRun = (ranks: readonly number[]) => {
      const present = new Set(ranks)
      if ([12, 0, 1, 2, 3].every((rank) => present.has(rank))) return true
      return ranks.some((low) => [1, 2, 3, 4].every((step) => present.has(low + step)))
    }
    const suited = [...bySuit.values()].find((ranks) => ranks.length >= 5)
    const ofSize = (size: number) => counts.filter((count) => count === size).length
    if (suited && hasRun(suited)) return 'straightFlush'
    if (ofSize(4) > 0) return 'fourOfAKind'
    if (ofSize(3) >= 2 || (ofSize(3) === 1 && ofSize(2) >= 1)) return 'fullHouse'
    if (suited) return 'flush'
    if (hasRun(counts.flatMap((count, rank) => (count > 0 ? [rank] : [])))) return 'straight'
    if (ofSize(3) === 1) return 'threeOfAKind'
    if (ofSize(2) >= 2) return 'twoPair'
    if (ofSize(2) === 1) return 'pair'
    return 'highCard'
  }

  it('agrees with a separate reading of the seven cards on 5000 random deals', () => {
    const rng = createRng(20261106)
    const deck = fullDeck()
    for (let deal = 0; deal < 5_000; deal++) {
      const hand = rng.shuffle(deck).slice(0, 7)
      expect(bestHand(hand).category, hand.join(' ')).toBe(readSeven(hand))
    }
  })
})
