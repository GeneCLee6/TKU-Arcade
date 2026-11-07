import { useCallback, useSyncExternalStore } from 'react'

/** Whether a media query holds, kept current. jsdom and very old browsers have no matchMedia: false */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener?.('change', listener)
      return () => list.removeEventListener?.('change', listener)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  )
}

/** Below this the room is one column and its side panels live in a drawer (DESIGN §4) */
export const COMPACT_QUERY = '(max-width: 899px)'
export const useCompact = (): boolean => useMediaQuery(COMPACT_QUERY)

export const useReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)')
