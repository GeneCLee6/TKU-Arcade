// 2026-11-17: in the host's browser, the race room's computer karts are driven from here
// (src/kart/bots/roomBots.ts, loaded only then: it is the kart's physics and the bots' brains). It
// sits under the race screen, so the bots keep going whatever the host is looking at: racing,
// watching, the standings. A new race (a new seed) starts them again; the end of it stops them.
import { useEffect, useRef } from 'react'
import type { KartView } from '../../../shared/games/kart/types.ts'
import type { RoomParts } from '../../components/GameLayout.tsx'
import type { RoomBot } from '../../kart/bots/roomBots.ts'

export function useRoomBots(view: KartView, room: RoomParts): void {
  const latest = useRef(view)
  useEffect(() => {
    latest.current = view
  }, [view])

  const isHost = room.view.members[room.you]?.host === true
  const bots: RoomBot[] = Object.values(room.view.members)
    .filter((member) => member.bot && member.seat !== null)
    .filter((member) => view.racers.some((racer) => racer.seat === member.seat))
    .map((member) => ({
      seat: member.seat as number,
      level: member.bot!.level,
      name: member.bot!.name,
      ...(member.look !== undefined ? { look: member.look } : {}),
    }))
  const { realtime, actFor } = room
  // Everything that would make them other bots, or no bots at all
  const key =
    isHost && bots.length > 0 && view.phase !== 'finished' && realtime && actFor
      ? `${view.seed}|${JSON.stringify(bots)}`
      : null

  useEffect(() => {
    if (key === null || !realtime || !actFor) return
    const list = key.slice(key.indexOf('|') + 1)
    let stop: (() => void) | null = null
    let cancelled = false
    void import('../../kart/bots/roomBots.ts').then(({ startRoomBots }) => {
      if (cancelled) return
      stop = startRoomBots({
        realtime,
        actFor,
        view: () => latest.current,
        bots: JSON.parse(list) as RoomBot[],
      })
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [key, realtime, actFor])
}
