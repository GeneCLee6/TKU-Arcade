// 2026-11-23 (e11-t06, AC-11.3; docs/ARCHITECTURE.md §4.82): every achievement, as data. A rule
// names a counter or a tally of the stats (stats.ts) and how far it must get; `evaluate` is the one
// function that reads them. The words are the rule's id under `ach.rule.` (shared/achievements/
// i18n.ts), original in both languages: no other game's achievement names.
//
// An id is forever (the store keeps unlocks by it, an account will too): a rule can be reworded or
// retuned, never renumbered. Loaded with the engine, never in a first screen.
import { GAME_META } from '../../shared/games/lobby.ts'
import { CHAPTER_IDS, CUP_IDS, KART_IDS, LESSON_IDS, RACE_TRACK_IDS } from './kartLists.ts'
import type { Stats } from './stats.ts'

export type Category = 'kart' | 'board' | 'platform'
export const CATEGORIES: readonly Category[] = ['kart', 'board', 'platform']

/**
 * What unlocks it: a counter at least `min`; or a tally with every one of `all` in it, or `has` in
 * it, or at least `min` ids in it (each counted once, however often)
 */
export type Condition =
  | { readonly n: string; readonly min: number }
  | { readonly t: string; readonly all: readonly string[] }
  | { readonly t: string; readonly has: string }
  | { readonly t: string; readonly min: number }

export interface Rule {
  readonly id: string
  readonly category: Category
  readonly when: Condition
  /** 1 to 3: how hard, the badge's metal */
  readonly tier: 1 | 2 | 3
  /** Shown as "?" until unlocked */
  readonly hidden?: true
  /** A board game the words name (`{game}`): its lobby name */
  readonly game?: string
}

/** The board games in the lobby (the kart is its own category; the template is not listed) */
export const BOARD_GAMES: readonly string[] = Object.entries(GAME_META)
  .filter(([id, meta]) => id !== 'kart' && !('unlisted' in meta && meta.unlisted))
  .map(([id]) => id)

/** Board games won outright, each with its own first-win badge */
const FIRST_WINS = [
  'promotion',
  'spectrum',
  'bluff',
  'tiles',
  'traders',
  'secret-scroll',
  'wasabi',
  'palace',
  'holdem',
  'misery',
  'word-bridge',
] as const

