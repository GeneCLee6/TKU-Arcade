// 2026-11-23 (docs/ARCHITECTURE.md §4.97): the few numbers of this person's achievements a room may
// see on their card (shared/social.ts ProfileSummary), worked out from the save (store.ts): never the
// save itself. Pure but for `currentSummary`, which reads the stores.
import {
  isProfileId,
  MAX_COUNT,
  MAX_LAP_MS,
  MIN_LAP_MS,
  parseProfileSummary,
  type ProfileSummary,
} from '../../shared/social.ts'
import { readStored } from '../lib/storage.ts'
import { titleChoice, type TitleChoice } from './cardPrefs.ts'
import { favourite } from './profileStats.ts'
import { evaluate, RULES, type Rule } from './rules.ts'
import { loadSaved, type Saved } from './store.ts'

// The driver this browser races as (src/kart/bodies.ts keeps it; read here without the kart's lists)
const DRIVER_KEY = 'tku-arcade.kart.driver'

/** The rules this save has unlocked, or would by its stats */
export const doneRules = (saved: Saved): Rule[] =>
  RULES.filter((rule) => saved.unlocked[rule.id] !== undefined || evaluate(rule, saved.stats))

/** The title a choice comes to: the chosen badge if unlocked, else for `auto` the best one */
export function pickTitle(done: readonly Rule[], saved: Saved, choice: TitleChoice): string | undefined {
  if (choice === 'none') return undefined
  if (choice !== 'auto' && done.some((rule) => rule.id === choice)) return choice
  let best: Rule | undefined
  for (const rule of done) {
    if (
      !best ||
      rule.tier > best.tier ||
      (rule.tier === best.tier && (saved.unlocked[rule.id] ?? 0) > (saved.unlocked[best.id] ?? 0))
    ) {
      best = rule
    }
  }
  return best?.id
}

const count = (value: number | undefined): number => Math.min(MAX_COUNT, Math.max(0, Math.floor(value ?? 0)))

/** The card for a save; null when it would not pass the room's check (it then is not sent) */
export function buildSummary(saved: Saved, choice: TitleChoice, driver: string | null): ProfileSummary | null {
  const { stats } = saved
  const done = doneRules(saved)
  const title = pickTitle(done, saved, choice)
  const kart = favourite(stats.t['kart.karts'])?.[0]
  let lap: ProfileSummary['lap']
  for (const [track, ms] of Object.entries(stats.t['kart.bestLap'] ?? {})) {
    const rounded = Math.round(ms)
    if (!isProfileId(track) || rounded < MIN_LAP_MS || rounded > MAX_LAP_MS) continue
    if (!lap || rounded < lap.ms) lap = { track, ms: rounded }
  }
  return parseProfileSummary({
    ...(title ? { title } : {}),
    unlocked: done.length,
    total: RULES.length,
    games: count(stats.n['platform.games']),
    boardWins: count(stats.n['board.wins']),
    kartWins: count(stats.n['kart.wins']),
    ...(isProfileId(kart) ? { kart } : {}),
    ...(isProfileId(driver) ? { driver } : {}),
    ...(lap ? { lap } : {}),
  })
}

/** This browser's card now */
export const currentSummary = (): ProfileSummary | null =>
  buildSummary(loadSaved(), titleChoice(), readStored(DRIVER_KEY))
