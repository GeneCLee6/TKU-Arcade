import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import {
  parseBindings,
  serializeBindings,
  type Bindings,
  type PadBinding,
  type PadSnapshot,
} from '../../shared/kart/input.ts'
import { DEFAULT_RULES, type KartRules, type KartTuning } from '../../shared/kart/physics.ts'
import { parseStoredTuning, serializeTuning, type StoredTuning } from '../../shared/kart/tuning.ts'
import type { MessageParams } from '../i18n/t.ts'

// The browser side of e8-t12: storage, the Gamepad API and how controls are named on screen

type KartT = (key: KartMessageKey, params?: MessageParams) => string

const BINDINGS_KEY = 'tku-arcade.kart.bindings'
const RULES_KEY = 'tku-arcade.kart.rules'
// `.2` since the drift became a real slide (2026-11-14): numbers saved for the old physics, with
// names it no longer has, would leave the new ones half applied
const TUNING_KEY = 'tku-arcade.kart.tuning.2'

// localStorage can be missing, blocked or full: the page then keeps everything in memory
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** False when the browser would not keep it */
function write(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export const loadBindings = (): Bindings => parseBindings(read(BINDINGS_KEY))

export const saveBindings = (bindings: Bindings): boolean =>
  write(BINDINGS_KEY, serializeBindings(bindings))

export function loadRules(): KartRules {
  try {
    const stored = JSON.parse(read(RULES_KEY) ?? '{}') as Record<string, unknown>
    return {
      autoBoost: typeof stored.autoBoost === 'boolean' ? stored.autoBoost : DEFAULT_RULES.autoBoost,
      chainBoosts:
        typeof stored.chainBoosts === 'boolean' ? stored.chainBoosts : DEFAULT_RULES.chainBoosts,
    }
  } catch {
    return DEFAULT_RULES
  }
}

export const saveRules = (rules: KartRules): boolean => write(RULES_KEY, JSON.stringify(rules))

/** e8-t03: the tuning panel's numbers, in the same JSON as an export; broken ones give the standard */
export const loadTuning = (): StoredTuning => parseStoredTuning(read(TUNING_KEY))

export const saveTuning = (tuning: KartTuning): boolean =>
  write(TUNING_KEY, serializeTuning(tuning))

export interface PadReading {
  readonly id: string
  readonly snapshot: PadSnapshot
}

/**
 * The first connected gamepad, preferring one the browser maps to the standard layout. The Gamepad
 * API has no events for buttons: this is polled once a frame.
 */
export function readGamepad(): PadReading | undefined {
  let pads: readonly (Gamepad | null)[]
  try {
    pads = navigator.getGamepads?.() ?? []
  } catch {
    // Blocked by a permissions policy
    return undefined
  }
  let chosen: Gamepad | undefined
  for (const pad of pads) {
    if (!pad?.connected) continue
    if (pad.mapping === 'standard') {
      chosen = pad
      break
    }
    chosen ??= pad
  }
  if (!chosen) return undefined
  return {
    id: chosen.id,
    snapshot: {
      buttons: chosen.buttons.map((pressed) => Math.max(pressed.value, pressed.pressed ? 1 : 0)),
      axes: [...chosen.axes],
    },
  }
}

const NAMED_KEYS: Partial<Record<string, KartMessageKey>> = {
  ArrowUp: 'kart.key.up',
  ArrowDown: 'kart.key.down',
  ArrowLeft: 'kart.key.left',
  ArrowRight: 'kart.key.right',
  Space: 'kart.key.space',
  ShiftLeft: 'kart.key.shiftLeft',
  ShiftRight: 'kart.key.shiftRight',
  ControlLeft: 'kart.key.controlLeft',
  ControlRight: 'kart.key.controlRight',
  AltLeft: 'kart.key.altLeft',
  AltRight: 'kart.key.altRight',
  Backspace: 'kart.key.backspace',
}

/** How a KeyboardEvent.code reads on screen: "W", "Space", "Left Shift", or the code itself */
export function keyLabel(code: string, t: KartT): string {
  const named = NAMED_KEYS[code]
  if (named) return t(named)
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]!
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]!
  const numpad = /^Numpad(\w+)$/.exec(code)
  if (numpad) return t('kart.key.numpad', { key: numpad[1]! })
  return code
}

// The standard mapping names buttons by place; these are the names most pads print on them
const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT']
const PAD_KEYS: Partial<Record<number, KartMessageKey>> = {
  8: 'kart.pad.back',
  9: 'kart.pad.start',
  10: 'kart.pad.leftStickPress',
  11: 'kart.pad.rightStickPress',
  12: 'kart.pad.dpadUp',
  13: 'kart.pad.dpadDown',
  14: 'kart.pad.dpadLeft',
  15: 'kart.pad.dpadRight',
  16: 'kart.pad.home',
}
const AXIS_KEYS: Partial<Record<string, KartMessageKey>> = {
  '0-1': 'kart.pad.leftStickLeft',
  '01': 'kart.pad.leftStickRight',
  '1-1': 'kart.pad.leftStickUp',
  '11': 'kart.pad.leftStickDown',
  '2-1': 'kart.pad.rightStickLeft',
  '21': 'kart.pad.rightStickRight',
  '3-1': 'kart.pad.rightStickUp',
  '31': 'kart.pad.rightStickDown',
}

export function padLabel(binding: PadBinding, t: KartT): string {
  if (binding.kind === 'button') {
    const name = BUTTON_NAMES[binding.index]
    if (name) return name
    const key = PAD_KEYS[binding.index]
    return key ? t(key) : t('kart.pad.button', { index: binding.index })
  }
  const key = AXIS_KEYS[`${binding.index}${binding.direction}`]
  return key
    ? t(key)
    : t('kart.pad.axis', { index: binding.index, sign: binding.direction > 0 ? '+' : '−' })
}
