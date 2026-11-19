// The tracks a race room can be set to (e9-t07): ids only, so that the lobby's first load (the room
// options in shared/games/kart/info.ts) does not carry the tracks themselves. registry.ts maps each
// id to its track and its type makes the two lists agree; a new track goes in both, with its name in
// shared/games/kart/i18n.ts (`games.kart.track.<id>`).
// 2026-11-17: Guanyin Hill Road, the first with slopes and jumps (terrain.ts)
// 2026-11-18: four more, each made to tell drivers apart (docs/KART-FEEL.md §10.1)
// 2026-11-19: two to learn by heart, with shortcuts only a technique opens (docs/KART-FEEL.md §11)
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
] as const

export type RaceTrackId = (typeof RACE_TRACK_IDS)[number]
