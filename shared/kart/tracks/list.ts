// The tracks a race room can be set to (e9-t07): ids only, so that the lobby's first load (the room
// options in shared/games/kart/info.ts) does not carry the tracks themselves. registry.ts maps each
// id to its track and its type makes the two lists agree; a new track goes in both, with its name in
// shared/games/kart/i18n.ts (`games.kart.track.<id>`).
// 2026-11-17: Guanyin Hill Road, the first with slopes and jumps (terrain.ts)
// 2026-11-18: four more, each made to tell drivers apart (docs/KART-FEEL.md §10.1)
// 2026-11-19: two to learn by heart, with shortcuts only a technique opens (docs/KART-FEEL.md §11)
// 2026-11-20: a third, the first with real branches (shared/kart/branches.ts, docs/KART-FEEL.md §14)
export const RACE_TRACK_IDS = [
  'riverside',
  'harbour',
  'tamkang',
  'oldstreet',
  'guanyin',
  'mangrove',
  'fort',
  'danhai',
  'datun',
  'wharf',
  'lanes',
  'works',
  // 2026-11-22: the technical showcase, a figure of eight over itself (shared/kart/levels.ts)
  'zhuwei',
  // 2026-11-23: the high-platform track, three roofs beside the road (shared/kart/ledges.ts)
  'breakwater',
] as const

export type RaceTrackId = (typeof RACE_TRACK_IDS)[number]

// 2026-11-23 (#131): the tracks driven the other way round (reverse.ts), each its own id, the
// original's with `-rev`: its own records, ghost, board and medals. Only those that pass every check
// the originals do (docs/KART-WORLD.md §7 has which, and why the others are left out)
export const REVERSE_TRACK_IDS = [
  'riverside-rev',
  'harbour-rev',
  'tamkang-rev',
  'oldstreet-rev',
  'guanyin-rev',
  'mangrove-rev',
  'fort-rev',
  'danhai-rev',
  'datun-rev',
  'wharf-rev',
  'lanes-rev',
  'works-rev',
  'zhuwei-rev',
  'breakwater-rev',
] as const satisfies readonly `${RaceTrackId}-rev`[]

export type ReverseTrackId = (typeof REVERSE_TRACK_IDS)[number]
/** Every track a race can be set to: the originals, then the reversed ones */
export type AnyRaceTrackId = RaceTrackId | ReverseTrackId
export const ALL_RACE_TRACK_IDS: readonly AnyRaceTrackId[] = [...RACE_TRACK_IDS, ...REVERSE_TRACK_IDS]
export const isRaceTrackId = (value: unknown): value is AnyRaceTrackId =>
  typeof value === 'string' && (ALL_RACE_TRACK_IDS as readonly string[]).includes(value)
