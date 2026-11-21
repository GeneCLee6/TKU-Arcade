// 2026-11-21 (docs/ARCHITECTURE.md §4.52): what a race fetches before its scene is built. Every
// built-in track's own scenery, every vehicle's family and the plan a loading screen waits for.
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_KART, KART_IDS } from '../../shared/kart/karts.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import {
  BODY_FAMILY,
  bodiesLoaded,
  familiesOf,
  familyLoaded,
  loadBodies,
} from '../../src/kart/art/bodyLoad.ts'
import {
  hasOwnScenery,
  loadedScenery,
  loadTrackScenery,
  SCENERY_TRACKS,
} from '../../src/kart/art/trackScenery.ts'
import { loadedSong, songFor } from '../../src/kart/audio/songs.ts'
import { loadKart, peekKartLoad, type EngineSlot } from '../../src/kart/load/kartLoad.ts'

/** What each built-in track's quarter must hold */
const PARTS: Record<string, readonly string[]> = {
  harbour: ['harbour'],
  tamkang: ['tamkang'],
  oldstreet: ['oldStreet'],
  works: ['works', 'skill'],
  wharf: ['wharf', 'skill'],
  lanes: ['lanes', 'skill'],
  mangrove: ['local'],
  fort: ['local'],
  danhai: ['local'],
  datun: ['local'],
}

describe("a track's own scenery", () => {
  it('names only race tracks, and every track that has a quarter of its own', () => {
    expect([...SCENERY_TRACKS].sort()).toEqual(Object.keys(PARTS).sort())
    for (const id of SCENERY_TRACKS) expect(RACE_TRACK_IDS).toContain(id)
  })

  it('is at hand at once for a track with none of its own', () => {
    for (const id of ['riverside', 'guanyin', 'oval', 'custom-abc', 'school']) {
      expect(hasOwnScenery({ id })).toBe(false)
      expect(loadedScenery({ id })).toEqual({})
    }
  })

  it.each(RACE_TRACK_IDS)('%s: fetched, it holds what the art builds with', async (id) => {
    const scenery = await loadTrackScenery({ id })
    expect(loadedScenery({ id })).toBe(scenery)
    expect(Object.keys(scenery).sort()).toEqual([...(PARTS[id] ?? [])].sort())
    if (scenery.harbour) expect(typeof scenery.harbour.buildHarbour).toBe('function')
    if (scenery.tamkang) expect(typeof scenery.tamkang.buildTamkang).toBe('function')
    if (scenery.oldStreet) expect(typeof scenery.oldStreet.buildOldStreet).toBe('function')
    if (scenery.skill) {
      expect(scenery.skill.walls.skillStyleOf(id)).toBe(id)
      expect(typeof scenery.skill.cues.buildSkillCues).toBe('function')
    }
    if (scenery.local) expect(scenery.local.plan.isLocalTrack(id)).toBe(true)
  })
})

describe("the vehicles' families", () => {
  it('has every vehicle in one, and each family file builds exactly its own', async () => {
    expect(Object.keys(BODY_FAMILY).sort()).toEqual([...KART_IDS].sort())
    const files = {
      first: (await import('../../src/kart/art/kartBodies.ts')).FIRST_BODIES,
      more: (await import('../../src/kart/art/moreBodies.ts')).MORE_BODIES,
      bike: (await import('../../src/kart/art/bikeBodies.ts')).BIKE_BODIES,
      item: (await import('../../src/kart/art/itemBodies.ts')).ITEM_BODIES,
      flagship: (await import('../../src/kart/art/flagshipBodies.ts')).FLAGSHIP_BODIES,
    }
    for (const [family, bodies] of Object.entries(files)) {
      expect(Object.keys(bodies).sort()).toEqual(
        KART_IDS.filter((id) => BODY_FAMILY[id] === family).sort(),
      )
    }
    expect(BODY_FAMILY[DEFAULT_KART]).toBe('first')
  })

  it('fetches only the families a grid needs', async () => {
    expect(familiesOf(['tide', 'comet'])).toEqual([])
    expect(familiesOf(['tide', 'swift', 'hornet', 'whale'])).toEqual(['bike', 'more'])
    // The first six come with the engine (vehicleBodies.ts)
    await import('../../src/kart/art/vehicleBodies.ts')
    expect(familyLoaded('first')).toBe(true)
    expect(bodiesLoaded(['tide', 'flyfish'])).toBe(true)
    await loadBodies(['pelican'])
    expect(familyLoaded('item')).toBe(true)
    expect(bodiesLoaded(['tide', 'otter', 'cormorant'])).toBe(true)
    const { bodyReady } = await import('../../src/kart/art/vehicleBodies.ts')
    expect(bodyReady('otter')).toBe(true)
  })
})

describe('the loading plan', () => {
  const slot = <E>(engine: E, fail = 0): EngineSlot<E> & { calls: number } => {
    let here: E | null = null
    let left = fail
    const made = {
      calls: 0,
      load: async () => {
        made.calls++
        if (left > 0) {
          left--
          throw new Error('offline')
        }
        here = engine
        return engine
      },
      peek: () => here,
    }
    return made
  }

  it('reports its progress and ends with the engine, the scenery, the families and the song here', async () => {
    const engine = slot({ name: 'engine' })
    const plan = { engine, track: { id: 'datun' }, bodies: ['tide', 'eel'] as const, music: true }
    expect(peekKartLoad(plan)).toBeNull()
    const seen: number[] = []
    const got = await loadKart(plan, (progress) => seen.push(progress.done / progress.total))
    expect(got).toEqual({ name: 'engine' })
    expect(seen[0]).toBe(0)
    expect(seen.at(-1)).toBe(1)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
    expect(loadedScenery({ id: 'datun' })).not.toBeNull()
    expect(familyLoaded('more')).toBe(true)
    expect(loadedSong(songFor({ id: 'datun' }))).not.toBeNull()
    expect(peekKartLoad(plan)).toEqual({ name: 'engine' })
  })

  it('fails when a part cannot be fetched, and fetches only what is missing on a retry', async () => {
    const engine = slot({ name: 'engine' }, 1)
    const plan = { engine, track: { id: 'riverside' }, bodies: ['tide'] as const }
    await expect(loadKart(plan)).rejects.toThrow('offline')
    expect(peekKartLoad(plan)).toBeNull()
    const progress = vi.fn()
    await expect(loadKart(plan, progress)).resolves.toEqual({ name: 'engine' })
    expect(engine.calls).toBe(3)
    expect(progress).toHaveBeenLastCalledWith({ done: 8, total: 8 })
    // Everything here: nothing to fetch, nothing to wait for
    const again = vi.fn()
    await loadKart(plan, again)
    expect(again).toHaveBeenCalledWith({ done: 0, total: 0 })
  })
})
