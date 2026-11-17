// The Grand Prix in this browser (docs/ARCHITECTURE.md §4.22): the cup being run, the last settings,
// and each cup's best result. storage.ts never throws, and what comes back is checked (cupRun.ts):
// storage that is missing or full only means the cup lasts as long as the page.
import { readStored, removeStored, writeStored } from '../../lib/storage.ts'
import {
  betterOutcome,
  DEFAULT_CUP_SETUP,
  parseCupRun,
  parseCupSetup,
  type CupOutcome,
  type CupRun,
  type CupSetup,
} from './cupRun.ts'
import type { CupId } from './cups.ts'

const RUN_KEY = 'tku-arcade.kart.cup.run'
const SETUP_KEY = 'tku-arcade.kart.cup.setup'
const bestKey = (cup: CupId) => `tku-arcade.kart.cup.best.${cup}`

function readJson(key: string): unknown {
  try {
    return JSON.parse(readStored(key) ?? 'null')
  } catch {
    return null
  }
}

export const loadCupRun = (): CupRun | null => parseCupRun(readJson(RUN_KEY))
export const saveCupRun = (run: CupRun): void => writeStored(RUN_KEY, JSON.stringify(run))
/** Abandoned, or over: nothing to continue */
export const clearCupRun = (): void => removeStored(RUN_KEY)

export const loadCupSetup = (): CupSetup => parseCupSetup(readJson(SETUP_KEY)) ?? DEFAULT_CUP_SETUP
export const saveCupSetup = (setup: CupSetup): void => writeStored(SETUP_KEY, JSON.stringify(setup))

export function loadCupBest(cup: CupId): CupOutcome | null {
  const value = readJson(bestKey(cup))
  if (typeof value !== 'object' || value === null) return null
  const { place, points } = value as Record<string, unknown>
  return Number.isInteger(place) && (place as number) >= 1 && Number.isInteger(points)
    ? { place: place as number, points: points as number }
    : null
}

/** Keeps `outcome` if it beats the cup's best; true when it did */
export function keepCupBest(cup: CupId, outcome: CupOutcome): boolean {
  if (!betterOutcome(outcome, loadCupBest(cup))) return false
  writeStored(bestKey(cup), JSON.stringify(outcome))
  return true
}
