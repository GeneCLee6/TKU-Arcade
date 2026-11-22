// The physics a leaderboard run was driven with, as a short stamp (2026-11-23, board.ts). The browser
// sends it with an upload and the Worker refuses one that is not its own: a tab left open across a
// deploy that changed the karts drives with other numbers than the ones the board is judged by.
//
// The stamp hashes every number the physics reads from data (the tunings, every kart and kind) and
// BOARD_PHYSICS_REVISION, which is raised by hand when the physics' code changes how a kart drives
// (tests/kart/flatGolden.test.ts and branchGolden.test.ts fail then: raise it in the same change).
import { FLAGSHIP_TRAITS, KARTS, KIND_TRAITS, STAT_STEP } from './karts.ts'
import { ARCADE_TUNING, KART_TUNING } from './physics.ts'

/** Raised by hand whenever the physics' code (not its numbers) changes how a kart drives */
export const BOARD_PHYSICS_REVISION = 1

/** FNV-1a, 32 bits, as 8 hex characters */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

let stamp: string | null = null

/** This build's physics stamp: `<revision>-<hash>` */
export function physicsStamp(): string {
  stamp ??= `${BOARD_PHYSICS_REVISION}-${fnv1a(
    JSON.stringify([KART_TUNING, ARCADE_TUNING, KARTS, KIND_TRAITS, FLAGSHIP_TRAITS, STAT_STEP]),
  )}`
  return stamp
}
