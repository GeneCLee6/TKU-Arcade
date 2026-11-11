import type { SeatId } from '../../../shared/games/types.ts'

/** `order` with the seat at `from` moved to `to`; the same order when either is out of range */
export function moveSeat(order: readonly SeatId[], from: number, to: number): SeatId[] {
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < order.length
  if (!inRange(from) || !inRange(to) || from === to) return [...order]
  const next = [...order]
  const [seat] = next.splice(from, 1)
  next.splice(to, 0, seat)
  return next
}
