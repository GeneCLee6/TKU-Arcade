// Written by `npm run kart:medals` (scripts/kart-medals.ts): do not edit by hand. Measured with the
// drivers of `npm run kart:feel`, seeds 7, 14, 21, three laps of each track (docs/KART-FEEL.md §19).
import type { MedalTimes } from './medals.ts'

export const MEDAL_TABLE: Readonly<Record<string, MedalTimes>> = {
  riverside: { laps: 3, bronze: 119.6, silver: 97.9, gold: 94.1, platinum: 87.1 },
  harbour: { laps: 3, bronze: 145.8, silver: 121.6, gold: 116.9, platinum: 114 },
  tamkang: { laps: 3, bronze: 150.8, silver: 125.2, gold: 120.3, platinum: 115.9 },
  oldstreet: { laps: 3, bronze: 117.2, silver: 92, gold: 88.4, platinum: 86.2 },
  guanyin: { laps: 3, bronze: 97, silver: 74.8, gold: 71.9, platinum: 69.7 },
  mangrove: { laps: 3, bronze: 115.4, silver: 93.8, gold: 90.1, platinum: 87.4 },
  fort: { laps: 3, bronze: 84.6, silver: 75.2, gold: 72.3, platinum: 70 },
  danhai: { laps: 3, bronze: 105.6, silver: 89.5, gold: 86, platinum: 81.2 },
  datun: { laps: 3, bronze: 137.3, silver: 115.1, gold: 110.6, platinum: 107.2 },
  wharf: { laps: 3, bronze: 127.1, silver: 106.8, gold: 91.8, platinum: 84.5 },
  lanes: { laps: 3, bronze: 103.6, silver: 83, gold: 75.7, platinum: 73.8 },
  works: { laps: 3, bronze: 127.7, silver: 105.5, gold: 89.8, platinum: 87.8 },
  zhuwei: { laps: 3, bronze: 103.8, silver: 97.1, gold: 93.3, platinum: 91.3 },
  breakwater: { laps: 3, bronze: 108.6, silver: 98, gold: 90.6, platinum: 87.7 },
  'riverside-rev': { laps: 3, bronze: 122.3, silver: 102.9, gold: 98.9, platinum: 93.9 },
  'harbour-rev': { laps: 3, bronze: 134.8, silver: 127.1, gold: 122.2, platinum: 114.6 },
  'tamkang-rev': { laps: 3, bronze: 150.5, silver: 133.1, gold: 127.9, platinum: 119.1 },
  'oldstreet-rev': { laps: 3, bronze: 118.8, silver: 102.3, gold: 98.3, platinum: 95.3 },
  'guanyin-rev': { laps: 3, bronze: 96.5, silver: 81.1, gold: 77.9, platinum: 75.7 },
  'mangrove-rev': { laps: 3, bronze: 112.7, silver: 94.7, gold: 91, platinum: 88.3 },
  'fort-rev': { laps: 3, bronze: 87, silver: 76, gold: 73, platinum: 70.2 },
  'danhai-rev': { laps: 3, bronze: 108, silver: 87.3, gold: 83.9, platinum: 80.8 },
  'datun-rev': { laps: 3, bronze: 130.8, silver: 118.4, gold: 113.8, platinum: 107.9 },
  'wharf-rev': { laps: 3, bronze: 118.8, silver: 105.8, gold: 95.4, platinum: 91.8 },
  'lanes-rev': { laps: 3, bronze: 101.3, silver: 83.6, gold: 77.3, platinum: 75.5 },
  'works-rev': { laps: 3, bronze: 126.2, silver: 106.8, gold: 102.2, platinum: 98.3 },
  'zhuwei-rev': { laps: 3, bronze: 105.9, silver: 95.5, gold: 91.5, platinum: 88.8 },
  'breakwater-rev': { laps: 3, bronze: 119, silver: 99.5, gold: 95.6, platinum: 91.8 },
  'ch-needle': { laps: 3, bronze: 60.9, silver: 57.4, gold: 45.9, platinum: 43.8 },
  'ch-hop': { laps: 3, bronze: 60.4, silver: 56.9, gold: 54.7, platinum: 53.3 },
  'ch-lock': { laps: 3, bronze: 63.5, silver: 47.1, gold: 45.2, platinum: 40.2 },
}

/**
 * The master's slowest pass of each mission driven alone (the expert's where the master never
 * passes), seconds from GO; none where neither does
 */
export const MISSION_PACE: Readonly<Record<string, number>> = {
  clean: 31.1,
  combo5: 61.5,
  perfects: 20.2,
  launch: 41,
  bike: 25.1,
  combo10: 70.9,
  hops: 67,
  slots: 31.4,
  cover: 49.6,
  roofs: 61.3,
  needle: 30.7,
  branches: 89.8,
  fog: 79.5,
  hopyard: 36.3,
  shedroof: 89.8,
  stackdry: 67.2,
  bikeneedle: 31.6,
  lockrun: 45.1,
  goldlap: 29.7,
  blindneedle: 45.9,
  combo15: 63.3,
}
