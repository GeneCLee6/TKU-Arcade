// e8-t12: which keys and gamepad controls drive the kart, and how they turn into the one KartInput
// the physics reads. Pure: the page reads the keyboard and navigator.getGamepads() and passes what
// it saw, so that this file runs and is tested in Node.
import { NO_INPUT, type KartInput } from './physics.ts'

export const KART_ACTIONS = [
  'throttle',
  'brake',
  'left',
  'right',
  'drift',
  'boost',
  'reset',
] as const
export type KartAction = (typeof KART_ACTIONS)[number]

/** Every action has this many places for a key, and as many for a gamepad control */
export const SLOTS = 2

/** A gamepad control: a button, or one direction of a stick axis */
export type PadBinding =
  | { readonly kind: 'button'; readonly index: number }
  | { readonly kind: 'axis'; readonly index: number; readonly direction: -1 | 1 }

type Slots<T> = Readonly<Record<KartAction, readonly (T | null)[]>>

export interface Bindings {
  /** KeyboardEvent.code, so that a key keeps its place on any layout */
  readonly keys: Slots<string>
  readonly pad: Slots<PadBinding>
}

export type Device = 'keys' | 'pad'

const button = (index: number): PadBinding => ({ kind: 'button', index })
const axis = (index: number, direction: -1 | 1): PadBinding => ({ kind: 'axis', index, direction })

/**
 * Defaults. No Shift and no Ctrl: pressing Shift five times opens Windows' Sticky Keys prompt (a
 * drift is often a tap), and Ctrl with W closes the tab. Arrows with Z and X for the right hand on
 * the arrows; WASD with Space and E for the left hand on the letters. The gamepad follows the
 * browser's standard mapping: left stick or d-pad to steer, A or RT to accelerate, B or LT to brake,
 * RB or LB to drift, X or Y to boost. Reset (e8-t02b) is R, and Back (View) on a gamepad: away from
 * the driving keys, so that it is not pressed by accident, with a second place left empty.
 */
export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    throttle: ['ArrowUp', 'KeyW'],
    brake: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    drift: ['KeyZ', 'Space'],
    boost: ['KeyX', 'KeyE'],
    reset: ['KeyR', null],
  },
  pad: {
    throttle: [button(0), button(7)],
    brake: [button(1), button(6)],
    left: [axis(0, -1), button(14)],
    right: [axis(0, 1), button(15)],
    drift: [button(5), button(4)],
    boost: [button(2), button(3)],
    reset: [button(8), null],
  },
}

/**
 * Shift drifts and Ctrl boosts too, whatever the bindings say (owner, 2026-11-14: the layout the
 * friends' hands already know), unless the player has given that key to another action. They are
 * not in the defaults' two places: those keep Z and X for the arrows, Space and E for WASD. Shift
 * pressed five times may open Windows' Sticky Keys prompt (turn it off in Windows' settings), and
 * Ctrl with W closes a tab, so the page asks before leaving during a race (spikeLoop.ts)
 */
export const ALWAYS_KEYS: Readonly<Partial<Record<KartAction, readonly string[]>>> = {
  drift: ['ShiftLeft', 'ShiftRight'],
  boost: ['ControlLeft', 'ControlRight'],
}

/** Keys the page needs for itself: moving focus, pressing buttons, leaving a capture, the numbers */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'Tab',
  'Enter',
  'NumpadEnter',
  'Escape',
  'KeyF',
])

/** A stick resting off-centre must not steer */
export const AXIS_DEAD_ZONE = 0.2
/** A trigger or a stick counts as pressed past this */
export const PRESS_THRESHOLD = 0.5

/** What the page read from one gamepad: button values 0 to 1 and axes -1 to 1 */
export interface PadSnapshot {
  readonly buttons: readonly number[]
  readonly axes: readonly number[]
}

