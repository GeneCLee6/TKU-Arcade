// A computer player for 宮燈點點 (2026-11-23, docs/ARCHITECTURE.md "電腦玩家"). It sees what its seat's
// browser would: its own lanterns, how many everyone else holds, and the avenue. Nobody may speak, so
// the only thing to read is time: the room keeps a clock for every computer seat (`botTime`), started
// over by every change at the table, and a computer lights its lowest lantern once the clock has run
// for about as long as that lantern is far above the last one on the avenue. A person counting along
// does the same thing; two computers never light out of order unless their clocks wander.
//
// Normal counts steadily (a little wobble); Easy wanders much more, so it lights too early or too
// late more often. Both raise their hand soon after a level is dealt, and agree to moonlight as soon
// as anyone else asks for it; neither asks first.
import type { Rng } from '../types.ts'
import type { LanternAction, LanternView } from './types.ts'

type Level = {
  /** The share of the wait a computer's clock may be off by, either way */
  wobble: number
}

const LEVELS: Readonly<Record<string, Level>> = {
  normal: { wobble: 0.07 },
  easy: { wobble: 0.3 },
}

/** The wait before a lantern right after the last one (next to it): a beat to see it land */
export const LANTERN_BASE_MS = 900
/** And for each number in between: a steady count, a little slower than one a quarter second */
export const LANTERN_STEP_MS = 280
/** However far apart, it lights within this */
export const LANTERN_MAX_MS = 25_000
/** Raising a hand, or agreeing to moonlight */
const HAND_MS = { min: 700, spread: 900 }

const levelOf = (level: string): Level => LEVELS[level] ?? LEVELS.normal

/** The highest lantern on the avenue, 0 before the first */
export const lastLit = (view: LanternView): number => view.pile.at(-1)?.card ?? 0

/** Someone else asked for moonlight and this seat has not agreed yet */
function wantsMoon(view: LanternView): boolean {
  if (view.phase !== 'play' || view.moons <= 0) return false
  const me = view.players.find((player) => player.seat === view.you)
  if (!me || me.moonVote) return false
  return view.players.some((player) => player.seat !== view.you && player.moonVote)
}

/**
 * How long after the last change this seat lights its lowest lantern, before any wobble: a beat,
 * then a steady count of the numbers between the avenue and it; at once when nobody else holds any
 */
export function lanternWait(view: LanternView): number | null {
  const lowest = view.hand?.[0]
  if (lowest === undefined) return null
  const others = view.players.reduce((sum, player) => sum + (player.seat === view.you ? 0 : player.count), 0)
  if (others === 0) return LANTERN_BASE_MS
  const between = Math.max(0, lowest - lastLit(view) - 1)
  return Math.min(LANTERN_MAX_MS, LANTERN_BASE_MS + LANTERN_STEP_MS * between)
}

/** The room's clock for this seat (`GameModule.botTime`) */
export function lanternBotTime(view: LanternView, level: string, rng: Rng): number | null {
  if (view.you === null || view.phase === 'over') return null
  const me = view.players.find((player) => player.seat === view.you)
  if (!me) return null
  if (view.phase === 'focus') return me.ready ? null : HAND_MS.min + rng.int(HAND_MS.spread)
  if (wantsMoon(view)) return HAND_MS.min + rng.int(HAND_MS.spread)
  const wait = lanternWait(view)
  if (wait === null) return null
  const { wobble } = levelOf(level)
  return Math.round(wait * (1 + (rng.float() * 2 - 1) * wobble))
}

/** The move once the clock is up: a hand, a vote, or the lowest lantern */
export function lanternBot(view: LanternView, legal: readonly LanternAction[]): LanternAction | null {
  if (view.you === null || view.phase === 'over') return null
  const ready = legal.find((action) => action.type === 'ready')
  if (ready) return ready
  if (wantsMoon(view)) return { type: 'moon', on: true }
  return legal.find((action) => action.type === 'light') ?? null
}
