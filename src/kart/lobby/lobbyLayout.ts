// 2026-11-23 (owner: "the host should be one bigger card on its own, the others smaller"): the order
// of the race room's places and how wide each small one is (KartLobby.tsx). On a screen held
// sideways the host's place is one big card down the left, and the others share two rows beside it
// on a grid of twelve columns: the first row the larger half (four of seven, spanning three each),
// the second the rest (three, spanning four), so that both rows are full. A phone held upright lists
// them in the same order.

/** The columns the small places share */
export const COLUMNS = 12

/** The seats in the order they are shown: the host's first (seat 0 without a seated host), then the rest */
export function placeOrder(seats: number, host: number | null): number[] {
  const all = Array.from({ length: seats }, (_, seat) => seat)
  const lead = host !== null && host >= 0 && host < seats ? host : 0
  return [lead, ...all.filter((seat) => seat !== lead)]
}

/** The columns small place `index` (0 first) of `count` spans: the first row the larger half */
export function spanOf(index: number, count: number): number {
  const top = Math.ceil(count / 2)
  const inRow = index < top ? top : count - top
  return Math.max(1, Math.floor(COLUMNS / Math.max(1, inRow)))
}
