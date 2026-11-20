// 2026-11-20 (docs/ARCHITECTURE.md §4.50): the player's own controls, as they know them: the key
// they bound, the gamepad button, or the on-screen button (§4.25), by whichever they last drove
// with. KeyText.tsx draws them as key caps.
import { useEffect, useState } from 'react'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import { activeControls, type Bindings, type KartAction } from '../../../shared/kart/input.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { keyLabel, padLabel, readGamepad } from '../devices.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

/** What the player drives with now */
export type InputDevice = 'keys' | 'pad' | 'touch'

/** The controls a message may name */
export const NAMED_CONTROLS = [
  'throttle',
  'brake',
  'left',
  'right',
  'drift',
  'boost',
  'reset',
] as const satisfies readonly KartAction[]
export type Named = (typeof NAMED_CONTROLS)[number]

const TOUCH_NAMES: Readonly<Record<Named, KartMessageKey | null>> = {
  throttle: 'kart.touch.gas',
  brake: 'kart.touch.brake',
  left: null,
  right: null,
  drift: 'kart.touch.drift',
  boost: 'kart.touch.boost',
  reset: 'kart.touch.reset',
}

/** Each named control as the player knows it on this device */
export function controlLabels(
  device: InputDevice,
  bindings: Bindings,
  t: KartT,
): Readonly<Record<Named, string>> {
  const label = (action: Named): string => {
    if (device === 'touch') {
      const name = TOUCH_NAMES[action]
      // The steering buttons are arrows on the screen
      return name ? t(name) : action === 'left' ? '◀' : '▶'
    }
    const key = bindings.keys[action].find((code) => code !== null)
    const pad = bindings.pad[action].find((control) => control !== null)
    if (device === 'pad' && pad) return padLabel(pad, t)
    if (key) return keyLabel(key, t)
    return pad ? padLabel(pad, t) : t('kart.controls.none')
  }
  return Object.fromEntries(NAMED_CONTROLS.map((action) => [action, label(action)])) as Record<
    Named,
    string
  >
}

/**
 * Keys or a gamepad, by which was used last: a key press says keys, a gamepad control held says
 * the pad (the Gamepad API has no events, so it is looked at a few times a second). The touch
 * buttons on the screen say touch by themselves (`touch`)
 */
export function useInputDevice(touch: boolean): InputDevice {
  const [device, setDevice] = useState<'keys' | 'pad'>('keys')
  useEffect(() => {
    const onKey = () => setDevice('keys')
    const timer = window.setInterval(() => {
      const pad = readGamepad()
      if (pad && activeControls(pad.snapshot).length > 0) setDevice('pad')
    }, 300)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return touch ? 'touch' : device
}

