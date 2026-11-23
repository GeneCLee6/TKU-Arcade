// 2026-11-23 (owner: "when you first get in there is no sound, only once you start driving; that's
// wrong"): the kart's sound starts the moment the race screen is up, not with the first key.
//
// Why it was silent: the kart's one AudioContext (bus.ts) was made only by a key or a tap on the race
// itself (spikeLoop.ts) or on a results screen (useMenuMusic.ts). The click that took the player into
// the race (Ready, Start, the menu's Race) was on a page that did not listen, so the music's intro,
// the world around the track and the 3, 2, 1 beeps all waited on the first key, which is usually the
// throttle at GO. The engine waited on it too, even with the context there.
//
// Now: the pages on the way to a race (the race room's waiting room, /kart's menus) and the race
// screen itself unlock the context with every gesture (`useKartAudioUnlock`), so that it is running
// before the race is built; the race starts it as it is built where the browser allows it (a page
// already touched: `startKartAudio`); and where it still cannot (a race opened straight from a link,
// nothing touched yet), the race screen asks for a tap (`useKartSoundLocked`, RaceView.tsx).
import { useEffect, useState } from 'react'
import { isSoundOn, useSoundOn } from '../../lib/sound.ts'
import { madeKartBus, onKartBusChange, unlockKartAudio } from './bus.ts'

const unlock = () => {
  unlockKartAudio()
}

/** Every gesture on the page wakes the kart's sound (iOS suspends it in the background) while mounted */
export function useKartAudioUnlock(): void {
  useEffect(() => {
    const options = { capture: true, passive: true } as const
    window.addEventListener('pointerdown', unlock, options)
    window.addEventListener('keydown', unlock, options)
    window.addEventListener('touchend', unlock, options)
    return () => {
      window.removeEventListener('pointerdown', unlock, options)
      window.removeEventListener('keydown', unlock, options)
      window.removeEventListener('touchend', unlock, options)
    }
  }, [])
}

/** Whether this page has been touched (a click, a key): a browser then lets it start sound by itself */
export function pageActivated(): boolean {
  if (typeof navigator === 'undefined') return false
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation
  // A browser without the API (Safari before 16.4): the context is made, suspended, and woken by a tap
  return activation ? activation.hasBeenActive : true
}

/**
 * The race being built: the kart's sound made (or woken) now, if this page may; true when it is
 * there to build on (running, or about to be)
 */
export function startKartAudio(): boolean {
  if (madeKartBus() || pageActivated()) unlockKartAudio()
  return madeKartBus() !== null
}

/** The kart's sound now: 'running', 'suspended' (waiting on a gesture), or 'none' (not made yet) */
export function kartSoundState(): 'running' | 'suspended' | 'none' {
  const bus = madeKartBus()
  if (!bus) return 'none'
  return bus.context.state === 'running' ? 'running' : 'suspended'
}

/** How often the race screen looks whether the sound is running yet, ms */
const LOOK_EVERY_MS = 400

/**
 * Whether the race screen should ask for a tap to start the sound: the site's sound is on, WebAudio
 * is there, and the kart's context is not running (not made, or the browser holds it back)
 */
export function useKartSoundLocked(): boolean {
  const on = useSoundOn()
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!on || typeof window === 'undefined' || typeof window.AudioContext !== 'function') return
    // In the background nothing is asked (the sound is suspended there on purpose)
    const look = () =>
      setLocked(isSoundOn() && document.visibilityState !== 'hidden' && kartSoundState() !== 'running')
    // A moment's grace: a context woken by the gesture that brought the player here is running soon
    const first = window.setTimeout(look, 600)
    const timer = window.setInterval(look, LOOK_EVERY_MS)
    // 2026-11-23 (bus.ts): back from the background, or interrupted (iOS), it is known at once; a
    // wake that is still on its way gets the same grace
    let settle = 0
    const changed = () => {
      window.clearTimeout(settle)
      settle = window.setTimeout(look, 300)
    }
    const stop = onKartBusChange(changed)
    document.addEventListener('visibilitychange', changed)
    return () => {
      window.clearTimeout(first)
      window.clearTimeout(settle)
      window.clearInterval(timer)
      stop()
      document.removeEventListener('visibilitychange', changed)
    }
  }, [on])
  return on && locked
}
