import { useSyncExternalStore } from 'react'
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
// .3 since the classic feel (2026-11-17): numbers kept for the arcade feel are not carried over
// .4 the same day: the instant boost fires only on a fresh press, and the standard numbers moved
// (the start boost, the instant boost's pull), so numbers kept before are not today's standard
// .5 since 2026-11-18: the drift is looser and the instant boost takes a deep, long drift (new
// numbers, and the standard ones moved again)
// .6 later that day: any real drift earns the instant boost (lower marks, a milder dash)
const TUNING_KEY = 'tku-arcade.kart.tuning.7'

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

/** What pickPad needs of one connected gamepad */
export interface PadSeen {
  /** Its place in navigator.getGamepads() */
  readonly index: number
  /** The browser maps it to the standard layout */
  readonly standard: boolean
  /** A button or a stick is held on it now */
  readonly active: boolean
}

/** A stick this far over counts as input when choosing between gamepads */
const PAD_ACTIVE_AXIS = 0.5

/**
 * 2026-11-22 (#19): which of several gamepads drives. The one last used: the pad that had input
 * most recently (`current`) keeps driving while it is connected; a pad that has input while the
 * current one has none takes over. With none used yet, or the one used gone, a pad with input, else
 * the first on the standard layout, else the first. So on one screen any pad can drive, and a
 * second pad on the table does not fight the first. Pure: the index chosen, or null for none
 */
export function pickPad(pads: readonly PadSeen[], current: number | null): number | null {
  if (pads.length === 0) return null
  const kept = pads.find((pad) => pad.index === current)
  if (kept?.active) return kept.index
  const used = pads.find((pad) => pad.active && pad.standard) ?? pads.find((pad) => pad.active)
  if (used) return used.index
  if (kept) return kept.index
  return (pads.find((pad) => pad.standard) ?? pads[0]!).index
}

const padActive = (pad: Gamepad): boolean =>
  pad.buttons.some((button) => button.pressed || button.value > 0.5) ||
  pad.axes.some((axis) => Math.abs(axis) > PAD_ACTIVE_AXIS)

/** The gamepad last chosen, by its place in navigator.getGamepads() */
let activePad: number | null = null

/**
 * The gamepad that drives (pickPad: the one last used, preferring the standard layout). The Gamepad
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
  // By their places in the list (a gamepad keeps its place while it is connected)
  const seen: PadSeen[] = []
  pads.forEach((pad, index) => {
    if (pad?.connected)
      seen.push({ index, standard: pad.mapping === 'standard', active: padActive(pad) })
  })
  activePad = pickPad(seen, activePad)
  const chosen = activePad === null ? undefined : (pads[activePad] ?? undefined)
  if (!chosen) return undefined
  return {
    id: chosen.id,
    snapshot: {
      buttons: chosen.buttons.map((pressed) => Math.max(pressed.value, pressed.pressed ? 1 : 0)),
      axes: [...chosen.axes],
    },
  }
}

// ── What the keys are called (2026-11-22, #19: AZERTY and other layouts) ──────────────────────────

/** The keyboard layout's map from KeyboardEvent.code to what is printed on the key, once known */
export type KeyLayout = ReadonlyMap<string, string>

let keyLayout: KeyLayout | null = null
let layoutAsked = false
const layoutListeners = new Set<() => void>()

interface KeyboardWithLayout {
  getLayoutMap?: () => Promise<KeyLayout>
  addEventListener?: (type: 'layoutchange', listener: () => void) => void
}

/**
 * Asks the browser for the keyboard's layout (the Keyboard Map API: Chromium, on a secure page),
 * once; `listener` hears when it arrives or changes. Where there is no such API nothing happens and
 * keys keep the names of their places (a US layout's). The way to stop listening is returned
 */
export function watchKeyLayout(listener: () => void): () => void {
  layoutListeners.add(listener)
  if (!layoutAsked) {
    layoutAsked = true
    const keyboard =
      typeof navigator === 'undefined'
        ? undefined
        : (navigator as Navigator & { keyboard?: KeyboardWithLayout }).keyboard
    const ask = () => {
      try {
        keyboard
          ?.getLayoutMap?.()
          .then((map) => {
            keyLayout = map
            for (const one of layoutListeners) one()
          })
          .catch(() => {})
      } catch {
        // Not allowed here (a frame, an insecure page): the places' names stay
      }
    }
    ask()
    try {
      keyboard?.addEventListener?.('layoutchange', ask)
    } catch {
      // No such event: the layout read once is kept
    }
  }
  return () => {
    layoutListeners.delete(listener)
  }
}

/** The layout known now, or null (tests, and browsers without the API) */
export const currentKeyLayout = (): KeyLayout | null => keyLayout

/** The layout, for a screen that names keys: it draws again when the layout arrives or changes */
export const useKeyLayout = (): KeyLayout | null =>
  useSyncExternalStore(watchKeyLayout, currentKeyLayout, () => null)

/**
 * What is printed on the key at `code`, by `layout`: a letter or a digit, upper case ("KeyQ" on a
 * French AZERTY keyboard is "A"); null where the layout does not say, or for keys whose place is
 * their name (arrows, Space, Shift ...). Pure
 */
export function keycap(code: string, layout: KeyLayout | null): string | null {
  if (!layout || NAMED_KEYS[code] || code.startsWith('Numpad')) return null
  const printed = layout.get(code)
  if (!printed || printed.trim() === '' || [...printed].length > 2) return null
  return printed.toLocaleUpperCase()
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

/**
 * How a KeyboardEvent.code reads on screen: "W", "Space", "Left Shift", or the code itself. A letter
 * or a digit by what is printed on the key, where the browser says (the layout, `watchKeyLayout`);
 * otherwise by its place on a US keyboard
 */
export function keyLabel(code: string, t: KartT, layout: KeyLayout | null = keyLayout): string {
  const named = NAMED_KEYS[code]
  if (named) return t(named)
  const printed = keycap(code, layout)
  if (printed) return printed
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
