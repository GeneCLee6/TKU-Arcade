import type { SilentTableView } from '../../../shared/games/silent-table/types.ts'

export type TableNews =
  | { kind: 'took'; seat: number; chip: number; from: number | null }
  | { kind: 'round'; round: number }
  | { kind: 'level'; level: number }

/**
 * What just happened, from two views in a row. People act at once and there is no talking, so a chip
 * changing hands has to be said somewhere: above all when it was yours.
 */
export function tableNews(before: SilentTableView, after: SilentTableView): TableNews | null {
  if (after.level !== before.level) return { kind: 'level', level: after.level }
  if (after.phase !== 'round') return null
  if (after.round !== before.round) return { kind: 'round', round: after.round }
  for (const player of after.players) {
    const held = before.players[player.seat]?.chip ?? null
    if (player.chip !== null && player.chip !== held) {
      const from = before.players.find(
        (other) => other.seat !== player.seat && other.chip === player.chip,
      )
      return { kind: 'took', seat: player.seat, chip: player.chip, from: from?.seat ?? null }
    }
  }
  return null
}
