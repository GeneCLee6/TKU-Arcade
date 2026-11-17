// The Grand Prix's cups (owner 2026-11-17, outside the roadmap; docs/ARCHITECTURE.md §4.22): a few
// races in a row against the same computer karts, points for each place, a podium at the end. The
// cups' names are working titles of our own (`kart.cup.name.<id>`, KART-WORLD.md §6.1), like every
// name in the kart's world until the owner settles them; the ids stay (the browser keeps the best
// result of each cup by id). Pure.
import type { RaceTrackId } from '../../../shared/kart/tracks/list.ts'

export const CUP_IDS = ['ebb', 'hill', 'rivermouth', 'sprint'] as const
export type CupId = (typeof CUP_IDS)[number]

export interface Cup {
  readonly id: CupId
  /** In racing order */
  readonly tracks: readonly RaceTrackId[]
  /** Only for the tests (`?autopilot`): one short race, to reach the podium quickly */
  readonly hidden?: boolean
}

export const CUPS: readonly Cup[] = [
  // The water's edge: the river bank, then the fishing harbour
  { id: 'ebb', tracks: ['riverside', 'harbour'] },
  // Up the hill and into the lanes: the campus, then the old street
  { id: 'hill', tracks: ['tamkang', 'oldstreet'] },
  // The whole river mouth, all four in a row
  { id: 'rivermouth', tracks: ['riverside', 'harbour', 'tamkang', 'oldstreet'] },
  { id: 'sprint', tracks: ['riverside'], hidden: true },
]

export const isCupId = (value: unknown): value is CupId => CUP_IDS.some((id) => id === value)

export function cupOf(id: CupId): Cup {
  return CUPS.find((cup) => cup.id === id) ?? CUPS[0]!
}

/** The cups a player can pick: the hidden test cup only with `testing` */
export const pickableCups = (testing: boolean): readonly Cup[] =>
  CUPS.filter((cup) => testing || !cup.hidden)
