// The fourth computer level, the expert (owner 2026-11-20; docs/ARCHITECTURE.md §4.40): the hands of
// the scripted master (src/kart/bots/drivers.ts, `npm run kart:feel`) as an opponent. Everything the
// hard bot does (since 2026-11-22 that includes the perfect instant boost and the combo it keeps
// going, #105), and what the owner decided stays the expert's: charges fired as soon as the road
// allows, the foot flat down, a tighter line, and on a track with a guide (shared/kart/tracks/guide.ts,
// #109) its technical line through the slots, over the fences and down the branches, with the drift
// jumps and the lift at the crest that line asks for.
//
// Never a cheat: the same physics, the same kart numbers, its own kart's top speed at most; the
// rubber band eases it off ahead of the people as it does every bot (brain.ts honours the banded
// share even with the foot flat down). Kept in a module of its own so that the brain's route choice
// can change underneath it. Pure.
import type { BotSkill } from './skill.ts'

/**
 * The expert's skill: the master driver's, with no hands on top (no shake, no lapses), and two
 * habits of its own (measured 2026-11-20, docs/KART-FEEL.md §13): a drift only into a corner that
 * turns at least 0.7 rad (the master: 0.5), begun a little later (0.95 of the grip, the master 0.9).
 * Over the eleven tracks that is as fast, and hits the wall a third less
 */
export const EXPERT_SKILL: BotSkill = {
  lineNoise: 0.04,
  apex: 0.15,
  shortcuts: true,
  tricks: true,
  reactionSteps: 2,
  topSpeedShare: 1,
  flatOut: true,
  driftAt: 0.95,
  cornerTurn: 0.7,
  holdSeconds: 0.45,
  releaseBoosts: 1,
  doubles: true,
  taps: true,
  startBoost: 1,
  stackBoosts: true,
  boostAt: 0.6,
  itemDelayMs: [250, 900],
  itemSense: true,
  // 2026-11-22 (#100, #102; docs/KART-FEEL.md §13.5): watches the wall out of its drifts (its
  // technical line on a guide's track is driven as it is), and keeps a charge for blue
  wallCare: 0.25,
  teamSave: 0.6,
  // 2026-11-23 (docs/KART-FEEL.md §13.5): and drives the S-bends out of a drift (skill.ts)
  esses: true,
}
