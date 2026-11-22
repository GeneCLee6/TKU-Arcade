// Written by `npm run kart:medals` (scripts/kart-medals.ts): do not edit by hand. Measured with the
// drivers of `npm run kart:feel`, seeds 7, 14, 21, three laps of each track (docs/KART-FEEL.md §19).
import type { MedalTimes } from './medals.ts'

export const MEDAL_TABLE: Readonly<Record<string, MedalTimes>> = {
  riverside: { laps: 3, bronze: 119.6, silver: 97.9, gold: 94.1, platinum: 87.1 },
  harbour: { laps: 3, bronze: 159.2, silver: 118.1, gold: 113.5, platinum: 108.8 },
  tamkang: { laps: 3, bronze: 150.8, silver: 125.2, gold: 120.3, platinum: 115.9 },
  oldstreet: { laps: 3, bronze: 116, silver: 94, gold: 90.3, platinum: 87.5 },
  guanyin: { laps: 3, bronze: 97, silver: 74.8, gold: 71.9, platinum: 69.7 },
  mangrove: { laps: 3, bronze: 115.4, silver: 93.8, gold: 90.1, platinum: 87.4 },
  fort: { laps: 3, bronze: 84.6, silver: 75.2, gold: 72.3, platinum: 70 },
  danhai: { laps: 3, bronze: 92.5, silver: 80.4, gold: 77.3, platinum: 71.8 },
  datun: { laps: 3, bronze: 137.3, silver: 115.1, gold: 110.6, platinum: 107.2 },
  wharf: { laps: 3, bronze: 110.9, silver: 92.2, gold: 82.9, platinum: 79.2 },
  lanes: { laps: 3, bronze: 103.6, silver: 83, gold: 75.7, platinum: 73.8 },
  works: { laps: 3, bronze: 113.7, silver: 93.5, gold: 82.3, platinum: 80.5 },
  zhuwei: { laps: 3, bronze: 103.8, silver: 97.1, gold: 93.3, platinum: 91.3 },
  'ch-needle': { laps: 3, bronze: 60.9, silver: 57.4, gold: 45.9, platinum: 43.8 },
  'ch-hop': { laps: 3, bronze: 60.4, silver: 56.9, gold: 54.7, platinum: 53.3 },
  'ch-lock': { laps: 3, bronze: 63.5, silver: 47.1, gold: 45.2, platinum: 40.2 },
}

/**
 * The master's slowest pass of each mission driven alone (the expert's where the master never
 * passes), seconds from GO; none where neither does
 */
export const MISSION_PACE: Readonly<Record<string, number>> = {
  combo5: 54.9,
  perfects: 19.3,
  launch: 41,
  bike: 25.1,
  combo10: 70.9,
  hops: 62.8,
  slots: 31.4,
  cover: 49.6,
  needle: 30.7,
  branches: 82.2,
  fog: 77.9,
  hopyard: 36.3,
  bikeneedle: 31.6,
  lockrun: 45.1,
  goldlap: 26.8,
  blindneedle: 45.9,
  combo15: 42.9,
}
