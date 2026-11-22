// 2026-11-22 (#100, docs/ARCHITECTURE.md §4.63): how the touch BOOST button looks, from the HUD. A
// thumb on the button has no eyes free for the HUD's bar: the button itself says whether a press
// would do anything. While a boost burns, a ring round it runs down with the boost and the word on
// it says so (in the classic feel the button does nothing until the boost is over: dimmed); with no
// charge it is dimmed; and under the word, one small cell for each charge it can hold, lit for those
// held (in a team race the blue ones blue, first, since they fire first). Pure.
import { HUD_STEPS } from '../hudSteps.ts'
import type { SpikeHud } from '../spikeLoop.ts'

export type BoostCell = 'charge' | 'red' | 'blue' | 'empty'

export interface BoostButtonLook {
  /** A boost is burning; there is a charge to fire; or nothing to fire */
  readonly state: 'burning' | 'ready' | 'empty'
  /** A press does nothing now: the classic feel's one boost at a time */
  readonly locked: boolean
  /** The share of the burning boost still to burn, 0 to 1 (0 when none burns) */
  readonly left: number
  /** One a charge the kart can hold */
  readonly cells: readonly BoostCell[]
}

/** What the button needs of the HUD */
export type BoostHud = Pick<
  SpikeHud,
  'storedBoosts' | 'boostLeft' | 'boostLocked' | 'teamBoosts' | 'boosting'
>

export function boostButtonLook(hud: BoostHud, maxStored: number): BoostButtonLook {
  const left = Math.max(0, Math.min(HUD_STEPS, hud.boostLeft ?? 0)) / HUD_STEPS
  const burning = left > 0
  const stored = Math.max(0, Math.min(maxStored, hud.storedBoosts))
  const team = hud.teamBoosts !== undefined
  const blue = Math.min(hud.teamBoosts ?? 0, stored)
  const cells = Array.from({ length: Math.max(0, maxStored) }, (_, index): BoostCell =>
    index >= stored ? 'empty' : !team ? 'charge' : index < blue ? 'blue' : 'red',
  )
  return {
    state: burning ? 'burning' : stored > 0 ? 'ready' : 'empty',
    locked: burning && (hud.boostLocked ?? false),
    left,
    cells,
  }
}
