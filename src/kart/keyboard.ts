import type { KartInput } from '../../shared/kart/physics.ts'

// event.code, so that the keys stay in the same place on any layout. Remapping and gamepads are e8-t12.
const THROTTLE = ['ArrowUp', 'KeyW']
const BRAKE = ['ArrowDown', 'KeyS']
const LEFT = ['ArrowLeft', 'KeyA']
const RIGHT = ['ArrowRight', 'KeyD']
const DRIFT = ['ShiftLeft', 'ShiftRight']

export function inputFromKeys(held: ReadonlySet<string>): KartInput {
  const anyHeld = (codes: string[]) => codes.some((code) => held.has(code))
  return {
    throttle: anyHeld(THROTTLE),
    brake: anyHeld(BRAKE),
    steer: (anyHeld(RIGHT) ? 1 : 0) - (anyHeld(LEFT) ? 1 : 0),
    drift: anyHeld(DRIFT),
  }
}

/** The arrow keys would also scroll the page */
export const scrollsThePage = (code: string): boolean => code.startsWith('Arrow')
