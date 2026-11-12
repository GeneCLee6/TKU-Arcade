import { useCallback, useEffect, useState, type RefObject } from 'react'

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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exit()
    }
    document.addEventListener('fullscreenchange', onChange)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('keydown', onKey)
    }
  }, [mode, exit])

  return { mode, enter, exit }
}
