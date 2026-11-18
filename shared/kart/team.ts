// The team race (2026-11-18; docs/ARCHITECTURE.md §4.31, docs/KART-NETCODE.md §17, docs/KART-WORLD.md).
// Two teams, red and blue. Pure and shared: the room splits the seats, fills each team's gauge from
// its karts' frames, hands out team boosts and scores the finish with these; the browser shows the
// same split in the waiting room and the same score while the race runs.
//
// Scoring is our own table: the finishing places score 10, 8, 6, 5, 4, 3, 2, 1 and a kart that does
// not finish scores nothing. Each team counts its best K karts, K the size of the smaller team, so
// that three against two is still a contest. The higher total wins; level, the team of the kart that
// finished first.
import type { SeatId } from '../games/types.ts'
import { TEAM_BOOST } from './teamBoost.ts'

export type TeamId = 0 | 1
export const TEAM_IDS: readonly TeamId[] = [0, 1]
/** The teams' names in ids, for strings (`games.kart.team.red`) and test ids */
export const TEAM_NAMES = ['red', 'blue'] as const

export const isTeamId = (value: unknown): value is TeamId => value === 0 || value === 1

/** Points for finishing first, second, ...; beyond the table, and for not finishing, nothing */
export const TEAM_POINTS: readonly number[] = [10, 8, 6, 5, 4, 3, 2, 1]

export const pointsForPlace = (place: number): number => TEAM_POINTS[place - 1] ?? 0

/**
 * Who is on which team. A seat's own choice stands; those without one fill the smaller team in seat
 * order (red first). With two karts or more nobody races alone against nobody: a side left empty
 * takes the last seat of the other
 */
export function assignTeams(seats: readonly { id: SeatId; team?: number }[]): TeamId[] {
  const teams: (TeamId | null)[] = seats.map((seat) => (isTeamId(seat.team) ? seat.team : null))
  const count: [number, number] = [0, 0]
  for (const team of teams) if (team !== null) count[team]++
  const out = teams.map((team) => {
    if (team !== null) return team
    const smaller: TeamId = count[0] <= count[1] ? 0 : 1
    count[smaller]++
    return smaller
  })
  if (out.length >= 2) {
    for (const team of TEAM_IDS) {
      if (count[team] === 0) out[out.length - 1] = team
    }
  }
  return out
}

export interface TeamScore {
  /** Each team's total: its best `counted` karts */
  readonly totals: readonly [number, number]
  /** How many karts of each team count: the size of the smaller team (at least one) */
  readonly counted: number
  /** The points of each kart placed, by seat */
  readonly points: ReadonlyMap<SeatId, number>
  /** Null when nobody has placed */
  readonly winner: TeamId | null
}

/**
 * The score from the karts in the order they placed (`placed`: at the finish, those that finished,
 * first first; during the race, the running order) and everyone's team
 */
export function scoreTeams(
  placed: readonly SeatId[],
  teamOf: (seat: SeatId) => TeamId | null,
  sizes: readonly [number, number],
): TeamScore {
  const counted = Math.max(1, Math.min(sizes[0], sizes[1]))
  const points = new Map<SeatId, number>()
  const best: [number[], number[]] = [[], []]
  placed.forEach((seat, index) => {
    const team = teamOf(seat)
    const earned = pointsForPlace(index + 1)
    points.set(seat, earned)
    if (team !== null) best[team].push(earned)
  })
  // In placing order, so each team's first `counted` are its best
  const total = (team: TeamId) => best[team].slice(0, counted).reduce((sum, one) => sum + one, 0)
  const totals: [number, number] = [total(0), total(1)]
  const first = placed.length > 0 ? teamOf(placed[0]!) : null
  const winner = totals[0] > totals[1] ? 0 : totals[1] > totals[0] ? 1 : first
  return { totals, counted, points, winner }
}

/**
 * The shots that can hit kart `seat`: in a team race a team-mate's pass it by (its own puddle still
 * catches it, as in any race). `teamOf` gives undefined for every seat in a race without sides
 */
