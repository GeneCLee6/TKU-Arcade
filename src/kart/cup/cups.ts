// The Grand Prix's cups (owner 2026-11-17, outside the roadmap; docs/ARCHITECTURE.md §4.24): a few
// races in a row against the same computer karts, points for each place, a podium at the end. The
// cups' names are working titles of our own (`kart.cup.name.<id>`, KART-WORLD.md §6.1), like every
// name in the kart's world until the owner settles them; the ids stay (the browser keeps the best
// result of each cup by id). Pure.
import type { RaceTrackId } from '../../../shared/kart/tracks/list.ts'

export const CUP_IDS = ['ebb', 'hill', 'rivermouth', 'flood', 'backstreet', 'sprint'] as const
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
  // 2026-11-18: the tide comes in. The four technical tracks, the easiest first and the expert's last
  { id: 'flood', tracks: ['mangrove', 'danhai', 'fort', 'datun'] },
  // 2026-11-19: the tracks with a way round only those who know them take: the night circuit's
  // lane, then the two to learn by heart (docs/KART-FEEL.md §11)
  // 2026-11-20: and the works, whose shortcuts are roads of their own (docs/KART-FEEL.md §14)
  // 2026-11-22: and the technical showcase, over and under itself (shared/kart/levels.ts)
  { id: 'backstreet', tracks: ['danhai', 'wharf', 'lanes', 'works', 'zhuwei'] },
  { id: 'sprint', tracks: ['riverside'], hidden: true },
]

export const isCupId = (value: unknown): value is CupId => CUP_IDS.some((id) => id === value)

export function cupOf(id: CupId): Cup {
  return CUPS.find((cup) => cup.id === id) ?? CUPS[0]!
}

/** The cups a player can pick: the hidden test cup only with `testing` */
export const pickableCups = (testing: boolean): readonly Cup[] =>
  CUPS.filter((cup) => testing || !cup.hidden)