export const RULES: readonly Rule[] = [
  // ── The kart ──────────────────────────────────────────────────────────────────────────────
  { id: 'kart-first-finish', category: 'kart', tier: 1, when: { n: 'kart.finishes', min: 1 } },
  { id: 'kart-finish-25', category: 'kart', tier: 2, when: { n: 'kart.finishes', min: 25 } },
  { id: 'kart-perfect-start', category: 'kart', tier: 1, when: { n: 'kart.perfectStarts', min: 1 } },
  { id: 'kart-perfect-start-10', category: 'kart', tier: 2, when: { n: 'kart.perfectStarts', min: 10 } },
  { id: 'kart-combo-10', category: 'kart', tier: 2, when: { n: 'kart.maxCombo', min: 10 } },
  { id: 'kart-combo-15', category: 'kart', tier: 3, hidden: true, when: { n: 'kart.maxCombo', min: 15 } },
  { id: 'kart-cover-70', category: 'kart', tier: 3, when: { n: 'kart.maxCover', min: 70 } },
  { id: 'kart-drift-jump-5', category: 'kart', tier: 2, when: { n: 'kart.driftJumps', min: 5 } },
  { id: 'kart-platform', category: 'kart', tier: 2, when: { n: 'kart.platforms', min: 1 } },
  { id: 'kart-gap', category: 'kart', tier: 2, when: { n: 'kart.gaps', min: 1 } },
  { id: 'kart-fork', category: 'kart', tier: 1, when: { n: 'kart.forks', min: 1 } },
  { id: 'kart-gold', category: 'kart', tier: 2, when: { n: 'kart.gold', min: 1 } },
  { id: 'kart-platinum', category: 'kart', tier: 3, when: { n: 'kart.platinum', min: 1 } },
  { id: 'kart-school-all', category: 'kart', tier: 3, when: { t: 'kart.school3', all: LESSON_IDS } },
  ...CHAPTER_IDS.map(
    (chapter, index): Rule => ({
      id: `kart-chapter-${chapter}`,
      category: 'kart',
      tier: index === 0 ? 1 : index === 1 ? 2 : 3,
      ...(chapter === 'boss' ? { hidden: true as const } : {}),
      when: { t: 'kart.chapters', has: chapter },
    }),
  ),
  { id: 'kart-first-win', category: 'kart', tier: 1, when: { n: 'kart.wins', min: 1 } },
  { id: 'kart-expert-win', category: 'kart', tier: 3, when: { n: 'kart.expertWins', min: 1 } },
  { id: 'kart-cup-win', category: 'kart', tier: 2, when: { t: 'kart.cupsWon', min: 1 } },
  { id: 'kart-cup-all', category: 'kart', tier: 3, when: { t: 'kart.cupsWon', all: CUP_IDS } },
  { id: 'kart-high-tide', category: 'kart', tier: 1, when: { n: 'kart.highTides', min: 1 } },
  { id: 'kart-team-win', category: 'kart', tier: 2, when: { n: 'kart.teamWins', min: 1 } },
  { id: 'kart-all-karts', category: 'kart', tier: 3, when: { t: 'kart.karts', all: KART_IDS } },
  { id: 'kart-all-tracks', category: 'kart', tier: 3, when: { t: 'kart.tracks', all: RACE_TRACK_IDS } },
  { id: 'kart-leaderboard', category: 'kart', tier: 2, when: { n: 'kart.leaderboard', min: 1 } },
  { id: 'kart-boost-10min', category: 'kart', tier: 2, when: { n: 'kart.boostMs', min: 600_000 } },

  // ── Board games ───────────────────────────────────────────────────────────────────────────
  { id: 'board-first-win', category: 'board', tier: 1, when: { n: 'board.wins', min: 1 } },
  { id: 'board-wins-10', category: 'board', tier: 2, when: { n: 'board.wins', min: 10 } },
  { id: 'board-streak-3', category: 'board', tier: 2, when: { n: 'board.maxStreak', min: 3 } },
  { id: 'board-streak-5', category: 'board', tier: 3, hidden: true, when: { n: 'board.maxStreak', min: 5 } },
  { id: 'board-bot-normal', category: 'board', tier: 1, when: { n: 'board.botWins', min: 1 } },
  ...FIRST_WINS.map(
    (game): Rule => ({
      id: `board-win-${game}`,
      category: 'board',
      tier: 1,
      game,
      when: { t: 'board.won', has: game },
    }),
  ),
  { id: 'board-lantern', category: 'board', tier: 2, game: 'lantern', when: { t: 'board.coopWon', has: 'lantern' } },
  { id: 'board-silent-five', category: 'board', tier: 3, game: 'silent-table', when: { n: 'board.silentFive', min: 1 } },
  { id: 'board-kite', category: 'board', tier: 2, game: 'kite', when: { n: 'board.kiteHigh', min: 1 } },
  { id: 'board-kite-perfect', category: 'board', tier: 3, hidden: true, game: 'kite', when: { n: 'board.kitePerfect', min: 1 } },
  { id: 'board-all-games', category: 'board', tier: 3, when: { t: 'board.played', all: BOARD_GAMES } },

  // ── The arcade ────────────────────────────────────────────────────────────────────────────
  { id: 'platform-app', category: 'platform', tier: 1, when: { n: 'platform.app', min: 1 } },
  { id: 'platform-friends', category: 'platform', tier: 1, when: { n: 'platform.friendGames', min: 1 } },
  { id: 'platform-games-10', category: 'platform', tier: 1, when: { n: 'platform.games', min: 10 } },
  { id: 'platform-games-50', category: 'platform', tier: 2, when: { n: 'platform.games', min: 50 } },
  { id: 'platform-midnight', category: 'platform', tier: 2, hidden: true, when: { n: 'platform.midnight', min: 1 } },
]

export const RULE_IDS: ReadonlySet<string> = new Set(RULES.map((rule) => rule.id))

/** Whether the stats meet a rule */
export function evaluate(rule: Rule, stats: Stats): boolean {
  const { when } = rule
  if ('n' in when) return (stats.n[when.n] ?? 0) >= when.min
  const tally = stats.t[when.t] ?? {}
  const counted = (id: string) => (tally[id] ?? 0) > 0
  if ('all' in when) return when.all.every(counted)
  if ('has' in when) return counted(when.has)
  return Object.keys(tally).filter(counted).length >= when.min
}

/**
 * How far along a rule is, for its progress bar: what it has and what it needs, or null for a rule
 * that is all or nothing
 */
export function progressOf(rule: Rule, stats: Stats): { have: number; need: number } | null {
  const { when } = rule
  if ('n' in when) {
    if (when.min <= 1) return null
    return { have: Math.min(when.min, Math.floor(stats.n[when.n] ?? 0)), need: when.min }
  }
  const tally = stats.t[when.t] ?? {}
  const counted = (id: string) => (tally[id] ?? 0) > 0
  if ('all' in when) return { have: when.all.filter(counted).length, need: when.all.length }
  if ('has' in when) return null
  if (when.min <= 1) return null
  return { have: Math.min(when.min, Object.keys(tally).filter(counted).length), need: when.min }
}

/** The rules the stats meet that `unlocked` does not have yet, in the table's order */
export const newlyUnlocked = (stats: Stats, unlocked: Readonly<Record<string, number>>): Rule[] =>
  RULES.filter((rule) => unlocked[rule.id] === undefined && evaluate(rule, stats))
