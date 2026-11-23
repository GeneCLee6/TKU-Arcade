// 2026-11-23 (docs/KART-PERF.md §11): the art of what only some tracks have comes in lazy parts
// (src/kart/art/trackFeatures.ts). What a track is said to need must cover everything its art builds:
// a part left out would leave a hole in the track (its obstacles, its platforms, its lights).
import { describe, expect, it } from 'vitest'
import { trackLedges } from '../../shared/kart/ledges.ts'
import { obstaclesOf } from '../../shared/kart/obstacles.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { isNightTrack } from '../../src/kart/art/trackArt.ts'
import {
  featuresOf,
  loadedFeatures,
  loadTrackFeatures,
} from '../../src/kart/art/trackFeatures.ts'

describe("a track's parts", () => {
  it.each(RACE_TRACK_IDS)('%s: names every part its art builds', (id) => {
    const track = raceTrack(id)!
    const names = featuresOf(track)
    if ((track.forks?.length ?? 0) > 0) expect(names).toContain('forks')
    if (trackLedges(track).length > 0) expect(names).toContain('ledges')
    if ((track.crossings?.length ?? 0) > 0) expect(names).toContain('crossings')
    if (obstaclesOf(track).length > 0) expect(names).toContain('obstacles')
    if (isNightTrack(track)) expect(names).toContain('night')
  })

  it('needs none on Riverside, the most raced track', () => {
    expect(featuresOf(raceTrack('riverside')!)).toEqual([])
    expect(loadedFeatures(raceTrack('riverside')!)).toEqual({})
  })

  it('needs nothing it can tell for a track known by its id alone (a prefetch)', () => {
    expect(featuresOf({ id: 'breakwater' })).toEqual([])
    // The old street is a night by its id (themeName.ts)
    expect(featuresOf({ id: 'oldstreet' })).toEqual(['night'])
  })

  it('fetches them, and has them at hand after', async () => {
    const track = raceTrack('breakwater')!
    const parts = await loadTrackFeatures(track)
    expect(loadedFeatures(track)).toEqual(parts)
    for (const name of featuresOf(track)) expect(parts[name]).toBeDefined()
    expect(typeof parts.forks?.buildForks).toBe('function')
    expect(typeof parts.ledges?.buildLedges).toBe('function')
    const night = await loadTrackFeatures(raceTrack('danhai')!)
    expect(typeof night.night?.createNightKit).toBe('function')
  })
})
