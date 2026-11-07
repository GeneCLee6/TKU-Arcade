// Standard poker hand ranking (e4-t01): cards, the nine hand categories, and the best five out of
// five to seven cards. Written for this project; shared so another card game can use it. Pure, no
// game rules, and every value is plain JSON.

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const
export const SUITS = ['s', 'h', 'd', 'c'] as const

export type Rank = (typeof RANKS)[number]
export type Suit = (typeof SUITS)[number]

/** A rank and a suit: `As` is the ace of spades, `Td` the ten of diamonds */
export type Card = `${Rank}${Suit}`

/** Weakest first: a category's index here is its strength */
export const HAND_CATEGORIES = [
  'highCard',
  'pair',
  'twoPair',
  'threeOfAKind',
  'straight',
  'flush',
  'fullHouse',
  'fourOfAKind',
  'straightFlush',
] as const

export type HandCategory = (typeof HAND_CATEGORIES)[number]

export type Hand = {
  category: HandCategory
  /** Compare these and nothing else: a higher score beats a lower one, an equal score is a tie */
  score: number
  /** The five cards that make the hand, strongest group first */
  best: Card[]
}

const HAND_SIZE = 5
/** Base of the score's digits: one digit per tiebreak rank, each from 0 (a two) to 12 (an ace) */
const BASE = RANKS.length
const ACE = RANKS.length - 1
const FIVE = RANKS.indexOf('5')

/** All 52 cards in a fixed order, to be shuffled */
export function fullDeck(): Card[] {
  return RANKS.flatMap((rank) => SUITS.map((suit): Card => `${rank}${suit}`))
}

const rankOf = (card: Card) => RANKS.indexOf(card[0] as Rank)

/** Exactly five cards. Split from `bestHand` so the five-card tables can be checked exhaustively */
export function evaluateFive(cards: readonly Card[]): Hand {
  if (cards.length !== HAND_SIZE) throw new RangeError(`evaluateFive: ${cards.length} cards`)

  const counts = new Map<number, number>()
  for (const card of cards) counts.set(rankOf(card), (counts.get(rankOf(card)) ?? 0) + 1)
  // The ranks by how many of each, then by height: a full house reads triple first, then pair
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const ranks = groups.map(([rank]) => rank)
  const sizes = groups.map(([, size]) => size)

  const flush = cards.every((card) => card[1] === cards[0][1])
  const distinct = groups.length === HAND_SIZE
  const wheel = distinct && ranks[0] === ACE && ranks[1] === FIVE
  const straight = distinct && (wheel || ranks[0] - ranks[HAND_SIZE - 1] === HAND_SIZE - 1)

  const category = categoryOf(flush, straight, sizes)
  // A five-high straight is the lowest straight: its ace counts below the two
  const tiebreak = straight ? [wheel ? FIVE : ranks[0]] : ranks
  const digits = Array.from({ length: HAND_SIZE }, (_, index) => tiebreak[index] ?? 0)
  const score = digits.reduce(
    (total, digit) => total * BASE + digit,
    HAND_CATEGORIES.indexOf(category),
  )

  const position = (card: Card) => {
    if (wheel && rankOf(card) === ACE) return HAND_SIZE
    return ranks.indexOf(rankOf(card))
  }
  return {
    category,
    score,
    best: [...cards].sort(
      (a, b) => position(a) - position(b) || SUITS.indexOf(a[1] as Suit) - SUITS.indexOf(b[1] as Suit),
    ),
  }
}

function categoryOf(flush: boolean, straight: boolean, sizes: readonly number[]): HandCategory {
  if (flush && straight) return 'straightFlush'
  if (sizes[0] === 4) return 'fourOfAKind'
  if (sizes[0] === 3 && sizes[1] === 2) return 'fullHouse'
  if (flush) return 'flush'
  if (straight) return 'straight'
  if (sizes[0] === 3) return 'threeOfAKind'
  if (sizes[0] === 2 && sizes[1] === 2) return 'twoPair'
  if (sizes[0] === 2) return 'pair'
  return 'highCard'
}

function fives(cards: readonly Card[], from = 0, chosen: readonly Card[] = []): Card[][] {
  if (chosen.length === HAND_SIZE) return [[...chosen]]
  const choices: Card[][] = []
  for (let index = from; index < cards.length; index++) {
    choices.push(...fives(cards, index + 1, [...chosen, cards[index]]))
  }
  return choices
}

/** The strongest five out of five to seven cards. Trying every choice is at most 21 evaluations */
export function bestHand(cards: readonly Card[]): Hand {
  if (cards.length < HAND_SIZE || cards.length > 7) {
    throw new RangeError(`bestHand: ${cards.length} cards`)
  }
  return fives(cards)
    .map(evaluateFive)
    .reduce((best, hand) => (hand.score > best.score ? hand : best))
}

/** Above 0 when `a` beats `b`, below 0 when it loses, 0 on a tie: fits Array.prototype.sort */
export function compareHands(a: Hand, b: Hand): number {
  return a.score - b.score
}
