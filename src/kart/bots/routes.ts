// 2026-11-20 (docs/ARCHITECTURE.md §4.40): which way round a track with branches the computer's
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
// A track without branches gets the brain it always had, made the same way (the same line, the
// same race). Kept apart from brain.ts so that the brain itself knows nothing of branches.
import { forkAt, routeRoad } from '../../../shared/kart/branches.ts'
import type { KartTuning } from '../../../shared/kart/physics.ts'
import { nearestRoadPoint } from '../../../shared/kart/timeTrial.ts'
import type { Track } from '../../../shared/kart/track.ts'
import type { TrackGuide } from '../../../shared/kart/tracks/guide.ts'
import { routeGuide, trackGuide } from '../../../shared/kart/tracks/guides.ts'
import { createBotBrain, type BotBrain } from './brain.ts'
import type { BotSkill } from './skill.ts'

/** A branch is chosen this many main road points before it leaves */
export const ROUTE_LOOK = 16

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
  if (forks.length === 0) return main
  const route = routeRoad(
    track,
    forks.map((_, index) => index),
  )
  const branchy = createBotBrain(
    skill,
    route.road,
    tuning,
    seed,
    route.jumps,
    track.walls,
    routeGuide(track.id),
  )
  const paths = forks.map((fork) => fork.path)
  /** The branches gone wrong, until they are behind */
  const failed = new Set<number>()
  let resets = 0
  return (trial, sense) => {
    const { kart } = trial.run
    const index = nearestRoadPoint(track.road, kart.x, kart.z)
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
    const take = on >= 0 || (coming >= 0 && (skill.tricks ?? false) && !failed.has(coming))
    // Both every step, so that each sees the kart as it is when it takes over
    const onMain = main(trial, sense)
    const onRoute = branchy(trial, sense)
    return take ? onRoute : onMain
  }
}
