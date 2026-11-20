// e9-t02, e9-t07, e9-t09: what a race of several karts needs on top of the time trial. The grid
// for up to eight, how far round each kart is (for the places), the server's judgement of each frame
// (plausible or not, which gates it crossed, whether a lap ended) and the push two karts give each
// other. Pure: the Worker and the browser run the same code (docs/KART-NETCODE.md).
import { trackLines } from './branches.ts'
import { linesOf, passGates, respawnNear, type Spot } from './course.ts'
import { applyKart, KART_IDS, type KartId } from './karts.ts'
import { ARCADE_TUNING, KART_TUNING, type KartState } from './physics.ts'
import { TEAM_BOOST } from './teamBoost.ts'
import { courseOf, type Track } from './track.ts'
import { KART_RADIUS } from './walls.ts'
import type { KartFrame } from './net.ts'
import type { Warp } from './items.ts'

export const MAX_RACERS = 8

// ── The grid ─────────────────────────────────────────────────────────────────────────────────

/**
 * Where seat `slot` starts: the track's own grid, and past its end the same pattern carried on
 * backwards (each place as far behind the one two before it as that one was behind its own), so
 * that a track drawn for six still seats eight
 */
export function gridSpot(track: Pick<Track, 'grid'>, slot: number): Spot {
  const grid = [...track.grid]
  while (grid.length <= slot) {
    const n = grid.length
    const two = grid[n - 2]
    const four = grid[n - 4]
    if (!two) {
      const last = grid[n - 1]!
      // One place only: the next straight behind it
      grid.push({
        x: last.x - Math.sin(last.heading) * 7,
        z: last.z + Math.cos(last.heading) * 7,
        heading: last.heading,
      })
      continue
    }
    const dx = four ? two.x - four.x : -Math.sin(two.heading) * 7
    const dz = four ? two.z - four.z : Math.cos(two.heading) * 7
    grid.push({ x: two.x + dx, z: two.z + dz, heading: two.heading })
  }
  return grid[slot]!
}

// ── How far round ────────────────────────────────────────────────────────────────────────────

/** Gates passed in order since the start, from course.ts's count of finish line crossings and the next gate */
export function gatesPassed(crossings: number, nextGate: number, gateCount: number): number {
  if (crossings <= 0) return 0
  return (crossings - 1) * gateCount + (nextGate === 0 ? gateCount : nextGate)
}

/** Laps finished: the first crossing only starts lap 1 (the grid is behind the line) */
export const lapsDone = (crossings: number): number => Math.max(0, crossings - 1)

/**
 * A number that grows as a kart goes round: whole gates passed, then a fraction for how close it is
 * to the next one. Sorting by it, biggest first, gives the places of those still racing
 */
export function raceProgress(
  track: Pick<Track, 'gates'> & Pick<Partial<Track>, 'respawns' | 'forks'>,
  crossings: number,
  nextGate: number,
  x: number,
  z: number,
): number {
  const count = track.gates.length
  const passed = gatesPassed(crossings, nextGate, count)
  const mid = (gate: Track['gates'][number]) => ({
    x: (gate.ax + gate.bx) / 2,
    z: (gate.az + gate.bz) / 2,
  })
  const share = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const span = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z))
    const left = Math.hypot(b.x - x, b.z - z)
    return Math.max(0, Math.min(0.999, 1 - left / span))
  }
  // On a track with branches (2026-11-20): the furthest the kart has come from any line of the
  // gate behind towards any line of the next (it is on the road it has come furthest along), so
  // that the share does not jump back where the roads part and meet
  const lines = trackLines(track)
  if (lines) {
    const behind = lines[(nextGate - 1 + count) % count]!.map((line) => mid(line.gate))
    const ahead = lines[nextGate % count]!.map((line) => mid(line.gate))
    return passed + Math.max(...behind.flatMap((a) => ahead.map((b) => share(a, b))))
  }
  return passed + share(mid(track.gates[(nextGate - 1 + count) % count]!), mid(track.gates[nextGate % count]!))
}

// ── Judging frames on the server ─────────────────────────────────────────────────────────────

