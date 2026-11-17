// What the items the room has judged do to a computer opponent's kart (docs/ARCHITECTURE.md §4.19):
// the same steps a player's browser takes for its own kart (src/kart/race/netRace.ts's `adjust`),
// made from the same pure effects (shared/kart/itemEffects.ts), read from the same events in the
// room's state. Kept apart from netRace.ts so that the online race is left exactly as it is.
import type { KartState as RoomState } from '../../../shared/games/kart/types.ts'
import { ITEM_TUNING } from '../../../shared/kart/items.ts'
import {
  boostKart,
  headwindStep,
  stunStep,
  towStep,
  warpRun,
} from '../../../shared/kart/itemEffects.ts'
import type { Run } from '../../../shared/kart/course.ts'
import { STEP_SECONDS } from '../../../shared/kart/physics.ts'
import { isShotItem, SHOT_TUNING } from '../../../shared/kart/shots.ts'
import type { Track } from '../../../shared/kart/track.ts'

export interface ItemRider {
  /** One step: the events since the last applied, then whatever is still on the kart at `at` */
  step(run: Run, state: RoomState, at: number, poseOf: (seat: number) => Point | null): Run
  /** Hit by a shot and still stunned at `at` */
  stunned(at: number): boolean
}

type Point = { readonly x: number; readonly z: number }

export function createItemRider(seat: number, track: Track, firstEvent = 0): ItemRider {
  let seen = firstEvent
  let towUntil = 0
  let towSeat: number | null = null
  let headwindUntil = 0
  let stunUntil = 0
  return {
    step(run, state, at, poseOf) {
      let next = run
      for (const event of state.events) {
        if (event.n < seen) continue
        seen = event.n + 1
        const reached = event.targets.includes(seat) && !event.blocked.includes(seat)
        if (event.hit) {
          if (reached && isShotItem(event.item)) {
            stunUntil = event.at + SHOT_TUNING.stunMs[event.item]
            towUntil = 0
          }
          continue
        }
        if (event.by === seat) {
          if (event.item === 'boost') next = { ...next, kart: boostKart(next.kart) }
          if (event.item === 'tow') {
            towUntil = event.at + ITEM_TUNING.towMs
            towSeat = event.targets[0] ?? null
          }
        }
        if (reached && event.item === 'headwind') {
          headwindUntil = event.at + ITEM_TUNING.headwindMs
          towUntil = 0
        }
        const warp = event.warps.find((one) => one.seat === seat)
        if (warp) {
          next = warpRun(next, warp, track)
          towUntil = 0
        }
      }
      if (at < headwindUntil) next = { ...next, kart: headwindStep(next.kart, STEP_SECONDS) }
      if (at < stunUntil) next = { ...next, kart: stunStep(next.kart, STEP_SECONDS) }
      if (at < towUntil && towSeat !== null) {
        const target = poseOf(towSeat)
        if (target) next = { ...next, kart: towStep(next.kart, target, STEP_SECONDS) }
      }
      return next
    },
    stunned: (at) => at < stunUntil,
  }
}
