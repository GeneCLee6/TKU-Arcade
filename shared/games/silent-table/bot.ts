// A computer player for 默契牌局 (2026-11-23, docs/ARCHITECTURE.md "電腦玩家"). It sees what its seat's
// browser would: its own two cards, the shared cards turned so far, and where every chip is. Nobody
// may speak, and every seat acts at once, so the room keeps a clock for each computer (`botTime`):
// a short think after anything moves, and nothing at all once it holds a chip it is content with and
// has said ready.
//
// Its strength is the share of the other two-card hands its own would beat at the end, dealt out a
// hundred or two times (with a fixed shuffle for the same cards, so the same view always reads the
// same, and kept for the next time the room asks). The chip it wants is that
// share spread over the chips: the strongest hand at the table should hold the top one.
//
// Normal takes the free chip nearest what it wants, moves only for one clearly nearer, and early in
// a round may take a chip from another seat that sits right on what it wants while its own is well
// off (only twice a round, so two computers cannot fight over one for ever). Easy judges only the
// hand it has made so far (a pair, two pair...), never looks ahead to the cards to come, and only
// ever takes from the table.
import { bestHand, fullDeck, HAND_CATEGORIES, RANKS, type Card } from '../../poker/hand.ts'
import { createRng } from '../rng.ts'
import type { Rng } from '../types.ts'
import type { SilentTableAction, SilentTableView } from './types.ts'

/** Moves a seat starts a round with (rules.ts MOVES_PER_ROUND; not imported, rules.ts imports this) */
const MOVES = 5
/** Deals of the cards still to come, before the last shared card is up (about 10 ms) */
const SIMULATIONS = 120
/** Other hands tried once every shared card is up */
const RIVER_SAMPLES = 240
/** Normal takes from a seat only with this many moves or more left: its first two of a round */
const TAKE_WHILE_MOVES = MOVES - 1
/** A short think after anything moves; a longer look at the hands shown */
const THINK_MS = { min: 900, spread: 900 }
const REVEAL_MS = 2600

/** A seed from the cards themselves: the same hand and board always deal the same way */
function seedOf(cards: readonly Card[]): number {
  let hash = 0x811c9dc5
  for (const char of cards.join('')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const strengthCache = new Map<string, number>()

/**
 * The share of another player's two cards (any not in sight) that `hole` beats at the end, ties
 * counted half, from a fixed sample of deals
 */
export function handStrength(hole: readonly Card[], board: readonly Card[]): number {
  const key = `${hole.join('')}|${board.join('')}`
  const cached = strengthCache.get(key)
  if (cached !== undefined) return cached
  const known = new Set<string>([...hole, ...board])
  const unseen = fullDeck().filter((card) => !known.has(card))
  let won = 0
  let count = 0
  const rng = createRng(seedOf([...hole, ...board]))
  const river = board.length >= 5
  const needed = 5 - board.length + 2
  // With the board complete only the other hand changes: cheaper, so more of them
  const runs = river ? RIVER_SAMPLES : SIMULATIONS
  const fixed = river ? bestHand([...hole, ...board]).score : 0
  for (let run = 0; run < runs; run++) {
    const deck = [...unseen]
    for (let index = 0; index < needed; index++) {
      const swap = index + rng.int(deck.length - index)
      ;[deck[index], deck[swap]] = [deck[swap], deck[index]]
    }
    const full = [...board, ...deck.slice(2, needed)]
    const mine = river ? fixed : bestHand([...hole, ...full]).score
    const theirs = bestHand([deck[0], deck[1], ...full]).score
    won += theirs < mine ? 1 : theirs === mine ? 0.5 : 0
    count++
  }
  const share = count > 0 ? won / count : 0.5
  if (strengthCache.size > 500) strengthCache.clear()
  strengthCache.set(key, share)
  return share
}

/** Easy's reading: the category made so far and the highest card in hand, nothing still to come */
export function madeStrength(hole: readonly Card[], board: readonly Card[]): number {
  const category = HAND_CATEGORIES.indexOf(bestHand([...hole, ...board]).category)
  const high = Math.max(...hole.map((card) => RANKS.indexOf(card[0] as (typeof RANKS)[number])))
  const steps = [0.1, 0.45, 0.68, 0.8, 0.87, 0.91, 0.95, 0.98, 0.99]
  return Math.min(1, steps[category] + (category === 0 ? (high / 12) * 0.3 : 0))
}

/** The chip, as a real number from 1 to the number of seats, this seat's strength asks for */
function wantedChip(view: SilentTableView, level: string): number | null {
  const me = view.players.find((player) => player.seat === view.you)
  if (!me?.hole || me.hole.length !== 2 || view.community.length < 3) return null
  const strength = level === 'easy' ? madeStrength(me.hole, view.community) : handStrength(me.hole, view.community)
  return 1 + strength * (view.players.length - 1)
}

/** What this seat would do now; null when it is content and has said ready (or cannot act) */
function decide(view: SilentTableView, legal: readonly SilentTableAction[], level: string): SilentTableAction | null {
  if (legal.length === 0 || view.you === null) return null
  const ready = legal.find((action) => action.type === 'ready')
  if (view.phase === 'reveal') return ready ?? null
  if (view.phase !== 'round') return null
  const me = view.players.find((player) => player.seat === view.you)
  const wanted = wantedChip(view, level)
  if (!me || wanted === null) return legal.find((action) => action.type === 'takeChip') ?? ready ?? null
  const easy = level === 'easy'
  const off = (chip: number) => Math.abs(chip - wanted)
  const free = legal.flatMap((action) => (action.type === 'takeChip' ? [action] : []))
  const nearestFree = free.reduce<(typeof free)[number] | null>(
    (found, action) => (found === null || off(action.chip) < off(found.chip) ? action : found),
    null,
  )
  // Normal, early in a round: a chip right where it wants to be, held by someone, while its own is not
  const taking = () => {
    if (easy || me.movesLeft < TAKE_WHILE_MOVES) return null
    const ownOff = me.chip === null ? (nearestFree ? off(nearestFree.chip) : Infinity) : off(me.chip)
    if (ownOff < 1.5) return null
    for (const action of legal) {
      if (action.type !== 'takeFrom') continue
      const held = view.players.find((player) => player.seat === action.seat)?.chip
      if (held != null && off(held) <= 0.5) return action
    }
    return null
  }

  if (me.chip === null) return taking() ?? nearestFree ?? null
  const margin = easy ? 1.5 : 0.6
  if (nearestFree && off(nearestFree.chip) + margin < off(me.chip)) return nearestFree
  const take = taking()
  if (take) return take
  return ready ?? null
}

/** The room's clock for this seat (`GameModule.botTime`) */
export function silentTableBotTime(
  view: SilentTableView,
  legal: readonly SilentTableAction[],
  level: string,
  rng: Rng,
): number | null {
  const action = decide(view, legal, level)
  if (action === null) return null
  return view.phase === 'reveal' ? REVEAL_MS + rng.int(THINK_MS.spread) : THINK_MS.min + rng.int(THINK_MS.spread)
}

export function silentTableBot(
  view: SilentTableView,
  legal: readonly SilentTableAction[],
  level: string,
): SilentTableAction | null {
  return decide(view, legal, level)
}
