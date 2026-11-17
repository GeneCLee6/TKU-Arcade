import {
  DEFAULT_TOUCH_SETTINGS,
  parseTouchSettings,
  serializeTouchSettings,
  touchInput,
  type TouchButton,
  type TouchMoment,
  type TouchSettings,
} from '../../../shared/kart/touch.ts'
import type { KartInput } from '../../../shared/kart/physics.ts'

// What the on-screen buttons (TouchControls.tsx) hold, read by the game loop every step outside
// React, the way the keyboard's `held` set is (spikeLoop.ts)

const SETTINGS_KEY = 'tku-arcade.kart.touch'

export function loadTouchSettings(): TouchSettings {
  try {
    return parseTouchSettings(window.localStorage.getItem(SETTINGS_KEY))
  } catch {
    return DEFAULT_TOUCH_SETTINGS
  }
}

/** False when the browser would not keep it */
export function saveTouchSettings(settings: TouchSettings): boolean {
  try {
    window.localStorage.setItem(SETTINGS_KEY, serializeTouchSettings(settings))
    return true
  } catch {
    return false
  }
}

export interface TouchSource {
  /** Whether the buttons are on screen: only then do they drive */
  readonly shown: () => boolean
  setShown(shown: boolean): void
  setSettings(settings: TouchSettings): void
  /**
   * What the fingers hold now, and the slider's steering (-1 to 1, 0 without a thumb on it). The
   * first time anything is held, the automatic throttle may start
   */
  hold(buttons: Iterable<TouchButton>, slider: number): void
  setSlider(slider: number): void
  /** A button went down: it counts for the next step even if let go before it */
  tap(button: TouchButton): void
  /** Called when the keys or a gamepad drove: the buttons hide */
  onOtherDevice(listener: (() => void) | undefined): void
  /** The keys or a gamepad drove */
  otherDevice(): void
  /** The input for one step, and the taps used up; null while hidden */
  read(moment: TouchMoment): KartInput | null
  /** Lets go of everything: a panel opened, the window lost focus */
  clear(): void
  /** A short buzz, when shown, allowed in the settings and possible on this phone */
  buzz(ms: number): void
}

export function createTouchSource(initial: TouchSettings, initiallyShown: boolean): TouchSource {
  let shown = initiallyShown
  let settings = initial
  /**
   * A button has been pressed: until then the automatic throttle waits, so that a phone left alone
   * on the menu does not drive off by itself
   */
  let engaged = false
  let held = new Set<TouchButton>()
  const tapped = new Set<TouchButton>()
  let slider = 0
  let listener: (() => void) | undefined
  const clear = () => {
    held = new Set()
    tapped.clear()
    slider = 0
  }
  return {
    shown: () => shown,
    setShown(next) {
      shown = next
      if (!shown) clear()
    },
    setSettings(next) {
      settings = next
    },
    hold(buttons, next) {
      held = new Set(buttons)
      slider = next
      if (held.size > 0 || slider !== 0) engaged = true
    },
    setSlider(next) {
      slider = next
      if (slider !== 0) engaged = true
    },
    tap(button) {
      engaged = true
      tapped.add(button)
    },
    onOtherDevice(next) {
      listener = next
    },
    otherDevice() {
      if (shown) listener?.()
    },
    read(moment) {
      if (!shown) {
        tapped.clear()
        return null
      }
      const input = touchInput(
        { held, tapped, slider },
        engaged ? settings : { ...settings, autoThrottle: false },
        moment,
      )
      tapped.clear()
      return input
    },
    clear,
    buzz(ms) {
      if (!shown || !settings.vibrate) return
      try {
        navigator.vibrate?.(ms)
      } catch {
        // Not allowed here (no gesture yet, a frame without permission): no buzz
      }
    },
  }
}
