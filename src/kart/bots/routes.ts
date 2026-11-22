// 2026-11-20 (docs/ARCHITECTURE.md §4.41): which way round a track with branches the computer's
// hands go (shared/kart/branches.ts). The brain (brain.ts) drives one closed centre line; on such a
// track there are two: the main road, and the route down every branch (`routeRoad`). Each has a
// brain of its own, with the main road's guide or the route's (shared/kart/tracks/guides.ts), and
// at every step one of them drives:
//
// - on a branch, the route's: whoever is down one (by choice, or because a wide line took them in)
//   drives it out;
// - coming to a branch, the route's for hands that know the shortcuts (`skill.tricks`), the main
//   road's for everyone else;
// - and once a branch has gone wrong (a reset on the way to it, or on it), the main road's until
//   the branch is behind, so that a kart that cannot make the jump into it does not try for ever.
//
// - coming to a high platform (2026-11-23, shared/kart/ledges.ts), the route's only for hands that
//   know the shortcuts and only while the kart is fast enough to fly onto it (`ledgeChoice`): a
//   charge is fired for it when that is what it takes, and too slow at the last moment the hands
//   keep to the main road. A kart that met the face anyway is on the branch below the platform:
//   the main road's hands take it back out.
//
// A track without branches gets the brain it always had, made the same way (the same line, the
// same race). Kept apart from brain.ts so that the brain itself knows nothing of branches.
import { forkAt, routeRoad } from '../../../shared/kart/branches.ts'
import { trackLedges, type Ledge } from '../../../shared/kart/ledges.ts'
import type { KartState, KartTuning } from '../../../shared/kart/physics.ts'
import { nearestRoadPoint } from '../../../shared/kart/timeTrial.ts'
import type { Track } from '../../../shared/kart/track.ts'
import type { TrackGuide } from '../../../shared/kart/tracks/guide.ts'
import { routeGuide, trackGuide } from '../../../shared/kart/tracks/guides.ts'
import { createBotBrain, type BotBrain } from './brain.ts'
import { withObstacles } from './obstacleSense.ts'
import type { BotSkill } from './skill.ts'

/** A branch is chosen this many main road points before it leaves */
export const ROUTE_LOOK = 16

/**
 * A high platform (2026-11-23): the hands commit this far before the lip, metres; until then they
 * go for it while the kart is within `LEDGE_HOPE` m/s of what it needs (it is still gathering speed),
 * and at the commit only with `LEDGE_MARGIN` m/s to spare. A charge held is fired for it from
 * `LEDGE_FIRE` metres before the lip, when the kart is short of that
 */
export const LEDGE_COMMIT = 24
const LEDGE_HOPE = 6
export const LEDGE_MARGIN = 1
const LEDGE_FIRE = 140
/**
 * Stopped against a platform's face (on the ground in front of it, this slow, facing it within
 * BACK_FACING radians), the hands back away from it for BACK_STEPS steps before they drive on: a
 * kart nose to a wall cannot turn away from it
 */
const BACK_SPEED = 4
const BACK_FACING = 1.2
const BACK_STEPS = 45
/**
 * Going for a platform, the hands aim the kart's way from this far before the lip, metres, at a point
 * between the lip's middle and the face's: the flight goes on the way the kart leaves the lip, so it
 * must leave slanting towards the face, through the mouth (the line the guide draws is not enough
 * at that speed); this hard, per radian
 */
const AIM_FROM = 60
const AIM_GAIN = 3
/** ... at the point this share of the way from the lip's middle to the face's (1: the face's) */
const AIM_SHARE = 1

/**
 * Whether hands that know the shortcuts take a high platform, and whether they fire a charge for
 * it: `ahead` metres before its lip, the kart as it is. Pure: the same kart, the same choice
 */
export function ledgeChoice(
  ledge: Ledge,
  kart: KartState,
  ahead: number,
): { take: boolean; fire: boolean } {
  const speed = Math.hypot(kart.vx, kart.vz)
  const boosting = kart.boostSeconds > 0 || kart.miniSeconds > 0
  const want = ledge.need + LEDGE_MARGIN
  const fire = !boosting && kart.storedBoosts > 0 && speed < want && ahead <= LEDGE_FIRE && ahead > 0
  if (ahead > LEDGE_COMMIT) return { take: speed >= want - LEDGE_HOPE || boosting || fire, fire }
  return { take: speed >= want || (boosting && speed >= want - LEDGE_HOPE / 2), fire: false }
}

/** Metres along the main road from road point `index` to road point `to`, going forwards */
function metresTo(track: Track, index: number, to: number): number {
  const { road } = track
  const count = road.length
  let metres = 0
  for (let at = index; at !== to; at = (at + 1) % count) {
    const next = road[(at + 1) % count]!
    metres += Math.hypot(next.x - road[at]!.x, next.z - road[at]!.z)
    if (metres > 2_000) break
  }
  return metres
}

const wrapAngle = (angle: number): number => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

/** Whether a kart on a platform's branch is nearer a point of it before the face than after */
function beforeFace(path: readonly { x: number; z: number }[], rise: number, kart: KartState): boolean {
  let best = 0
  path.forEach((point, index) => {
    if (Math.hypot(point.x - kart.x, point.z - kart.z) < Math.hypot(path[best]!.x - kart.x, path[best]!.z - kart.z))
      best = index
  })
  return best < rise
}

