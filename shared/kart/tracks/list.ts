// The tracks a race room can be set to (e9-t07): ids only, so that the lobby's first load (the room
// options in shared/games/kart/info.ts) does not carry the tracks themselves. registry.ts maps each
// id to its track and its type makes the two lists agree; a new track goes in both, with its name in
// shared/games/kart/i18n.ts (`games.kart.track.<id>`).
export const RACE_TRACK_IDS = ['riverside', 'harbour', 'tamkang', 'oldstreet'] as const

export type RaceTrackId = (typeof RACE_TRACK_IDS)[number]
