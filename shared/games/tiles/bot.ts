// A computer player for 社辦牌陣 (2026-11-21, docs/ARCHITECTURE.md "電腦玩家"). It sees what its seat's
// browser would: its own rack, the table, and how many tiles everyone holds.
//
// Both levels look for the most tiles they can lay down from their rack alone, as groups and runs
// (wildcards filling a gap or an end), and the first time only a play worth 30 or more. The search
// tries, for the lowest tile still unplaced, every set it could be part of and leaving it in the
// rack, and keeps the best it has seen; it stops after a fixed number of steps (and, should a slow
// machine take longer, after 50 ms), so the room never waits on it. Normal then lays off what it can
// on the sets already on the table, one tile at a time, as long as every set stays valid. Whatever
// it finds is checked with the rules' own `checkTurn` before it is sent; when there is nothing, it
// draws.
import type { Rng } from '../types.ts'
import { checkTurn, isJoker, isValidSet, numberOf, OPENING_POINTS, suitOf, SUITS, TOP_NUMBER } from './tiles.ts'
import type { TileId, TilesAction, TilesView, TileTable } from './types.ts'

/** Steps the search may take: enough for any rack in practice, few enough to be quick */
const STEPS = { normal: 40_000, easy: 6_000 } as const
/** And never longer than this, in ms */
export const BOT_BUDGET_MS = 50

const KEYS = SUITS * TOP_NUMBER
const key = (suit: number, number: number) => suit * TOP_NUMBER + number - 1
const JOKER = -1

/** A set the rack could make: the keys it needs (a suit and number each, or a wildcard) and its points */
type Pattern = { keys: number[]; value: number; size: number }