/** The main road point (x, z) is nearest, and the branch it is coming to or on, if any */
function approach(track: Track, index: number): number {
  const forks = track.forks ?? []
  const count = track.road.length
  return forks.findIndex((fork) => {
    const before = (fork.from - index + count) % count
    return before <= ROUTE_LOOK || (index > fork.from && index <= fork.to)
  })
}

/**
 * The hands for `track`: on a track with branches, the two brains and the choice between them;
 * otherwise createBotBrain as it always was. `guide` overrides the main road's guide (tests)
 */
export function createTrackBrain(
  skill: BotSkill,
  track: Track,
  tuning: KartTuning,
  seed: number,
  guide: TrackGuide | undefined = trackGuide(track.id),
): BotBrain {
  const main = createBotBrain(skill, track.road, tuning, seed, track.jumps, track.walls, guide)
  const forks = track.forks ?? []
  // 2026-11-22: minding the moving obstacles, on a track that has any (obstacleSense.ts)
  if (forks.length === 0) return withObstacles(main, track, tuning)
  const route = routeRoad(
    track,
    forks.map((_, index) => index),
  )
  // The lips flown onto a high platform (2026-11-23): full speed off them on the route
  const flyLips = route.jumps.filter((lip) => {
    const from = route.from[lip]!
    return from.fork < 0 && forks.some((fork) => fork.rise !== undefined && fork.from === from.index)
  })
  const branchy = createBotBrain(
    skill,
    route.road,
    tuning,
    seed,
    route.jumps,
    track.walls,
    routeGuide(track.id),
    flyLips,
  )
  const paths = forks.map((fork) => fork.path)
  /** The branches gone wrong, until they are behind */
  const failed = new Set<number>()
  let resets = 0
  // High platforms (2026-11-23), by branch
  const ledges = new Map<number, Ledge>(trackLedges(track).map((ledge) => [ledge.fork, ledge]))
  /** Each platform's choice once committed to, until it is behind */
  const committed = new Map<number, boolean>()
  /** Steps left backing away from a platform's face */
  let backing = 0
  /** The platform being aimed for this step, if any */
  let aim: Ledge | null = null
  return withObstacles((trial, sense) => {
    const { kart } = trial.run
    const index = nearestRoadPoint(track.road, kart.x, kart.z, kart.y)
    const coming = approach(track, index)
    const on = forkAt(track.road, paths, kart.x, kart.z)
    if (trial.run.resets > resets) {
      const at = on >= 0 ? on : coming
      if (at >= 0) failed.add(at)
    }
    resets = trial.run.resets
    for (const k of failed) {
      if (on !== k && coming !== k) failed.delete(k)
    }
    for (const k of committed.keys()) {
      if (on !== k && coming !== k) committed.delete(k)
    }
    let take = on >= 0 || (coming >= 0 && (skill.tricks ?? false) && !failed.has(coming))
    let fire = false
    aim = null
    const ledge = ledges.get(on >= 0 ? on : coming)
    if (ledge && take) {
      const k = ledge.fork
      // Hands kept off the platforms (skill.platforms false) keep to the main road there
      if (on !== k && skill.platforms === false) take = false
      else if (on === k) {
        // Down on the branch below the platform (the face met): the main road's hands drive out
        if (!kart.air && (kart.y ?? 0) < ledge.top - 1 && beforeFace(forks[k]!.path, forks[k]!.rise!, kart)) {
          take = false
          failed.add(k)
          // Nose to the face and stopped: back away first
          const { path, rise } = forks[k]!
          const foot = path[rise! - 1]!
          const head = path[rise!]!
          const facing = Math.abs(
            wrapAngle(kart.heading - Math.atan2(head.x - foot.x, -(head.z - foot.z))),
          )
          if (backing === 0 && Math.hypot(kart.vx, kart.vz) < BACK_SPEED && facing < BACK_FACING) {
            backing = BACK_STEPS
          }
        }
      } else if (index !== forks[k]!.from || !kart.air) {
        const ahead = index === forks[k]!.from ? 0 : metresTo(track, index, forks[k]!.from)
        const choice = committed.has(k)
          ? { take: committed.get(k)!, fire: false }
          : ledgeChoice(ledge, kart, ahead)
        if (ahead <= LEDGE_COMMIT && !committed.has(k)) committed.set(k, choice.take)
        take = choice.take
        fire = choice.fire
        if (take && ahead <= AIM_FROM && !kart.air) aim = ledge
      }
    }
    // Both every step, so that each sees the kart as it is when it takes over
    const onMain = main(trial, sense)
    const onRoute = branchy(trial, sense)
    if (backing > 0 && trial.phase === 'racing') {
      backing--
      return { ...onMain, reset: false, throttle: false, brake: true, boost: false, drift: false, steer: 0 }
    }
    let chosen = take ? onRoute : onMain
    if (aim) {
      const travel = Math.atan2(kart.vx, -kart.vz)
      // A point on the way from the lip's middle to the face's: through the mouth, slanting
      const tx = aim.lip.x + (aim.faceX - aim.lip.x) * AIM_SHARE
      const tz = aim.lip.z + (aim.faceZ - aim.lip.z) * AIM_SHARE
      const want = Math.atan2(tx - kart.x, -(tz - kart.z))
      const steer = Math.max(-1, Math.min(1, wrapAngle(want - travel) * AIM_GAIN))
      chosen = { ...chosen, steer, drift: false }
    }
    return fire ? { ...chosen, boost: true } : chosen
  }, track, tuning)
}
