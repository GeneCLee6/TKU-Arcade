import { useCallback, useEffect, useState } from 'react'
import type { TouchSettings } from '../../../shared/kart/touch.ts'
import {
  createTouchSource,
  loadTouchSettings,
  saveTouchSettings,
  type TouchSource,
} from './touchSource.ts'

export interface TouchControlsState {
  readonly source: TouchSource
  readonly shown: boolean
  readonly settings: TouchSettings
  /** False when the browser would not keep it */
  readonly changeSettings: (next: TouchSettings) => boolean
}

const coarse = (): boolean => {
  try {
    return window.matchMedia?.('(pointer: coarse)').matches ?? false
  } catch {
    return false
  }
}

/**
 * The touch buttons' state for one race screen (2026-11-17): give `source` to the game loop and the
 * whole to TouchControls. Shown on a coarse pointer or after the first touch anywhere; the loop hides
 * them when a driving key or a gamepad is used.
 */
export function useTouchControls(): TouchControlsState {
  const [settings, setSettings] = useState(loadTouchSettings)
  const [shown, setShown] = useState(coarse)
  const [source] = useState(() => createTouchSource(settings, shown))
  useEffect(() => source.setSettings(settings), [source, settings])
  useEffect(() => source.setShown(shown), [source, shown])
  useEffect(() => {
    source.onOtherDevice(() => setShown(false))
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') setShown(true)
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => {
      source.onOtherDevice(undefined)
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
    }
  }, [source])
  const changeSettings = useCallback((next: TouchSettings) => {
    setSettings(next)
    return saveTouchSettings(next)
  }, [])
  return { source, shown, settings, changeSettings }
}
