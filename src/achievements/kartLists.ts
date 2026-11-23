// 2026-11-23 (e11-t06): the kart's lists the achievements count against: vehicles, race tracks, cups,
// driving school lessons, each challenge chapter's missions. Copied, not imported: importing the kart's
// own modules into the achievements' chunks made the bundler split them out of the kart's first
// screen into chunks of their own (docs/ARCHITECTURE.md §4.82). tests/achievements/kartLists.test.ts
// fails the moment a copy and the kart's list differ, so a new kart or track is added here too.
export const KART_IDS = [
  'tide',
  'comet',
  'ray',
  'crab',
  'heron',
  'flyfish',
  'dolphin',
  'skipper',
  'shrimp',
  'marlin',
  'eel',
  'squid',
  'hermit',
  'whale',
  'swift',
  'hornet',
  'petrel',
  'pelican',
  'otter',
  'cormorant',
  'kite',
] as const

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
  'zhuwei',
  'breakwater',
] as const

export const CUP_IDS = ['ebb', 'hill', 'rivermouth', 'flood', 'backstreet', 'sprint'] as const

export const LESSON_IDS = [
  'drive',
  'drift',
  'dash',
  'perfect',
  'combo',
  'n2o',
  'start',
  'jump',
  'landing',
  'gap',
  'final',
] as const

/** Each chapter's missions, in the challenge mode's order */
export const CHAPTER_MISSIONS = {
  basics: ['clean', 'combo5', 'perfects', 'launch', 'podium', 'bike'],
  technique: ['combo10', 'hops', 'slots', 'dry', 'cover', 'roofs', 'needle', 'lockgate'],
  master: ['branches', 'fog', 'hopyard', 'knockout', 'spotless', 'shedroof', 'stackdry', 'bikeneedle', 'lockrun'],
  boss: ['chase', 'goldlap', 'blindneedle', 'drywin', 'combo15', 'lastone'],
} as const

export const CHAPTER_IDS = Object.keys(CHAPTER_MISSIONS) as (keyof typeof CHAPTER_MISSIONS)[]

/** What the kart keeps (src/kart/challenge/store.ts, school/store.ts, cup/store.ts, records.ts) */
export const KART_KEYS = {
  challenge: 'tku-arcade.kart.challenge',
  school: 'tku-arcade.kart.school',
  cupBest: 'tku-arcade.kart.cup.best.',
  bestRun: 'tku-arcade.kart.bestRun.',
  kartBestRun: 'tku-arcade.kart.kartBestRun.',
} as const

/** The kart says one of its stores changed (a medal, stars, a cup) with this window event */
export const KART_PROGRESS_EVENT = 'tku-arcade:kart-progress'
