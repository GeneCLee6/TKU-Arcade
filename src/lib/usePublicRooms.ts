import { useEffect, useState } from 'react'
import { LOBBY_POLL_MS, type RoomListing } from '../../shared/protocol.ts'
import { fetchPublicRooms } from './rooms.ts'

export type PublicRooms = {
  /** Null until the first answer */
  rooms: RoomListing[] | null
  /** The last attempt failed; `rooms` is what we had */
  failed: boolean
}

/** The public room list, kept fresh while the page is visible (a hidden tab costs nothing) */
export function usePublicRooms(): PublicRooms {
  const [state, setState] = useState<PublicRooms>({ rooms: null, failed: false })

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let latest = 0

    const poll = async () => {
      const mine = ++latest
      clearTimeout(timer)
      const rooms = await fetchPublicRooms(controller.signal)
      // Coming back to the tab starts a new one: only the newest goes on, or there would be two loops
      if (controller.signal.aborted || mine !== latest) return
      setState((previous) => (rooms ? { rooms, failed: false } : { ...previous, failed: true }))
      if (!document.hidden) timer = setTimeout(() => void poll(), LOBBY_POLL_MS)
    }

    const handleVisibility = () => {
      clearTimeout(timer)
      if (!document.hidden) void poll()
    }

    void poll()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return state
}
