// The items' ids, in the order the wire numbers them (items.ts has what each does). On their own,
// 2026-11-20, so that what checks a replay (replay.ts's checkReplayMeta) can know them without
// loading the item race's rules and the tracks with them.
export const ITEM_IDS = [
  'boost',
  'shield',
  'tow',
  'headwind',
  'swap',
  'hail',
  'cloud',
  'puddle',
  // 2026-11-20: appended, so that the eight before keep their numbers on the wire
  'mirror',
  'fog',
  'skip',
  'jam',
  'rally',
  'decoy',
] as const
export type ItemId = (typeof ITEM_IDS)[number]
