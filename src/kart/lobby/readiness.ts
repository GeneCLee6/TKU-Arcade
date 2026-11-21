// 2026-11-21: who the race room's start waits for, as the room judges it (worker/room-host.ts's
// `notReady`, shared/protocol.ts 8.): everyone seated but the host and the computer karts, until
// they have pressed Ready; someone offline is not ready. Pure, for the waiting room and its tests.
import type { RoomMember } from '../../../shared/protocol.ts'

/** Seated people, in seat order, the host's start waits for */
export function waitingOn(members: Record<string, RoomMember>): RoomMember[] {
  return Object.values(members)
    .filter(
      (member) =>
        member.seat !== null &&
        member.bot === undefined &&
        !member.host &&
        (!member.ready || !member.online),
    )
    .sort((a, b) => (a.seat as number) - (b.seat as number))
}

/** How a member's place shows: the host starts, a computer is always ready */
export type SeatState = 'host' | 'ready' | 'waiting' | 'offline'

export function seatState(member: RoomMember): SeatState {
  if (member.bot) return 'ready'
  if (member.host) return 'host'
  if (!member.online) return 'offline'
  return member.ready ? 'ready' : 'waiting'
}
