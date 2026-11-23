// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.82): a race's feats, from its physics steps as the game
// loop ran them (spikeLoop.ts's steps, through kartHook.ts): the start, the combo, the share spent
// boosting, drift jumps, High Tides, high platforms, wall gaps and real branches. At the finish, one
// `kart.run` event. Pure but for that report: `watchRun` takes steps and gives the event once.
import { forkAt } from '../../shared/kart/branches.ts'
import { onPlatform, trackLedges } from '../../shared/kart/ledges.ts'
import { kartBoosting, STEP_SECONDS, type KartState } from '../../shared/kart/physics.ts'
import type { Trial } from '../../shared/kart/timeTrial.ts'
import { roadDirection, type Track } from '../../shared/kart/track.ts'
import { acrossRoad } from '../../shared/kart/tracks/guide.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import type { KartRunEvent } from './events.ts'

/** One step as the watch needs it (spikeLoop.ts's SpikeStep is one) */
export interface RunStep {
  readonly before: KartState
  readonly after: KartState
  readonly trial: Trial | null
}

/** A gap in a wall across the road: its middle's place, the road's way there, and how far right */
interface Gap {
  readonly mx: number
  readonly mz: number
  readonly dx: number
  readonly dz: number
  readonly across: number
}

/** Half a gap's width and a little, as the school and the challenges judge it (school/judge.ts) */
const GAP_HALF = 5.5
/** Only a crossing this near the road's middle is a crossing of the wall's line */
const GAP_NEAR = 45

function gapsOf(track: Track): Gap[] {
  return (trackGuide(track.id)?.slots ?? []).map((slot) => {
    const middle = acrossRoad(track.road, slot.index, 0)
    const { dx, dz } = roadDirection(track.road, Math.round(slot.index) % track.road.length)
    return { mx: middle.x, mz: middle.z, dx, dz, across: slot.across }
  })
}

export interface RunFacts {
  racing: number
  boosted: number
  maxCombo: number
  perfectStart: boolean
  driftJumps: number
  highTides: number
  platforms: number
  gaps: number
  forks: number
  /** Where the kart was at the last step: on a branch, on a platform; each gap's side of its wall */
  fork: number
  platform: number
  along: (number | null)[]
}

/**
 * Watches one race on `track` in `kart`: give it every step; it gives back the race's event at the
 * step that finishes it, and null at every other
 */
export function watchRun(track: Track, kart: string): (step: RunStep) => KartRunEvent | null {
  const paths = (track.forks ?? []).map((fork) => fork.path)
  // A high platform is a branch too (it rises): reaching it is its own feat, not a branch taken
  const real = (track.forks ?? []).map((fork) => fork.rise === undefined)
  const ledges = trackLedges(track)
  const gaps = gapsOf(track)
  const facts: RunFacts = {
    racing: 0,
    boosted: 0,
    maxCombo: 0,
    perfectStart: false,
    driftJumps: 0,
    highTides: 0,
    platforms: 0,
    gaps: 0,
    forks: 0,
    fork: -1,
    platform: -1,
    along: gaps.map(() => null),
  }
  let over = false
  return ({ before, after, trial }) => {
    if (over || !trial || trial.phase === 'countdown') return null
    if (trial.phase === 'finished') {
      over = true
      return runEvent(facts, trial, track.id, kart)
    }
    facts.racing++
    if (kartBoosting(after)) facts.boosted++
    if (trial.start === 'boost') facts.perfectStart = true
    facts.maxCombo = Math.max(facts.maxCombo, after.chain)
    facts.driftJumps += Math.max(0, (after.driftJumps ?? 0) - (before.driftJumps ?? 0))
    if ((after.teamSeconds ?? 0) > (before.teamSeconds ?? 0) + 1e-9) facts.highTides++
    if (paths.length > 0) {
      const fork = forkAt(track.road, paths, after.x, after.z)
      if (fork >= 0 && fork !== facts.fork && real[fork]) facts.forks++
      facts.fork = fork
    }
    if (ledges.length > 0) {
      const platform = onPlatform(track, ledges, after)
      if (platform >= 0 && platform !== facts.platform) facts.platforms++
      facts.platform = platform
    }
    gaps.forEach((gap, index) => {
      const along = (after.x - gap.mx) * gap.dx + (after.z - gap.mz) * gap.dz
      const right = (after.x - gap.mx) * -gap.dz + (after.z - gap.mz) * gap.dx
      const near = Math.abs(right) < GAP_NEAR
      const was = facts.along[index]
      if (was !== null && was !== undefined && was < 0 && along >= 0 && near) {
        if (Math.abs(right - gap.across) <= GAP_HALF) facts.gaps++
        facts.along[index] = null
      } else {
        facts.along[index] = near && Math.abs(along) < GAP_NEAR ? along : null
      }
    })
    return null
  }
}

function runEvent(facts: RunFacts, trial: Trial, track: string, kart: string): KartRunEvent {
  const ms = (steps: number) => Math.round(steps * STEP_SECONDS * 1000)
  return {
    type: 'kart.run',
    track,
    kart,
    ms: ms(trial.steps),
    bestLapMs: trial.laps.length > 0 ? ms(Math.min(...trial.laps)) : null,
    perfectStart: facts.perfectStart || trial.start === 'boost',
    maxCombo: facts.maxCombo,
    cover: facts.racing > 0 ? facts.boosted / facts.racing : 0,
    boostMs: ms(facts.boosted),
    driftJumps: facts.driftJumps,
    platforms: facts.platforms,
    gaps: facts.gaps,
    forks: facts.forks,
    highTides: facts.highTides,
  }
}
