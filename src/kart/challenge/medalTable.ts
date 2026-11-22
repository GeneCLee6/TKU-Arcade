// Written by `npm run kart:medals` (scripts/kart-medals.ts): do not edit by hand. Measured with the
// drivers of `npm run kart:feel`, seeds 7, 14, 21, three laps of each track (docs/KART-FEEL.md §19).
import type { MedalTimes } from './medals.ts'

export const MEDAL_TABLE: Readonly<Record<string, MedalTimes>> = {
  riverside: { laps: 3, bronze: 132.9, silver: 95.8, gold: 92.1, platinum: 87.7 },
  harbour: { laps: 3, bronze: 131.8, silver: 114.6, gold: 110.1, platinum: 104.1 },
  tamkang: { laps: 3, bronze: 156.4, silver: 126.6, gold: 121.7, platinum: 115.7 },
  oldstreet: { laps: 3, bronze: 112.4, silver: 93.8, gold: 90.1, platinum: 87.8 },
  guanyin: { laps: 3, bronze: 92.4, silver: 75.8, gold: 72.8, platinum: 70.6 },
  mangrove: { laps: 3, bronze: 129.2, silver: 95.1, gold: 91.4, platinum: 86.4 },
  fort: { laps: 3, bronze: 87.2, silver: 78.5, gold: 75.4, platinum: 71 },
  danhai: { laps: 3, bronze: 94.9, silver: 82.1, gold: 78.9, platinum: 74 },
  datun: { laps: 3, bronze: 133.1, silver: 116.5, gold: 112, platinum: 107.5 },
  wharf: { laps: 3, bronze: 114.2, silver: 92.3, gold: 81.4, platinum: 77.5 },
  lanes: { laps: 3, bronze: 106.6, silver: 83, gold: 75.7, platinum: 73.7 },
  works: { laps: 3, bronze: 109.8, silver: 94.6, gold: 82.3, platinum: 80.5 },
  zhuwei: { laps: 3, bronze: 103.2, silver: 97.3, gold: 93.5, platinum: 91.2 },
  'ch-needle': { laps: 3, bronze: 64.3, silver: 60.6, gold: 48.2, platinum: 45.5 },
  'ch-hop': { laps: 3, bronze: 61, silver: 57.1, gold: 54.9, platinum: 53.5 },
}

/**
 * The master's slowest pass of each mission driven alone (the expert's where the master never
 * passes), seconds from GO; none where neither does
 */
export const MISSION_PACE: Readonly<Record<string, number>> = {
  combo5: 36.6,
  perfects: 19.3,
  launch: 41,
  bike: 25,
  combo10: 70.2,
  hops: 59.4,
  slots: 31.4,
  cover: 50.4,
  needle: 32.2,
  branches: 82.2,
  fog: 74,
  hopyard: 36.9,
  bikeneedle: 33.5,
  goldlap: 26.5,
  blindneedle: 48.1,
  combo15: 71.7,
}
