// The tiles and what makes a set, a legal table and a legal turn. Pure, and shared: the rules
// (rules.ts) decide with it, and the screen uses the same functions to mark a set that would not
// pass, so the two can never disagree. A set is a bag of tiles: its order is the screen's business.
import type { Suit, TileId, TileTable } from './types.ts'

export const TILE_COUNT = 106
export const SUITS = 4
export const TOP_NUMBER = 13
/** The two wildcards */
export const JOKERS: readonly TileId[] = [104, 105]
export const RACK_SIZE = 14
/** The opening meld: this many points, from the rack alone */
export const OPENING_POINTS = 30
/** What a wildcard left in a rack costs at the end of a round */
export const JOKER_PENALTY = 30
export const MIN_SET = 3
export const MAX_GROUP = 4

export const isTileId = (value: unknown): value is TileId =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < TILE_COUNT

export const isJoker = (tile: TileId): boolean => tile >= 104

/** Only for a numbered tile */
export const suitOf = (tile: TileId): Suit => Math.floor(tile / 26) as Suit

/** Only for a numbered tile: 1–13 */
export const numberOf = (tile: TileId): number => Math.floor((tile % 26) / 2) + 1

/** Every tile, in order */
export const allTiles = (): TileId[] => Array.from({ length: TILE_COUNT }, (_, index) => index)

/** What a tile left in a rack costs: its number, a wildcard 30 */
export const tilePenalty = (tile: TileId): number => (isJoker(tile) ? JOKER_PENALTY : numberOf(tile))

export const rackValue = (rack: readonly TileId[]): number =>
  rack.reduce((sum, tile) => sum + tilePenalty(tile), 0)

export type SetKind = 'group' | 'run'

/** A reading of a set: what it is and the number each place stands for, low to high for a run */
export type SetReading = { kind: SetKind; numbers: number[]; value: number }

/**
 * A group: 3 or 4 tiles of one number in different suits, wildcards standing in for the missing
 * suits. Null if it is not one
 */
function asGroup(set: readonly TileId[]): SetReading | null {
  if (set.length < MIN_SET || set.length > MAX_GROUP) return null
  const real = set.filter((tile) => !isJoker(tile))
  if (real.length === 0) return null
  const number = numberOf(real[0])
  if (real.some((tile) => numberOf(tile) !== number)) return null
  if (new Set(real.map(suitOf)).size !== real.length) return null
  return { kind: 'group', numbers: set.map(() => number), value: number * set.length }
}

/**
 * A run: 3 or more consecutive numbers of one suit, wildcards filling the gaps or the ends. 13 does
 * not wrap round to 1. Where the wildcards could go either way (5, 6 and a wildcard is 4–6 or
 * 5–7) the run reads as high as it can, which is what counts for the opening meld. Null if it is not
 * one
 */
function asRun(set: readonly TileId[]): SetReading | null {
  if (set.length < MIN_SET || set.length > TOP_NUMBER) return null
  const real = set.filter((tile) => !isJoker(tile))
  if (real.length === 0) return null
  const suit = suitOf(real[0])
  if (real.some((tile) => suitOf(tile) !== suit)) return null
  const numbers = real.map(numberOf)
  if (new Set(numbers).size !== numbers.length) return null
  const low = Math.min(...numbers)
  const high = Math.max(...numbers)
  if (high - low + 1 > set.length) return null
  const start = Math.min(low, TOP_NUMBER + 1 - set.length)
  const run = Array.from({ length: set.length }, (_, index) => start + index)
  return { kind: 'run', numbers: run, value: run.reduce((sum, number) => sum + number, 0) }
}

/** How a set reads, the higher-scoring reading where it is both (7 and two wildcards); null if neither */
export function readSet(set: readonly TileId[]): SetReading | null {
  const group = asGroup(set)
  const run = asRun(set)
  if (group && run) return run.value >= group.value ? run : group
  return group ?? run
}

export const isValidSet = (set: readonly TileId[]): boolean => readSet(set) !== null

/** What a set is worth toward the opening meld: the numbers its tiles stand for; 0 if invalid */
export const setValue = (set: readonly TileId[]): number => readSet(set)?.value ?? 0

/**
 * The set's tiles in the order to show them: a run low to high with each wildcard where it stands,
 * a group by suit with the wildcards last; an invalid set by suit and number
 */
