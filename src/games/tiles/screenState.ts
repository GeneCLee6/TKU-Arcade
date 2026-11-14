// What the screen makes of a view: the table to draw, what is left in your rack, how a move changes
// the draft, what to tell whom. Kept apart from the looks so that it can be tested without a
// browser. It only reads `view` and sends drafts: the server checks every one of them.
import type { SeatId } from '../../../shared/games/types.ts'
import { isJoker, numberOf, suitOf } from '../../../shared/games/tiles/tiles.ts'
import type { TileId, TilesView, TileTable } from '../../../shared/games/tiles/types.ts'
import type { TextKey } from '../../i18n/t.ts'

export type RackSort = 'number' | 'suit'

/** Your rack in the order you asked for; wildcards last either way */
export function sortRack(rack: readonly TileId[], by: RackSort): TileId[] {
  const key = (tile: TileId): number => {
    if (isJoker(tile)) return 10_000 + tile
    return by === 'number' ? numberOf(tile) * 10 + suitOf(tile) : suitOf(tile) * 100 + numberOf(tile)
  }
  return [...rack].sort((a, b) => key(a) - key(b) || a - b)
}

/** The tiles of your rack that are not in the draft */
export function rackLeft(rack: readonly TileId[], table: TileTable): TileId[] {
  const placed = new Set(table.flat())
  return rack.filter((tile) => !placed.has(tile))
}

/** Where selected tiles go: a set by its place on the table, a new set, or back to the rack */
export type MoveTarget = number | 'new' | 'rack'

/**
 * The draft after moving `tiles` to `target`. A tile from a set leaves it, a tile from the rack is
 * simply added; sets left empty go. Back to the rack takes only tiles that came from it this turn
 * (`start` is the table as the turn began): a table tile asked to go there stays where it is.
 */
export function moveTiles(table: TileTable, start: TileTable, tiles: readonly TileId[], target: MoveTarget): TileTable {
  const fromTable = new Set(start.flat())
  const moving = target === 'rack' ? tiles.filter((tile) => !fromTable.has(tile)) : [...tiles]
  if (moving.length === 0) return table
  const gone = new Set(moving)
  const kept = table.map((set) => set.filter((tile) => !gone.has(tile)))
  if (typeof target === 'number' && target >= 0 && target < kept.length) {
    kept[target] = [...kept[target], ...moving]
  } else if (target !== 'rack') {
    kept.push(moving)
  }
  return kept.filter((set) => set.length > 0)
}

/** The tiles on the draft that were not on the table when the turn began: laid this turn */
export function laidThisTurn(table: TileTable, start: TileTable): Set<TileId> {
  const before = new Set(start.flat())
  return new Set(table.flat().filter((tile) => !before.has(tile)))
}

/**
 * Whether a set may take tiles now: anything, once you have made your first play; before it, only
 * a set you are building this turn (a set that was on the table must stay as it was)
 */
export const canTarget = (set: readonly TileId[], start: TileTable, melded: boolean): boolean =>
  melded || set.every((tile) => !start.flat().includes(tile))

/** Whether a tile on the table can be picked up: yours from this turn always, the rest once melded */
export const canPick = (tile: TileId, start: TileTable, melded: boolean): boolean =>
  melded || !start.flat().includes(tile)

/** The dock's main line: what you should be doing now, and the name it needs */
export function promptOf(
  view: TilesView,
  nameOf: (seat: SeatId) => string,
): { key: TextKey; name?: string } {
  if (view.phase === 'over') return { key: 'games.tiles.ui.prompt.over' }
  if (view.phase === 'scored') return { key: 'games.tiles.ui.prompt.scored' }
  if (view.you !== null && view.you === view.turn) {
    const melded = view.seats.find((seat) => seat.seat === view.you)?.melded ?? false
    return { key: melded ? 'games.tiles.ui.prompt.yours' : 'games.tiles.ui.prompt.opening' }
  }
  return {
    key: view.draft === null ? 'games.tiles.ui.prompt.wait' : 'games.tiles.ui.prompt.moving',
    name: nameOf(view.turn),
  }
}

/** The line about what just happened */
export function eventOf(view: TilesView, nameOf: (seat: SeatId) => string): { key: TextKey; params: Record<string, string | number> } | null {
  const last = view.last
  if (last === null) return null
  const name = nameOf(last.seat)
  if (last.kind === 'played') {
    return {
      key: last.first ? 'games.tiles.ui.event.playedFirst' : 'games.tiles.ui.event.played',
      params: { name, tiles: last.tiles },
    }
  }
  return { key: `games.tiles.ui.event.${last.kind}.${last.why}` as TextKey, params: { name } }
}

/** This turn, as a key: a new turn (or round) throws away what the screen kept of the last one */
export const turnKey = (view: TilesView): string => `${view.round}-${view.turnNo}-${view.phase}`
