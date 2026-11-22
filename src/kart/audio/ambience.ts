// 2026-11-20 (§4.46): the world around each track, heard: waves and gulls by the sea, the night
// market's crowd and its stalls, the works' machines, wind and insects up on the hills, a crowd at
// the start and finish. Which layers each track has, and how loud the crowd is from where the kart
// is, pure so that a test can read them; ambiencePlayer.ts makes the sounds, all of them synthesised
// (no recordings).
import type { RaceTrackId } from '../../../shared/kart/tracks/list.ts'
import type { TrackThemeName } from '../../../shared/kart/track.ts'

/**
 * - `surf`: waves breaking, a swell every few seconds
 * - `gulls`: a gull's cry now and then
 * - `birds`: small birds chirping
 * - `market`: a crowd's murmur close by, a stall's bell, a wok's sizzle
 * - `traffic`: a town's distant hum, a car passing now and then
 * - `machines`: a low hum, a press thumping, a hiss of steam
 * - `wind`: wind over a hill, rising and falling
 * - `insects`: cicadas by day, crickets at night
 */
export type AmbienceLayer =
  | 'surf'
  | 'gulls'
  | 'birds'
  | 'market'
  | 'traffic'
  | 'machines'
  | 'wind'
  | 'insects'

export interface AmbienceRecipe {
  /** Each layer and how loud, 0 to 1 */
  readonly layers: Partial<Record<AmbienceLayer, number>>
  /** The crowd at the start and finish, at its loudest (it fades with the distance) */
  readonly crowd: number
}

export const TRACK_AMBIENCE: Record<RaceTrackId, AmbienceRecipe> = {
  riverside: { layers: { surf: 0.35, birds: 0.6 }, crowd: 1 },
  harbour: { layers: { surf: 0.9, gulls: 0.8 }, crowd: 0.9 },
  tamkang: { layers: { birds: 0.7, wind: 0.3 }, crowd: 1 },
  oldstreet: { layers: { market: 1, insects: 0.25 }, crowd: 0.8 },
  guanyin: { layers: { wind: 0.8, insects: 0.6 }, crowd: 0.7 },
  mangrove: { layers: { surf: 0.3, birds: 0.8, insects: 0.4 }, crowd: 0.8 },
  fort: { layers: { wind: 0.6, gulls: 0.4 }, crowd: 0.9 },
  danhai: { layers: { traffic: 0.8, insects: 0.45 }, crowd: 0.9 },
  datun: { layers: { wind: 1, insects: 0.5 }, crowd: 0.6 },
  wharf: { layers: { surf: 0.6, gulls: 0.6, machines: 0.35 }, crowd: 0.8 },
  lanes: { layers: { wind: 0.35, insects: 0.5, birds: 0.4 }, crowd: 0.8 },
  works: { layers: { machines: 1, wind: 0.2 }, crowd: 0.8 },
  // 2026-11-22: the river under the line, the trains and the traffic over it
  zhuwei: { layers: { surf: 0.3, traffic: 0.7, wind: 0.3 }, crowd: 0.8 },
}

const THEME_AMBIENCE: Record<TrackThemeName, AmbienceRecipe> = {
  day: { layers: { birds: 0.6, wind: 0.3 }, crowd: 0.9 },
  sunset: { layers: { surf: 0.5, gulls: 0.4 }, crowd: 0.9 },
  campus: { layers: { birds: 0.7, wind: 0.3 }, crowd: 0.9 },
  night: { layers: { traffic: 0.5, insects: 0.5 }, crowd: 0.8 },
}

export function ambienceFor(track: { readonly id: string; readonly theme?: TrackThemeName }): AmbienceRecipe {
  const own = (TRACK_AMBIENCE as Record<string, AmbienceRecipe | undefined>)[track.id]
  return own ?? THEME_AMBIENCE[track.theme ?? 'day']
}

/** Within this many metres of the start line the crowd is at its loudest; past `CROWD_GONE`, silent */
export const CROWD_NEAR = 35
export const CROWD_GONE = 170

/** How loud the crowd is `distance` metres from the line, 0 to 1: full near, fading smoothly out */
export function crowdLevel(distance: number): number {
  if (distance <= CROWD_NEAR) return 1
  if (distance >= CROWD_GONE) return 0
  const share = 1 - (distance - CROWD_NEAR) / (CROWD_GONE - CROWD_NEAR)
  return share * share * (3 - 2 * share)
}

/** Seconds to the next occasional sound of a layer (a gull, a bell, a car): random within a range */
export function nextIn(layer: AmbienceLayer, random: () => number): number {
  const [low, high] = OCCASIONAL[layer] ?? [4, 9]
  return low + (high - low) * random()
}

const OCCASIONAL: Partial<Record<AmbienceLayer, readonly [number, number]>> = {
  gulls: [3, 8],
  birds: [1.2, 4],
  market: [1.5, 4],
  traffic: [4, 10],
  machines: [1.6, 1.6],
}
