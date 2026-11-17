// The Grand Prix's points (docs/ARCHITECTURE.md §4.23): a table of our own, not any racing game's or
// series'. Every kart scores one point for each kart it finished ahead of, plus one for itself, so
// the last kart still scores and the table grows with the field; the three on the podium of a race
// get a little more (3, 2 and 1), so that winning a race is worth more than just one place. With the
// full field of eight: 11, 9, 7, 5, 4, 3, 2, 1. Karts that share a place (the room ranks those that
// did not finish by laps done, and they share it) share its points. Pure.

/** Extra points for a race's first, second and third */
export const PODIUM_BONUS: readonly number[] = [3, 2, 1]

/** The points for finishing `rank` (1 is first) in a field of `field` karts */
export function racePoints(rank: number, field: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > field) return 0
  return field - rank + 1 + (PODIUM_BONUS[rank - 1] ?? 0)
}

/** One kart's line of the cup's table */
export interface CupLine {
  readonly seat: number
  readonly points: number
  /** Each race's points so far, in racing order */
  readonly races: readonly number[]
  readonly wins: number
  /** Its place in the latest race */
  readonly lastRank: number
}

/**
 * The cup's table after `results` (each race: every seat's rank, by seat), best first. Points first;
 * level on points, more wins; then the better place in the latest race; then the lower seat
 */
export function cupTable(results: readonly (readonly number[])[], seats: number): CupLine[] {
  const lines: CupLine[] = Array.from({ length: seats }, (_, seat) => {
    const races = results.map((ranks) => racePoints(ranks[seat] ?? seats, seats))
    return {
      seat,
      points: races.reduce((sum, one) => sum + one, 0),
      races,
      wins: results.filter((ranks) => ranks[seat] === 1).length,
      lastRank: results.at(-1)?.[seat] ?? seats,
    }
  })
  return lines.sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.lastRank - b.lastRank || a.seat - b.seat,
  )
}