export const samePad = (a: PadBinding, b: PadBinding): boolean =>
  a.kind === b.kind &&
  a.index === b.index &&
  (a.kind === 'button' || a.direction === (b as typeof a).direction)

/** 0 to 1. An axis is scaled from the edge of the dead zone, so steering starts gently. */
export function padValue(binding: PadBinding, pad: PadSnapshot): number {
  if (binding.kind === 'button') return Math.min(1, Math.max(0, pad.buttons[binding.index] ?? 0))
  const pushed = (pad.axes[binding.index] ?? 0) * binding.direction
  return pushed <= AXIS_DEAD_ZONE
    ? 0
    : Math.min(1, (pushed - AXIS_DEAD_ZONE) / (1 - AXIS_DEAD_ZONE))
}

export interface InputSources {
  readonly held: ReadonlySet<string>
  readonly pad?: PadSnapshot
  /** The boost was pressed since the last step, even if it is already up again */
  readonly boostTapped?: boolean
  /** The same for the reset */
  readonly resetTapped?: boolean
}

/** Keyboard and gamepad together: either can press, and their steering adds up to at most full */
export function readInput(
  bindings: Bindings,
  { held, pad, boostTapped, resetTapped }: InputSources,
): KartInput {
  const amount = (action: KartAction): number => {
    let value = 0
    for (const code of actionKeys(bindings, action)) if (held.has(code)) value = 1
    if (pad) {
      for (const control of bindings.pad[action]) {
        if (control) value = Math.max(value, padValue(control, pad))
      }
    }
    return value
  }
  const pressed = (action: KartAction) => amount(action) >= PRESS_THRESHOLD
  return {
    ...NO_INPUT,
    throttle: pressed('throttle'),
    brake: pressed('brake'),
    steer: Math.min(1, Math.max(-1, amount('right') - amount('left'))),
    drift: pressed('drift'),
    boost: pressed('boost') || (boostTapped ?? false),
    reset: pressed('reset') || (resetTapped ?? false),
  }
}

/** The keys an action listens to: its two places, and Shift or Ctrl where nothing else took them */
export const actionKeys = (bindings: Bindings, action: KartAction): readonly string[] => {
  const own = bindings.keys[action].filter((code): code is string => code !== null)
  const taken = (code: string) => KART_ACTIONS.some((other) => other !== action && bindings.keys[other].includes(code))
  const always = (ALWAYS_KEYS[action] ?? []).filter((code) => !own.includes(code) && !taken(code))
  return [...own, ...always]
}

export const isBoundKey = (bindings: Bindings, code: string): boolean =>
  KART_ACTIONS.some((action) => actionKeys(bindings, action).includes(code))

export const boostKeys = (bindings: Bindings): readonly string[] => actionKeys(bindings, 'boost')

export interface Moved {
  readonly action: KartAction
  readonly slot: number
}

export interface Rebound {
  readonly bindings: Bindings
  /** Where the control was before, when it was in use somewhere else: it has been taken from there */
  readonly movedFrom?: Moved
}

function rebind<T>(
  slots: Slots<T>,
  action: KartAction,
  slot: number,
  value: T | null,
  same: (a: T, b: T) => boolean,
): { slots: Slots<T>; movedFrom?: Moved } {
  let movedFrom: Moved | undefined
  const next = {} as Record<KartAction, (T | null)[]>
  for (const each of KART_ACTIONS) {
    next[each] = slots[each].map((current, index) => {
      if (each === action && index === slot) return value
      // One control does one thing: binding it here takes it away from wherever it was
      if (value !== null && current !== null && same(current, value)) {
        movedFrom = { action: each, slot: index }
        return null
      }
      return current
    })
  }
  return { slots: next, movedFrom }
}

export function bindKey(
  bindings: Bindings,
  action: KartAction,
  slot: number,
  code: string | null,
): Rebound {
  if (code !== null && RESERVED_KEYS.has(code)) return { bindings }
  const { slots, movedFrom } = rebind(bindings.keys, action, slot, code, (a, b) => a === b)
  return { bindings: { ...bindings, keys: slots }, movedFrom }
}