export function foeShots<S extends { readonly by: SeatId }>(
  shots: readonly S[],
  seat: SeatId,
  teamOf: (seat: SeatId) => TeamId | undefined,
): readonly S[] {
  const mine = teamOf(seat)
  if (mine === undefined) return shots
  return shots.filter((shot) => shot.by === seat || teamOf(shot.by) !== mine)
}

// ── The team gauge ────────────────────────────────────────────────────────────────────────────────

export const TEAM_GAUGE = {
  /** A full gauge: every kart of the team still racing gets a team boost, and it starts over */
  full: 100,
  /**
   * Points a second one kart earns its team while it drifts at the top speed (in proportion to its
   * speed), before the share below. A kart's own gauge fills at 60: the team's is the slow one
   */
  driftRate: 14,
  /** The speed counts as a share of this, m/s (the standard kart's top speed), up to `speedMax` */
  topSpeed: 68,
  speedMax: 1.25,
  /** Slower than this, a slide earns nothing, m/s (the physics' driftMinSpeed) */
  minSpeed: 12,
  /** Points for a boost that comes on straight out of a drift (an instant boost) ... */
  dashPoints: 5,
  /** ... within this long of the kart's last drifting frame, ms */
  dashWindowMs: 1_500,
  /** Two frames further apart than this count as this far apart, ms: a gap earns no more */
  maxGapMs: 100,
  /** The room tells the browsers the gauge in steps of this many points, not every frame */
  step: 4,
} as const

/** What the room remembers of a kart between two of its frames, for the team gauge */
export interface TeamTrace {
  readonly at: number
  readonly boosting: boolean
  /** When it was last seen drifting; -Infinity for never */
  readonly driftAt: number
}

export const NO_TRACE: TeamTrace = { at: 0, boosting: false, driftAt: -Infinity }

/**
 * What one frame earns its team: the frame as the room took it at `now`, what the room remembered
 * of the kart, how many karts the team has (the points are shared, so that a team of four fills no
 * faster than a team of two) and whether its own team boost is burning (which earns nothing, and
 * is no dash)
 */
export function teamGain(
  trace: TeamTrace,
  frame: {
    readonly vx: number
    readonly vz: number
    readonly drifting: boolean
    readonly boosting: boolean
  },
  now: number,
  teamSize: number,
  burning: boolean,
): { gain: number; trace: TeamTrace } {
  const gap = trace.at > 0 ? Math.max(0, Math.min(TEAM_GAUGE.maxGapMs, now - trace.at)) : 0
  const speed = Math.hypot(frame.vx, frame.vz)
  let gain = 0
  const drifting = frame.drifting && speed >= TEAM_GAUGE.minSpeed
  if (drifting && !burning) {
    const share = Math.min(TEAM_GAUGE.speedMax, speed / TEAM_GAUGE.topSpeed)
    gain += TEAM_GAUGE.driftRate * share * (gap / 1000)
  }
  const driftAt = drifting ? now : trace.driftAt
  if (
    frame.boosting &&
    !trace.boosting &&
    !burning &&
    trace.at > 0 &&
    now - driftAt <= TEAM_GAUGE.dashWindowMs
  ) {
    gain += TEAM_GAUGE.dashPoints
  }
  return {
    gain: gain / Math.max(1, teamSize),
    trace: { at: now, boosting: frame.boosting, driftAt },
  }
}

/** The gauge as the room tells it: down to a step */
export const gaugeStep = (gauge: number): number =>
  Math.max(0, Math.min(TEAM_GAUGE.full, Math.floor(gauge / TEAM_GAUGE.step) * TEAM_GAUGE.step))

// ── A kart's team boosts, in its own browser ──────────────────────────────────────────────────────

/** How long a team boost burns, ms: what the room counts a fired one by */
export const TEAM_BOOST_MS = TEAM_BOOST.seconds * 1000

/**
 * The team boosts a kart may fire now: what the room says it holds, less those this browser has
 * fired that the room has not counted yet (`fired` here against `used` there)
 */
export const teamBoostsLeft = (held: number, used: number, fired: number): number =>
  Math.max(0, held - Math.max(0, fired - used))