export function displayOrder(set: readonly TileId[]): TileId[] {
  const reading = readSet(set)
  const jokers = set.filter(isJoker)
  const real = set.filter((tile) => !isJoker(tile)).sort((a, b) => a - b)
  if (reading?.kind === 'run') {
    const spare = [...jokers]
    return reading.numbers.map((number) => real.find((tile) => numberOf(tile) === number) ?? (spare.shift() as TileId))
  }
  if (reading?.kind === 'group') return [...real.sort((a, b) => suitOf(a) - suitOf(b)), ...jokers]
  return [...real, ...jokers]
}

/** Sorted copy, for comparing sets as bags */
const sorted = (set: readonly TileId[]): TileId[] => [...set].sort((a, b) => a - b)

/** Why a table or a turn is refused: the end of an i18n key, `games.tiles.error.<reason>` */
export type TableProblem =
  /** A tile twice, or a tile that does not exist */
  | 'badTiles'
  /** A tile of the table is missing: only a rack's tiles may be added, nothing may leave */
  | 'tableTileGone'
  /** A tile that was neither on the table nor in your rack */
  | 'notYourTile'
  /** Nothing from the rack was played */
  | 'nothingAdded'
  /** A set on the table is not a group or a run */
  | 'invalidSet'
  /** Before the opening meld, the table's sets must stay as they were */
  | 'openingTouched'
  /** The opening meld is under 30 */
  | 'openingLow'

export type TableCheck = { ok: true; added: TileId[] } | { ok: false; problem: TableProblem }

/**
 * Whether `draft` could be the table partway through a turn: every tile of `start` is still on it,
 * once; whatever else is on it comes from `rack`, once. The sets need not be valid yet. `added` is
 * what came from the rack. A wildcard taken out of a set and put in another is still on the table:
 * that is all "a retrieved wildcard must be used again this turn" asks.
 */
export function checkArrangement(start: TileTable, draft: TileTable, rack: readonly TileId[]): TableCheck {
  const onDraft = draft.flat()
  if (!onDraft.every(isTileId) || new Set(onDraft).size !== onDraft.length) return { ok: false, problem: 'badTiles' }
  const present = new Set(onDraft)
  if (start.flat().some((tile) => !present.has(tile))) return { ok: false, problem: 'tableTileGone' }
  const before = new Set(start.flat())
  const inRack = new Set(rack)
  const added = onDraft.filter((tile) => !before.has(tile))
  if (added.some((tile) => !inRack.has(tile))) return { ok: false, problem: 'notYourTile' }
  return { ok: true, added }
}

/** The opening meld's points in `draft`: the sets made only of tiles from the rack */
export function openingPoints(start: TileTable, draft: TileTable): number {
  const before = new Set(start.flat())
  return draft
    .filter((set) => set.length > 0 && set.every((tile) => !before.has(tile)))
    .reduce((sum, set) => sum + setValue(set), 0)
}

/**
 * Whether a turn may end with `draft` as the table:
 *
 * - it is a legal arrangement of the table and the rack (`checkArrangement`);
 * - at least one tile came from the rack;
 * - every set is a valid group or run;
 * - before the opening meld (`melded` false): every set that was on the table is still there exactly
 *   as it was, and the new sets, of rack tiles only, are worth 30 or more.
 */
export function checkTurn(start: TileTable, draft: TileTable, rack: readonly TileId[], melded: boolean): TableCheck {
  const arrangement = checkArrangement(start, draft, rack)
  if (!arrangement.ok) return arrangement
  if (arrangement.added.length === 0) return { ok: false, problem: 'nothingAdded' }
  if (!draft.every(isValidSet)) return { ok: false, problem: 'invalidSet' }
  if (!melded) {
    const kept = new Set(draft.map((set) => sorted(set).join(',')))
    if (start.some((set) => !kept.has(sorted(set).join(',')))) return { ok: false, problem: 'openingTouched' }
    if (openingPoints(start, draft) < OPENING_POINTS) return { ok: false, problem: 'openingLow' }
  }
  return arrangement
}

/** A table without its empty sets: what the rules keep */
export const withoutEmpty = (table: TileTable): TileTable => table.filter((set) => set.length > 0)
