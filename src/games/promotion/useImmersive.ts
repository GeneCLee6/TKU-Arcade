import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { inertOthers } from '../../lib/inertOthers.ts'

/**
 * How the board fills the screen (e3-t10): not at all, through the browser's Fullscreen API, or where
 * that is missing or refused (an iPhone, a frame without permission) as "focus mode": the same layout
 * over the page's own chrome instead of the browser's
 */
export type Immersion = 'off' | 'fullscreen' | 'focus'

export interface ImmersiveControls {
  mode: Immersion
  enter(): Promise<void>
  exit(): void
}

const leaveFullscreen = () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
}

/**
 * Fullscreen for one element, with the fallback, never a button that does nothing. Esc leaves either:
 * the browser's own for real fullscreen, a listener here for focus mode. The choice is not
 * remembered: the browser wants a tap before every fullscreen, and a page that came back covering
 * itself would surprise.
 */
export function useImmersive(target: RefObject<HTMLElement | null>): ImmersiveControls {
  const [mode, setMode] = useState<Immersion>('off')

  const exit = useCallback(() => {
    leaveFullscreen()
    setMode('off')
  }, [])

  const enter = useCallback(async () => {
    try {
      await target.current?.requestFullscreen()
      setMode('fullscreen')
    } catch {
      setMode('focus')
    }
  }, [target])

  useEffect(() => {
    if (mode === 'off') return undefined
    // The browser's Esc leaves real fullscreen, and the page hears of it here
    const onChange = () => {
      if (!document.fullscreenElement) setMode('off')
    }
    // An open dialog (the square's drawer) takes that Esc for itself: only it closes
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) exit()
    }
    document.addEventListener('fullscreenchange', onChange)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('keydown', onKey)
    }
  }, [mode, exit])

  // The page behind is out of reach while the board covers it (#112 of docs/NEXT.md §5): no Tab stop,
  // tap or screen reader there, as behind a modal; the frame (the square's drawer and the decision
  // card are inside it) and what is marked data-inert-keep (toasts, the update prompt, reactions'
  // live region) stay. The focus goes in with it, to the frame's way out, and comes back to the
  // button that went in
  const covered = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (mode === 'off') return undefined
    const element = target.current
    if (element === null) return undefined
    covered.current = element
    const undo = inertOthers([element])
    if (!element.contains(document.activeElement)) {
      element.querySelector<HTMLElement>('[data-immersive-exit]')?.focus()
    }
    return undo
  }, [mode, target])
  useEffect(() => {
    const frame = covered.current
    if (mode !== 'off' || frame === null) return
    covered.current = null
    const active = document.activeElement
    if (active === null || active === document.body || frame.contains(active)) {
      frame.querySelector<HTMLElement>('[data-immersive-enter]')?.focus()
    }
  }, [mode])

  return { mode, enter, exit }
}