/**
 * The fastest this kart can go, with every boost stacked, times 1.5: anything faster is a bug (or a
 * cheat, which is not what this is for). Read from the physics with the kart's own numbers
 * (karts.ts), so that a faster kart or a faster tuning moves it too (e10-t05a)
 */
export function speedCapFor(kart: KartId): number {
  // Either feel (2026-11-17): the classic is the default, and the arcade (old) preset can still be
  // chosen on the tuning panel, which a race room drives with
  return Math.max(
    ...[KART_TUNING, ARCADE_TUNING].map((base) => {
      const tuning = applyKart(base, kart)
      const dash =
        tuning.miniTopSpeedFactor + tuning.chainSpeedStep * Math.max(0, tuning.chainSpeedLinks)
      const most = Math.max(
        tuning.boostTopSpeedFactor,
        tuning.boostStackFactor,
        dash,
        // A team race's team boost (teamBoost.ts)
        TEAM_BOOST.topSpeedFactor,
      )
      return tuning.topSpeed * most * 1.5
    }),
  )
}
/** The cap for the fastest kart: what a frame is held to when its kart is not known */
export const SPEED_CAP = Math.max(...KART_IDS.map(speedCapFor))
/** A tick may run this far ahead of the server's clock since GO, in seconds (clocks are never exact) */
export const TICK_LEAD_SECONDS = 1
/** Slack on top of the furthest a kart can go between two frames, metres */
export const JUMP_SLACK = 12
/** A reset lands this close to a respawn point or a grid place, metres */
export const RESET_REACH = 30
/** After frames have been refused this long in a row, the next is taken as where the kart is now */
export const RESYNC_AFTER_MS = 1000
/** A kart catching up on a gate the server missed must be this close past it, metres */
export const CATCH_UP_REACH = 60
/** At most this many gates are counted from one frame to the next */
const MAX_GATES_PER_FRAME = 3

/** What the server remembers of one kart between frames (in memory only) */
export interface Tracked {
  readonly last: KartFrame | null
  /** Server time of the last frame taken */
  readonly lastAt: number
  /** Server time since when frames have been refused, or null */
  readonly refusedSince: number | null
  readonly nextGate: number
  readonly crossings: number
  readonly safe: Spot
  /**
   * e9-t06a: where a swap has sent this kart and has not yet seen it arrive. Its next reset frame
   * there is taken, and the swap's count of gates with it
   */
  readonly warp?: Warp | null
}

export const startTracking = (track: Track, slot: number): Tracked => ({
  last: null,
  lastAt: 0,
  refusedSince: null,
  nextGate: 0,
  crossings: 0,
  safe: gridSpot(track, slot),
})

export type Verdict =
  /** Not believable: dropped, not passed on */
  | { readonly kind: 'refused'; readonly why: RefusedWhy; readonly tracked: Tracked }
  /** Taken: `lapAt` is set when this frame finished a lap, with the race time (ms) it did so */
  | { readonly kind: 'taken'; readonly tracked: Tracked; readonly lapAt: number | null }

export type RefusedWhy = 'speed' | 'tick' | 'jump' | 'reset' | 'old' | 'far'

export interface JudgeContext {
  readonly track: Track
  readonly slot: number
  /** Server time now, and of GO (null before the start is set) */
  readonly now: number
  readonly goAt: number | null
  /** Laps the game has already counted for this kart */
  readonly laps: number
  /** The kart's own speed cap (speedCapFor); SPEED_CAP, the fastest kart's, when left out */
  readonly speedCap?: number
}

const near = (spots: readonly Spot[], x: number, z: number, reach: number) =>
  spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) <= reach)

/** Where along the step from `a` to `b` the line of the gate was crossed, 0 to 1 */
function crossingShare(
  gate: Track['gates'][number],
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const side = (x: number, z: number) =>
    (gate.bx - gate.ax) * (z - gate.az) - (gate.bz - gate.az) * (x - gate.ax)
  const from = side(a.x, a.z)
  const to = side(b.x, b.z)
  return from === to ? 1 : Math.max(0, Math.min(1, from / (from - to)))
}

