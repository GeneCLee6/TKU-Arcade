// 2026-11-21 (owner: "which kart is quickest on which track?"; docs/KART-META.md): what the garage
// and the track menu recommend, track by track. Static: copied from `npm run kart:meta` (the master
// driver, every vehicle, the median of nine races on each built-in track; scripts/kart/meta.ts),
// and checked against it by tests/kart/meta.test.ts's shape tests only (the races take minutes, so
// the test does not drive them). Run the script again after any change to the karts or the physics,
// and copy its table here and into docs/KART-META.md.
import type { KartId } from './karts.ts'

/** What a track asks of a vehicle, from its road (scripts/kart/meta.ts's trackTraits) */
export const TRACK_CHARACTERS = ['technical', 'fast', 'climb', 'descent', 'flat'] as const
export type TrackCharacter = (typeof TRACK_CHARACTERS)[number]

export interface TrackMeta {
  /** The quickest three, the season flagship aside, quickest first */
  readonly podium: readonly [KartId, KartId, KartId]
  /** What the track asks of a vehicle: one or two words */
  readonly character: readonly TrackCharacter[]
}

/** By track id: the built-in tracks `npm run kart:feel` drives */
export const TRACK_META: Readonly<Record<string, TrackMeta>> = {
  riverside: { podium: ['shrimp', 'heron', 'squid'], character: ['fast', 'descent'] },
  harbour: { podium: ['marlin', 'swift', 'hornet'], character: ['fast'] },
  tamkang: { podium: ['heron', 'shrimp', 'marlin'], character: ['fast'] },
  oldstreet: { podium: ['dolphin', 'marlin', 'otter'], character: ['fast'] },
  guanyin: { podium: ['petrel', 'heron', 'swift'], character: ['fast', 'climb'] },
  mangrove: { podium: ['heron', 'skipper', 'marlin'], character: ['technical', 'flat'] },
  fort: { podium: ['hornet', 'comet', 'pelican'], character: ['technical', 'climb'] },
  // 2026-11-23 (`npm run kart:meta -- --tracks wharf,works,danhai,breakwater`): the podiums of the
  // four tracks with a high platform (shared/kart/ledges.ts), the master flying onto them
  danhai: { podium: ['dolphin', 'pelican', 'ray'], character: ['technical'] },
  datun: { podium: ['dolphin', 'marlin', 'otter'], character: ['technical'] },
  wharf: { podium: ['shrimp', 'marlin', 'otter'], character: ['descent'] },
  lanes: { podium: ['dolphin', 'marlin', 'tide'], character: ['fast', 'descent'] },
  works: { podium: ['dolphin', 'otter', 'swift'], character: ['technical'] },
  // 2026-11-22: the technical showcase (`npm run kart:meta -- --tracks zhuwei`): wide bends, long arms
  zhuwei: { podium: ['heron', 'dolphin', 'marlin'], character: ['fast'] },
  // 2026-11-23: three high platforms; the fastest kart (the egret, speed +2) on top
  breakwater: { podium: ['heron', 'ray', 'dolphin'], character: ['fast'] },
  // 2026-11-23 (#131, `npm run kart:meta -- --tracks <id>-rev,...`, two batches): the reversed
  // tracks (shared/kart/tracks/reverse.ts; wharf, lanes, works and zhuwei again with their guides,
  // reverseGuides.ts, 2026-11-23); their character is the original's, a climb now a descent
  // and a descent a climb
  'riverside-rev': { podium: ['marlin', 'whale', 'skipper'], character: ['fast', 'climb'] },
  'harbour-rev': { podium: ['hornet', 'heron', 'otter'], character: ['fast'] },
  'tamkang-rev': { podium: ['marlin', 'heron', 'shrimp'], character: ['fast'] },
  'oldstreet-rev': { podium: ['marlin', 'whale', 'dolphin'], character: ['fast'] },
  'guanyin-rev': { podium: ['heron', 'shrimp', 'marlin'], character: ['fast', 'descent'] },
  'mangrove-rev': { podium: ['heron', 'shrimp', 'marlin'], character: ['technical', 'flat'] },
  'fort-rev': { podium: ['heron', 'dolphin', 'shrimp'], character: ['technical', 'descent'] },
  'danhai-rev': { podium: ['ray', 'comet', 'pelican'], character: ['technical'] },
  'datun-rev': { podium: ['hornet', 'ray', 'hermit'], character: ['technical'] },
  'wharf-rev': { podium: ['eel', 'dolphin', 'hermit'], character: ['climb'] },
  'lanes-rev': { podium: ['dolphin', 'ray', 'pelican'], character: ['fast', 'climb'] },
  'works-rev': { podium: ['comet', 'crab', 'hermit'], character: ['technical'] },
  'zhuwei-rev': { podium: ['heron', 'shrimp', 'squid'], character: ['fast'] },
  'breakwater-rev': { podium: ['hermit', 'comet', 'crab'], character: ['fast'] },
}

/** A track's recommendations, or null for one without (a custom track, the test oval) */
export const trackMeta = (track: string | undefined | null): TrackMeta | null =>
  (track && TRACK_META[track]) || null
