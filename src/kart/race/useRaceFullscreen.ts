// 2026-11-22 (owner: "let the web page and the app be played full screen"): on the way into a race,
// full screen by itself when the setting asks for it (src/lib/fullscreen.ts: on the first key or tap,
// as a browser wants), and a phone held on its side where the browser lets a page lock it (Chrome on
// Android in full screen, an installed app); elsewhere the race's "turn your phone" hint stays.
// Leaving the race lets the screen turn again; full screen itself stays until the person leaves it.
import { useEffect } from 'react'
import {
  armAutoFullscreen,
  fullscreenMode,
  lockLandscape,
  subscribeFullscreen,
  unlockOrientation,
} from '../../lib/fullscreen.ts'

export function useRaceFullscreen(): void {
  useEffect(() => {
    const undo = armAutoFullscreen()
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    if (!coarse) return undo
    let locked = false
    const tryLock = () => {
      if (locked) return
      void lockLandscape().then((held) => {
        locked = held
      })
    }
    // An installed app may lock without full screen; a browser tab only once it is full screen
    tryLock()
    const off = subscribeFullscreen(() => {
      if (fullscreenMode() === 'fullscreen') tryLock()
      else locked = false
    })
    return () => {
      undo()
      off()
      unlockOrientation()
    }
  }, [])
}
