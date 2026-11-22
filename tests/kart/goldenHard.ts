// The hard computer kart's hands as they were until 2026-11-22, frozen for the golden races
// (flatGolden.test.ts, branchGolden.test.ts): those digests pin the physics and the tracks, not the
// bots, so the hard level learning the perfect timing (src/kart/bots/skill.ts) must not move them.
import type { BotSkill } from '../../src/kart/bots/skill.ts'

export const GOLDEN_HARD: BotSkill = {
  lineNoise: 0.1,
  apex: 0.3,
  shortcuts: true,
  reactionSteps: 2,
  topSpeedShare: 1,
  driftAt: 0.9,
  releaseBoosts: 1,
  doubles: true,
  taps: true,
  startBoost: 0.9,
  stackBoosts: true,
  itemDelayMs: [300, 1_200],
  itemSense: true,
}
