// Touch controls for phones (owner 2026-11-17, docs/ARCHITECTURE.md §4.25): which on-screen buttons
// are held, the touch settings, and how both turn into the one KartInput the physics reads. Pure,
// like input.ts: the page tracks the fingers (src/kart/touch/) and passes what it saw.
import { NO_INPUT, type KartInput } from './physics.ts'

export const TOUCH_BUTTONS = [
  'left',
  'right',
  'throttle',
  'brake',
  'drift',
  'boost',
  'item',
  'reset',
] as const
export type TouchButton = (typeof TOUCH_BUTTONS)[number]

/** Two big buttons, or a slider dragged sideways from wherever the thumb lands */
export type SteerStyle = 'buttons' | 'slider'

export interface TouchSettings {
  readonly steer: SteerStyle
  /**
   * The engine runs by itself once the race is on; GAS is then only tapped, for an instant boost
   * out of a drift (it lets go by itself while one waits) or held through the countdown for a start
   * boost
   */
  readonly autoThrottle: boolean
  /** Button size as a share of the standard, MIN_SCALE to MAX_SCALE */
  readonly scale: number
  /** How opaque the buttons are, MIN_OPACITY to MAX_OPACITY */
  readonly opacity: number
  /** Steering on the right, the rest on the left */
  readonly leftHanded: boolean
  /** A short buzz when hit and when a boost fires, where the phone can */
  readonly vibrate: boolean
}

export const DEFAULT_TOUCH_SETTINGS: TouchSettings = {
  steer: 'buttons',
  autoThrottle: true,
  scale: 1,
  opacity: 0.6,
  leftHanded: false,
  vibrate: true,
}

export const MIN_SCALE = 0.8
export const MAX_SCALE = 1.4
export const MIN_OPACITY = 0.3
export const MAX_OPACITY = 0.9
/** The standard button, CSS px; never smaller than MIN_BUTTON_PX at any scale */
export const BUTTON_PX = 64
export const MIN_BUTTON_PX = 48

/** One action button's side at these settings, px */
export const buttonPx = (settings: TouchSettings): number =>
  Math.max(MIN_BUTTON_PX, Math.round(BUTTON_PX * settings.scale))

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** Reads what `serializeTouchSettings` wrote; anything missing or broken gives the default */
export function parseTouchSettings(stored: string | null): TouchSettings {
  let data: unknown
  try {
    data = stored === null ? {} : JSON.parse(stored)
  } catch {
    data = {}
  }
  const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const number = (key: string, low: number, high: number, fallback: number) => {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? clamp(value, low, high) : fallback
  }
  const flag = (key: string, fallback: boolean) =>
    typeof record[key] === 'boolean' ? (record[key] as boolean) : fallback
  const d = DEFAULT_TOUCH_SETTINGS
  return {
    steer: record.steer === 'slider' || record.steer === 'buttons' ? record.steer : d.steer,
    autoThrottle: flag('autoThrottle', d.autoThrottle),
    scale: number('scale', MIN_SCALE, MAX_SCALE, d.scale),
    opacity: number('opacity', MIN_OPACITY, MAX_OPACITY, d.opacity),
    leftHanded: flag('leftHanded', d.leftHanded),
    vibrate: flag('vibrate', d.vibrate),
  }
}

export const serializeTouchSettings = (settings: TouchSettings): string => JSON.stringify(settings)

/** The slider steers nothing this close to where the thumb landed, as a share of its reach */
export const SLIDER_DEAD_ZONE = 0.08

/**
 * The slider's steering for a thumb `dx` px right of where it landed, -1 to 1: none in the dead
 * zone, then in proportion up to full at `reach` px. A counter-steer is a drag back past the start.
 */
export function sliderSteer(dx: number, reach: number): number {
  if (!(reach > 0)) return 0
  const share = clamp(dx / reach, -1, 1)
  const size = Math.abs(share)
  if (size <= SLIDER_DEAD_ZONE) return 0
  return Math.sign(share) * Math.min(1, (size - SLIDER_DEAD_ZONE) / (1 - SLIDER_DEAD_ZONE))
}

/** What the fingers did since the last step */
export interface TouchReading {
  readonly held: ReadonlySet<TouchButton>
  /** Pressed since the last step, even if already let go: a tap shorter than a step still counts */
  readonly tapped: ReadonlySet<TouchButton>
  /** The slider's steering, -1 to 1; 0 when no thumb is on it */
  readonly slider: number
}

/** What the race says about the moment, read from the kart before the step */
export interface TouchMoment {
  /** Past GO (or no countdown at all): the automatic throttle may run */
  readonly racing: boolean
  /**
   * An instant boost waits for a fresh press of the throttle (physics.ts's kartBurstWaiting): from
   * the drift let go (the car still sliding out) until the window after it straightens shuts. Only
   * that press fires it (owner, 2026-11-17: never by itself), so the automatic throttle lets go
   */
  readonly burstWaiting: boolean
}

/**
 * The buttons as a KartInput.
 *
 * - Holding DRIFT holds the throttle too, so that one thumb drifts without also holding GAS; letting
 *   go of DRIFT lets go of both, which is what a release boost needs: counter-steer, then tap GAS.
 * - The automatic throttle (once racing) holds it all the time except while BRAKE is held or a
 *   release boost waits: then GAS is up until tapped, so a tap is the fresh press the boost needs.
 *   Before GO it is GAS as pressed, so a start boost is the player's to time.
 */
export function touchInput(
  reading: TouchReading,
  settings: TouchSettings,
  moment: TouchMoment,
): KartInput {
  const { held, tapped } = reading
  const on = (button: TouchButton) => held.has(button) || tapped.has(button)
  const gas = on('throttle')
  const drift = held.has('drift')
  const brake = held.has('brake')
  let throttle = gas || (drift && !brake)
  if (settings.autoThrottle && moment.racing && !brake && !moment.burstWaiting) throttle = true
  const steer =
    settings.steer === 'slider'
      ? clamp(reading.slider, -1, 1)
      : (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
  return {
    ...NO_INPUT,
    throttle,
    // A tap of GAS shorter than a step is still a fresh press (the classic feel's instant boost)
    ...(tapped.has('throttle') ? { throttleTap: true } : {}),
    brake,
    steer,
    drift,
    boost: on('boost'),
    reset: on('reset'),
    item: on('item'),
  }
}

/** Two inputs at once (keys or a gamepad, and the screen): either presses, steering adds to at most full */
export function mergeInputs(a: KartInput, b: KartInput): KartInput {
  return {
    throttle: a.throttle || b.throttle,
    brake: a.brake || b.brake,
    steer: clamp(a.steer + b.steer, -1, 1),
    drift: a.drift || b.drift,
    boost: a.boost || b.boost,
    ...(a.throttleTap || b.throttleTap ? { throttleTap: true } : {}),
    reset: (a.reset ?? false) || (b.reset ?? false),
    item: (a.item ?? false) || (b.item ?? false),
  }
}