/** Every group and run the rack's tiles could make, wildcards filling at most what the rack has */
function patterns(counts: readonly number[], jokers: number): Pattern[] {
  const out: Pattern[] = []
  for (let suit = 0; suit < SUITS; suit++) {
    for (let low = 1; low <= TOP_NUMBER - 2; low++) {
      for (let high = low + 2; high <= TOP_NUMBER; high++) {
        const keys: number[] = []
        let missing = 0
        for (let number = low; number <= high; number++) {
          const at = key(suit, number)
          if (counts[at] > 0) keys.push(at)
          else {
            keys.push(JOKER)
            missing++
          }
        }
        // A wildcard or two may fill a run, but the run needs two tiles of its own
        if (missing > jokers || keys.length - missing < 2) {
          if (missing > jokers) break
          continue
        }
        let value = 0
        for (let number = low; number <= high; number++) value += number
        out.push({ keys, value, size: keys.length })
      }
    }
  }
  for (let number = 1; number <= TOP_NUMBER; number++) {
    const have = [0, 1, 2, 3].filter((suit) => counts[key(suit, number)] > 0)
    const subsets = [[0, 1, 2, 3], [0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]
    for (const suits of subsets) {
      const real = suits.filter((suit) => have.includes(suit))
      const missing = suits.length - real.length
      if (missing > jokers || real.length < 2) continue
      out.push({
        keys: [...real.map((suit) => key(suit, number)), ...Array<number>(missing).fill(JOKER)],
        value: number * suits.length,
        size: suits.length,
      })
    }
  }
  // Bigger sets first: the search finds a good answer early
  return out.sort((a, b) => b.size - a.size || b.value - a.value)
}

/**
 * The most tiles `rack` can lay down in sets of its own: the patterns chosen. With `opening`, only
 * a choice worth 30 or more counts
 */
export function rackMelds(rack: readonly TileId[], opening: boolean, steps: number, budgetMs = BOT_BUDGET_MS): TileId[][] {
  const counts = new Array<number>(KEYS).fill(0)
  const byKey: TileId[][] = Array.from({ length: KEYS }, () => [])
  const jokerTiles: TileId[] = []
  for (const tile of rack) {
    if (isJoker(tile)) jokerTiles.push(tile)
    else {
      const at = key(suitOf(tile), numberOf(tile))
      counts[at]++
      byKey[at].push(tile)
    }
  }
  const all = patterns(counts, jokerTiles.length)
  const withKey: Pattern[][] = Array.from({ length: KEYS }, () => [])
  for (const pattern of all) {
    // Indexed by its lowest key: the search places tiles in key order
    withKey[Math.min(...pattern.keys.filter((one) => one !== JOKER))].push(pattern)
  }

  const avail = [...counts]
  let jokersLeft = jokerTiles.length
  const chosen: Pattern[] = []
  let bestScore = -1
  let bestChoice: Pattern[] = []
  let used = 0
  const started = Date.now()
  let stop = false

  const leaf = () => {
    let tiles = 0
    let value = 0
    for (const pattern of chosen) {
      tiles += pattern.size
      value += pattern.value
    }
    if (opening && value < OPENING_POINTS) return
    const score = tiles * 1000 + value
    if (score > bestScore) {
      bestScore = score
      bestChoice = [...chosen]
    }
  }

  const search = (from: number) => {
    if (stop) return
    if (++used > steps || (used % 512 === 0 && Date.now() - started > budgetMs)) {
      stop = true
      return
    }
    let at = from
    while (at < KEYS && avail[at] === 0) at++
    if (at >= KEYS) {
      leaf()
      return
    }
    for (const pattern of withKey[at]) {
      let jokersNeeded = 0
      let fits = true
      for (const one of pattern.keys) {
        if (one === JOKER) jokersNeeded++
        else if (avail[one] === 0) fits = false
      }
      if (!fits || jokersNeeded > jokersLeft) continue
      for (const one of pattern.keys) if (one !== JOKER) avail[one]--
      jokersLeft -= jokersNeeded
      chosen.push(pattern)
      search(at)
      chosen.pop()
      jokersLeft += jokersNeeded
      for (const one of pattern.keys) if (one !== JOKER) avail[one]++
      if (stop) return
    }
    // Or this tile stays in the rack
    avail[at]--
    search(at)
    avail[at]++
  }
  search(0)

  // The patterns as real tiles
  const next = byKey.map((tiles) => [...tiles])
  const spare = [...jokerTiles]
  return bestChoice.map((pattern) =>
    pattern.keys.map((one) => (one === JOKER ? (spare.shift() as TileId) : (next[one].shift() as TileId))),
  )
}

/** Lays off what it can of `rack` on `table`'s sets, one tile at a time; wildcards only to go out */
export function layOff(table: TileTable, rack: readonly TileId[]): { table: TileTable; rack: TileId[] } {
  const sets = table.map((set) => [...set])
  let left = [...rack]
  let moved = true
  while (moved) {
    moved = false
    for (const tile of left) {
      if (isJoker(tile) && left.some((other) => !isJoker(other))) continue
      const into = sets.find((set) => isValidSet([...set, tile]))
      if (into) {
        into.push(tile)
        left = left.filter((other) => other !== tile)
        moved = true
        break
      }
    }
  }
  return { table: sets, rack: left }
}

export function tilesBot(view: TilesView, legal: readonly TilesAction[], level: string, _rng: Rng): TilesAction | null {
  if (view.phase !== 'play' || view.you === null || view.turn !== view.you || !view.rack || legal.length === 0) return null
  const melded = view.seats.find((seat) => seat.seat === view.you)?.melded ?? false
  const draw: TilesAction = legal.some((one) => one.type === 'draw') ? { type: 'draw' } : legal[0]
  const normal = level !== 'easy'
  const start = view.table
  const melds = rackMelds(view.rack, !melded, normal ? STEPS.normal : STEPS.easy)
  const placed = new Set(melds.flat())
  let table: TileTable = [...start.map((set) => [...set]), ...melds]
  if (normal && melded) table = layOff(table, view.rack.filter((tile) => !placed.has(tile))).table
  else if (normal && melds.length > 0) {
    // The opening turn: the table's own sets stay as they were, but its new ones may take more
    const mine = layOff(melds, view.rack.filter((tile) => !placed.has(tile))).table
    table = [...start.map((set) => [...set]), ...mine]
  }
  if (table.flat().length === start.flat().length) return draw
  if (checkTurn(start, table, view.rack, melded).ok) return { type: 'commit', sets: table }
  // Should a lay-off have spoilt it, the rack's own sets alone
  const plain = [...start, ...melds]
  if (melds.length > 0 && checkTurn(start, plain, view.rack, melded).ok) return { type: 'commit', sets: plain }
  return draw
}