/**
 * One frame from a kart, judged: believable or not (speed, a tick ahead of the clock, a jump that
 * is not a reset, a reset that lands nowhere a reset can), and if so, which gates it passed, in
 * order, on its way from the last frame. The server counts gates itself; the kart's own count is
 * only believed one gate ahead of the server's, and only right past that gate (a frame lost on the
 * way can hide a crossing), or to pick up the count after the server forgot it.
 */
export function judgeFrame(tracked: Tracked, frame: KartFrame, context: JudgeContext): Verdict {
  const { track, now, goAt } = context
  const cap = context.speedCap ?? SPEED_CAP
  const refuse = (why: RefusedWhy): Verdict => ({
    kind: 'refused',
    why,
    tracked: { ...tracked, refusedSince: tracked.refusedSince ?? now },
  })
  if (Math.abs(frame.x) > 20_000 || Math.abs(frame.z) > 20_000) return refuse('far')
  if (Math.hypot(frame.vx, frame.vz) > cap) return refuse('speed')
  const elapsed = goAt === null ? 0 : (now - goAt) / 1000
  if (frame.tick / 60 > Math.max(0, elapsed) + TICK_LEAD_SECONDS) return refuse('tick')
  const last = tracked.last
  if (last && frame.tick < last.tick) return refuse('old')
  const resync =
    last === null ||
    (tracked.refusedSince !== null && now - tracked.refusedSince >= RESYNC_AFTER_MS)
  const checkpoints = courseOf(track).checkpoints!
  const warp = tracked.warp ?? null
  // A swap's jump: taken with the swap's gates, nothing counted on the way
  if (warp && frame.reset && Math.hypot(frame.x - warp.x, frame.z - warp.z) <= RESET_REACH) {
    const count = checkpoints.gates.length
    return {
      kind: 'taken',
      lapAt: null,
      tracked: {
        last: frame,
        lastAt: now,
        refusedSince: null,
        nextGate: warp.nextGate,
        crossings: warp.crossings,
        safe: respawnNear(checkpoints, (warp.nextGate - 1 + count) % count, warp.x, warp.z),
        warp: null,
      },
    }
  }
  if (!resync && last) {
    if (frame.reset) {
      const spots = [
        ...checkpoints.respawns,
        ...(checkpoints.lines ?? []).flatMap((lines) => lines.slice(1).map((line) => line.respawn)),
        gridSpot(track, context.slot),
      ]
      if (!near(spots, frame.x, frame.z, RESET_REACH)) return refuse('reset')
    } else {
      const seconds = Math.max((frame.tick - last.tick) / 60, (now - tracked.lastAt) / 1000) + 0.1
      if (Math.hypot(frame.x - last.x, frame.z - last.z) > cap * seconds + JUMP_SLACK) {
        return refuse('jump')
      }
    }
  }

  let progress = { nextGate: tracked.nextGate, crossings: tracked.crossings, safe: tracked.safe }
  let lapAt: number | null = null
  const count = checkpoints.gates.length
  const before = lapsDone(progress.crossings)
  // Counted along the step from the last frame, only for a move (a reset or a resync is a jump)
  if (last && !resync && !frame.reset) {
    for (let i = 0; i < MAX_GATES_PER_FRAME; i++) {
      const gate = checkpoints.gates[progress.nextGate]!
      const next = passGates(progress, last, frame, checkpoints, gridSpot(track, context.slot))
      if (next.nextGate === progress.nextGate) break
      if (lapsDone(next.crossings) > lapsDone(progress.crossings)) {
        const share = crossingShare(gate, last, frame)
        lapAt = Math.round(((last.tick + share * (frame.tick - last.tick)) / 60) * 1000)
      }
      const backwards =
        gatesPassed(next.crossings, next.nextGate, count) <
        gatesPassed(progress.crossings, progress.nextGate, count)
      progress = next
      // Backwards over a gate undoes it; nothing further is counted from that step
      if (backwards) {
        lapAt = null
        break
      }
    }
  }
  // The kart's own count, where the server's may have missed a gate or been forgotten
  const claimed = gatesPassed(frame.crossings, frame.nextGate, count)
  const counted = gatesPassed(progress.crossings, progress.nextGate, count)
  const forgotten = last === null && lapsDone(frame.crossings) === context.laps
  if (frame.nextGate < count && (claimed === counted + 1 || (forgotten && claimed > counted))) {
    const passedAt = (frame.nextGate - 1 + count) % count
    // Any line of that gate: on a track with branches, the branch's stand-in too (2026-11-20)
    const near = linesOf(checkpoints, passedAt).some(
      ({ gate }) =>
        Math.hypot(frame.x - (gate.ax + gate.bx) / 2, frame.z - (gate.az + gate.bz) / 2) <=
        CATCH_UP_REACH,
    )
    if (near) {
      progress = {
        nextGate: frame.nextGate,
        crossings: frame.crossings,
        safe: respawnNear(checkpoints, passedAt, frame.x, frame.z),
      }
      if (lapsDone(progress.crossings) > before && !forgotten) {
        lapAt = Math.round((frame.tick / 60) * 1000)
      }
    }
  }
  // A lap the game has not counted yet, and only the next one
  if (lapAt !== null && lapsDone(progress.crossings) !== context.laps + 1) lapAt = null
  return {
    kind: 'taken',
    lapAt,
    tracked: {
      last: frame,
      lastAt: now,
      refusedSince: null,
      nextGate: progress.nextGate,
      crossings: progress.crossings,
      safe: progress.safe,
      warp,
    },
  }
}