export function bindPad(
  bindings: Bindings,
  action: KartAction,
  slot: number,
  control: PadBinding | null,
): Rebound {
  const { slots, movedFrom } = rebind(bindings.pad, action, slot, control, samePad)
  return { bindings: { ...bindings, pad: slots }, movedFrom }
}

/** Every control that is pressed right now, to tell a new press from one held since before */
export function activeControls(pad: PadSnapshot): PadBinding[] {
  const active: PadBinding[] = []
  pad.buttons.forEach((value, index) => {
    if (value >= PRESS_THRESHOLD) active.push(button(index))
  })
  pad.axes.forEach((value, index) => {
    if (Math.abs(value) >= PRESS_THRESHOLD) active.push(axis(index, value > 0 ? 1 : -1))
  })
  return active
}

/** The first control pressed now that was not pressed in `before`: what a capture binds */
export function newPress(before: readonly PadBinding[], pad: PadSnapshot): PadBinding | undefined {
  return activeControls(pad).find((control) => !before.some((old) => samePad(old, control)))
}

// Stored as JSON; anything malformed falls back to the default, one slot at a time, so that an old
// or hand-edited value never leaves the car without controls it did not ask to lose.
const isCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9]{1,32}$/.test(value) && !RESERVED_KEYS.has(value)

const isIndex = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < 64

function asPad(value: unknown): PadBinding | null | undefined {
  if (value === null) return null
  if (typeof value !== 'object') return undefined
  const { kind, index, direction } = value as Record<string, unknown>
  if (!isIndex(index)) return undefined
  if (kind === 'button') return button(index)
  if (kind === 'axis' && (direction === 1 || direction === -1)) return axis(index, direction)
  return undefined
}

function parseSlots<T>(
  stored: unknown,
  defaults: Slots<T>,
  parse: (value: unknown) => T | null | undefined,
): Slots<T> {
  const record = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<
    string,
    unknown
  >
  const result = {} as Record<KartAction, (T | null)[]>
  for (const action of KART_ACTIONS) {
    const list = Array.isArray(record[action]) ? (record[action] as unknown[]) : []
    result[action] = defaults[action].map((fallback, slot) => {
      const parsed = slot < list.length ? parse(list[slot]) : undefined
      return parsed === undefined ? fallback : parsed
    })
  }
  return result
}

/** Reads what `serializeBindings` wrote; anything missing or broken gives the default */
export function parseBindings(stored: string | null): Bindings {
  let data: unknown
  try {
    data = stored === null ? {} : JSON.parse(stored)
  } catch {
    data = {}
  }
  const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const keys = parseSlots(record.keys, DEFAULT_BINDINGS.keys, (value) =>
    value === null ? null : isCode(value) ? value : undefined,
  )
  const pad = parseSlots(record.pad, DEFAULT_BINDINGS.pad, asPad)
  // A stored value with the same control twice is not something the page writes: undo the duplicate
  let bindings: Bindings = { keys: DEFAULT_BINDINGS.keys, pad: DEFAULT_BINDINGS.pad }
  for (const action of KART_ACTIONS) {
    for (let slot = 0; slot < SLOTS; slot++) {
      bindings = bindKey(bindings, action, slot, null).bindings
      bindings = bindPad(bindings, action, slot, null).bindings
    }
  }
  for (const action of KART_ACTIONS) {
    for (let slot = 0; slot < SLOTS; slot++) {
      bindings = bindKey(bindings, action, slot, keys[action][slot] ?? null).bindings
      bindings = bindPad(bindings, action, slot, pad[action][slot] ?? null).bindings
    }
  }
  return bindings
}

export const serializeBindings = (bindings: Bindings): string => JSON.stringify(bindings)
