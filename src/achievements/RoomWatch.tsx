// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.82): the room page's side of the achievements, small:
// when a game ends while this person watches the room, the room's view goes to the engine (room.ts
// works out what it was). A result already there on joining is not counted again (a reload, a late
// join); nor is a spectator's (room.ts).
import { useEffect, useRef } from 'react'
import type { RoomView } from '../../shared/protocol.ts'

export function RoomWatch({ view, you }: { view: RoomView; you: string }) {
  const result = view.game?.result ?? null
  const last = useRef(result)
  useEffect(() => {
    // The engine's loader straight from here (track.ts would be a chunk of its own in every room)
    if (result && !last.current) {
      import('./load.ts').then(
        ({ loadEngine }) => loadEngine().then((engine) => engine.record({ type: 'room.result', view, you })),
        () => {},
      )
    }
    last.current = result
    // Only the result's coming matters, not every change of the view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])
  return null
}
