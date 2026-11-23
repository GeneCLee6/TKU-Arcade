import { describe, expect, it } from 'vitest'
import { trackLedges } from '../../shared/kart/ledges.ts'
import { INITIAL_KART, type KartState } from '../../shared/kart/physics.ts'
import type { Trial, TrialPhase, TrialStart } from '../../shared/kart/timeTrial.ts'
import { roadDirection, type Track } from '../../shared/kart/track.ts'
import { acrossRoad } from '../../shared/kart/tracks/guide.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { watchRun, type RunStep } from '../../src/achievements/kartRun.ts'

const trial = (phase: TrialPhase, steps: number, start: TrialStart = 'none', laps: number[] = []): Trial =>
  ({ phase, steps, start, laps }) as unknown as Trial

const kart = (over: Partial<KartState> = {}): KartState => ({ ...INITIAL_KART, ...over })

/** Runs the steps through a watch; returns every event it gave */
function drive(track: Track, steps: RunStep[]) {
  const watch = watchRun(track, 'tide')
  return steps.map(watch).filter((event) => event !== null)
}

const riverside = raceTrack('riverside')!

describe('watching a race', () => {
  it('gives one event, at the finish, with the start, the combo and the share boosting', () => {
    const steps: RunStep[] = [
      { before: kart(), after: kart(), trial: trial('countdown', 0) },
      { before: kart(), after: kart({ boostSeconds: 1, chain: 2 }), trial: trial('racing', 1, 'boost') },
      { before: kart(), after: kart({ chain: 11 }), trial: trial('racing', 2, 'boost') },
      { before: kart(), after: kart({ chain: 0 }), trial: trial('racing', 3, 'boost') },
      { before: kart(), after: kart({ miniSeconds: 0.5 }), trial: trial('racing', 4, 'boost') },
      { before: kart(), after: kart(), trial: trial('finished', 5, 'boost', [120, 90]) },
      { before: kart(), after: kart(), trial: trial('finished', 6, 'boost', [120, 90]) },
    ]
    const events = drive(riverside, steps)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'kart.run',
      track: 'riverside',
      kart: 'tide',
      perfectStart: true,
      maxCombo: 11,
      cover: 0.5,
      bestLapMs: 1500,
      ms: 83,
    })
  })

  it('no perfect start, nothing before GO, no event without a finish', () => {
    const steps: RunStep[] = [
      { before: kart(), after: kart({ chain: 20 }), trial: trial('countdown', 0) },
      { before: kart(), after: kart(), trial: trial('racing', 1, 'quick') },
    ]
    expect(drive(riverside, steps)).toEqual([])
    const done = drive(riverside, [...steps, { before: kart(), after: kart(), trial: trial('finished', 2, 'quick') }])
    expect(done[0]).toMatchObject({ perfectStart: false, maxCombo: 0, bestLapMs: null })
  })

  it('counts drift jumps and High Tides as they happen', () => {
    const steps: RunStep[] = [
      { before: kart({ driftJumps: 0 }), after: kart({ driftJumps: 1 }), trial: trial('racing', 1) },
      { before: kart({ driftJumps: 1 }), after: kart({ driftJumps: 1, teamSeconds: 2 }), trial: trial('racing', 2) },
      { before: kart({ teamSeconds: 2 }), after: kart({ teamSeconds: 1.9 }), trial: trial('racing', 3) },
      { before: kart(), after: kart(), trial: trial('finished', 4) },
    ]
    expect(drive(riverside, steps)[0]).toMatchObject({ driftJumps: 1, highTides: 1 })
  })

  it('counts a real branch taken once, and a high platform as its own', () => {
    const wharf = raceTrack('wharf')!
    // Branch 0 is a real one; branch 1 rises (the platform)
    const branch = wharf.forks![0]!.path
    const mid = branch[Math.floor(branch.length / 2)]!
    const ledge = trackLedges(wharf)[0]!
    const up = wharf.forks![ledge.fork]!.path
    const top = up[Math.floor(up.length / 2)]!
    const at = (x: number, z: number, y = 0) => kart({ x, z, y })
    const steps: RunStep[] = [
      { before: kart(), after: at(mid.x, mid.z), trial: trial('racing', 1) },
      { before: kart(), after: at(mid.x, mid.z), trial: trial('racing', 2) },
      { before: kart(), after: at(top.x, top.z, ledge.top), trial: trial('racing', 3) },
      { before: kart(), after: at(top.x, top.z, ledge.top), trial: trial('racing', 4) },
      { before: kart(), after: kart(), trial: trial('finished', 5) },
    ]
    expect(drive(wharf, steps)[0]).toMatchObject({ forks: 1, platforms: 1 })
  })

  it('counts a gap driven through, not one driven round', () => {
    const lanes = raceTrack('lanes')!
    const slot = trackGuide('lanes')!.slots[0]!
    const middle = acrossRoad(lanes.road, slot.index, 0)
    const { dx, dz } = roadDirection(lanes.road, Math.round(slot.index) % lanes.road.length)
    /** A place `along` the road from the wall's line and `right` of the road's middle */
    const place = (along: number, right: number) =>
      kart({ x: middle.x + dx * along - dz * right, z: middle.z + dz * along + dx * right })
    const through = (right: number): RunStep[] => [
      { before: kart(), after: place(-3, right), trial: trial('racing', 1) },
      { before: kart(), after: place(2, right), trial: trial('racing', 2) },
      { before: kart(), after: kart(), trial: trial('finished', 3) },
    ]
    expect(drive(lanes, through(slot.across))[0]).toMatchObject({ gaps: 1 })
    expect(drive(lanes, through(slot.across + 12))[0]).toMatchObject({ gaps: 0 })
  })
})