// ── Karts bumping into each other ────────────────────────────────────────────────────────────

/** How much of the speed into the other kart is kept, bounced back (0 stops dead, 1 bounces fully) */
export const BUMP_BOUNCE = 0.3
/** A bump always pushes at least this hard apart, m/s, so that two karts touching come apart */
export const BUMP_MIN_PUSH = 2

/**
 * e9-t09: this kart, pushed out of any other it overlaps. Each browser does it for its own kart
 * against where it draws the others; nothing about it is sent, so two screens can disagree a little
 * about a bump, which a race between friends can live with. The other kart is taken to be standing
 * still (its own browser pushes it the other way). e10-t05a: each kart has a mass (karts.ts's
 * `kartMass`, 1 when not given); the lighter of two takes the larger share of the push, equal karts
 * half each. 2026-11-19: and a circle of its own (`kartRadius`): two bikes pass closer than two karts.
 */
export function bumpKart(
  kart: KartState,
  others: readonly {
    readonly x: number
    readonly z: number
    readonly vx: number
    readonly vz: number
    readonly mass?: number
    /** The other's circle, metres (karts.ts's `kartRadius`): a kart's when not given */
    readonly radius?: number
  }[],
  mass = 1,
  /** This kart's own circle */
  radius = KART_RADIUS,
): { kart: KartState; hit: number } {
  let { x, z, vx, vz } = kart
  let hit = 0
  for (const other of others) {
    const reach = radius + (other.radius ?? KART_RADIUS)
    const dx = x - other.x
    const dz = z - other.z
    const distance = Math.hypot(dx, dz)
    if (distance >= reach) continue
    // Exactly on top of each other: apart sideways
    const nx = distance > 1e-6 ? dx / distance : Math.cos(kart.heading)
    const nz = distance > 1e-6 ? dz / distance : Math.sin(kart.heading)
    // Out of the overlap, this kart's share: the other browser moves its kart the rest
    const share = (other.mass ?? 1) / ((other.mass ?? 1) + mass)
    const overlap = reach - distance
    x += nx * overlap * share
    z += nz * overlap * share
    // The closing speed along the line between the two
    const closing = (vx - other.vx) * nx + (vz - other.vz) * nz
    if (closing < 0) {
      const change = -closing * (1 + BUMP_BOUNCE) * share + BUMP_MIN_PUSH
      vx += nx * change
      vz += nz * change
      hit = Math.max(hit, -closing)
    }
  }
  if (hit === 0 && x === kart.x && z === kart.z) return { kart, hit }
  return { kart: { ...kart, x, z, vx, vz }, hit }
}
