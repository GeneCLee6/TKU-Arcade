import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  finishRecording,
  ghostAt,
  GHOST_STEPS,
  parseGhost,
  recordStep,
  startRecording,
  type Ghost,
} from '../../shared/kart/ghost.ts'
import type { KartId } from '../../shared/kart/karts.ts'
import {
  ghostKeyOf,
  memoryGhostStore,
  openIndexedGhostStore,
  type GhostStore,
} from '../../src/kart/ghostStore.ts'
import {
  keepIfBetter,
  loadBestLap,
  loadBestRun,
  loadGhost,
  loadGhostPick,
  loadKartBestLap,
  loadKartBestRun,
  loadKartGhost,
  MAX_GHOSTS,
  saveGhostPick,
  setGhostStore,
  settleGhosts,
} from '../../src/kart/records.ts'

// e8-t11 (AC-8.4): the best run, recorded, played back and kept

function straightRun(total: number, speed: number) {
  const recorder = startRecording('test-oval')
  for (let step = 0; step <= total; step++)
    recordStep(recorder, step, { x: 0, z: -step * speed, heading: 0 })
  return finishRecording(recorder, total, [total])
}

describe('the ghost', () => {
  it('keeps one sample every few steps, and plays back between them', () => {
    const ghost = straightRun(60, 0.5)
    expect(ghost.samples).toHaveLength((60 / GHOST_STEPS + 1) * 3)
    expect(ghostAt(ghost, 0)).toEqual({ x: 0, z: 0, heading: 0 })
    // Between two samples: in between
    expect(ghostAt(ghost, 4)!.z).toBeCloseTo(-2)
    // After the finish it waits where it finished
    expect(ghostAt(ghost, 600)!.z).toBeCloseTo(-30)
  })

  it('turns the short way across ±π', () => {
    const recorder = startRecording('test-oval')
    recordStep(recorder, 0, { x: 0, z: 0, heading: 3.1 })
    recordStep(recorder, 3, { x: 0, z: 0, heading: -3.1 })
    const ghost = finishRecording(recorder, 3, [3])
    const between = ghostAt(ghost, 1.5)!.heading
    expect(Math.abs(Math.abs(between) - Math.PI)).toBeLessThan(0.05)
  })

  it('refuses what storage gives back when it is not a ghost of this track', () => {
    const ghost = straightRun(30, 1)
    const json = JSON.parse(JSON.stringify(ghost))
    expect(parseGhost(json, 'test-oval')).toEqual(ghost)
    expect(parseGhost(json, 'riverside')).toBeNull()
    expect(parseGhost({ ...json, samples: [1, 2] }, 'test-oval')).toBeNull()
    expect(parseGhost({ ...json, samples: ['a', 2, 3] }, 'test-oval')).toBeNull()
    expect(parseGhost({ ...json, total: -1 }, 'test-oval')).toBeNull()
    expect(parseGhost(null, 'test-oval')).toBeNull()
  })
})

/** A fresh IndexedDB (fake-indexeddb) for every test, as the records' store */
async function freshStore(): Promise<GhostStore> {
  const store = await openIndexedGhostStore(new IDBFactory())
  if (!store) throw new Error('no store')
  setGhostStore(store)
  return store
}

describe('the records', () => {
  beforeEach(async () => {
    localStorage.clear()
    await freshStore()
  })

  it('keep the faster run and the faster lap, apart', async () => {
    const first = { ...straightRun(30, 1), total: 900, laps: [320, 290, 290] }
    expect(keepIfBetter(first)).toMatchObject({
      bestRun: true,
      bestLap: true,
      runSteps: 900,
      lapSteps: 290,
    })
    // Slower overall, one faster lap
    const second = { ...first, total: 950, laps: [300, 280, 370] }
    expect(keepIfBetter(second)).toMatchObject({
      bestRun: false,
      bestLap: true,
      runSteps: 900,
      lapSteps: 280,
    })
    expect((await loadGhost('test-oval'))?.total).toBe(900)
    expect(loadBestRun('test-oval')?.total).toBe(900)
    expect(loadBestLap('test-oval')).toBe(280)
    expect(await loadGhost('riverside')).toBeNull()
  })

  it('shrug off a broken entry', async () => {
    localStorage.setItem('tku-arcade.kart.ghost.test-oval', '{not json')
    localStorage.setItem('tku-arcade.kart.bestRun.riverside', '{"total":"no"}')
    expect(await loadGhost('test-oval')).toBeNull()
    expect(loadBestRun('riverside')).toBeNull()
  })
})

// 2026-11-17 (docs/ARCHITECTURE.md §4.24): the records of each kart, beside the track's overall ones
describe('each kart’s records', () => {
  beforeEach(async () => {
    localStorage.clear()
    await freshStore()
  })

  const run = (total: number, laps: number[], kart?: KartId): Ghost => ({
    ...straightRun(30, 1),
    total,
    laps,
    ...(kart ? { kart } : {}),
  })

  it('keep the overall best and each kart’s best apart', async () => {
    expect(keepIfBetter(run(900, [300, 300, 300], 'heron'))).toMatchObject({
      bestRun: true,
      kartBestRun: true,
      kartRunSteps: 900,
    })
    // A slower kart: not the track's record, but its own
    expect(keepIfBetter(run(960, [330, 310, 320], 'tide'))).toMatchObject({
      bestRun: false,
      runSteps: 900,
      kartBestRun: true,
      kartRunSteps: 960,
      kartBestLap: true,
      kartLapSteps: 310,
    })
    // The same kart, slower than its own: nothing new
    expect(keepIfBetter(run(990, [330, 330, 330], 'tide'))).toMatchObject({
      bestRun: false,
      kartBestRun: false,
      kartRunSteps: 960,
    })
    expect(await loadGhost('test-oval')).toMatchObject({ total: 900, kart: 'heron' })
    expect(loadBestRun('test-oval')).toEqual({ total: 900, kart: 'heron' })
    expect(await loadKartGhost('test-oval', 'tide')).toMatchObject({ total: 960, kart: 'tide' })
    expect((await loadKartGhost('test-oval', 'heron'))?.total).toBe(900)
    expect(await loadKartGhost('test-oval', 'crab')).toBeNull()
    expect(loadKartBestRun('test-oval', 'tide')).toBe(960)
    expect(loadKartBestLap('test-oval', 'tide')).toBe(310)
    expect(loadBestLap('test-oval')).toBe(300)
  })

  it('leave a record kept before karts were told where it was: the overall best, its kart unknown', async () => {
    // As e8-t11 kept it: under the track's id, with no kart
    const old = straightRun(30, 1)
    localStorage.setItem('tku-arcade.kart.ghost.test-oval', JSON.stringify({ ...old, total: 900 }))
    localStorage.setItem('tku-arcade.kart.bestLap.test-oval', '290')
    expect(loadBestRun('test-oval')).toEqual({ total: 900 })
    const kept = await loadGhost('test-oval')
    expect(kept?.total).toBe(900)
    expect(kept && 'kart' in kept).toBe(false)
    expect(loadBestLap('test-oval')).toBe(290)
    // Not handed to any kart: the standard kart has no record yet
    expect(await loadKartGhost('test-oval', 'tide')).toBeNull()
    // A slower run keeps it, and starts the kart's own
    expect(keepIfBetter(run(950, [320, 310, 320], 'tide'))).toMatchObject({
      bestRun: false,
      runSteps: 900,
      bestLap: false,
      lapSteps: 290,
      kartBestRun: true,
    })
    expect((await loadGhost('test-oval'))?.total).toBe(900)
    // A faster one replaces it, and says which kart
    keepIfBetter(run(880, [300, 290, 290], 'crab'))
    expect(await loadGhost('test-oval')).toMatchObject({ total: 880, kart: 'crab' })
  })

  it('work with any track key: a revision, a content hash', async () => {
    for (const key of ['riverside@4', 'custom.9f86d081884c7d65', 'a.b.c']) {
      const ghost = { ...run(700, [700], 'ray'), track: key }
      keepIfBetter(ghost)
      expect((await loadGhost(key))?.total).toBe(700)
      expect((await loadKartGhost(key, 'ray'))?.total).toBe(700)
    }
    // Keys of one track never reach another's
    expect(await loadGhost('custom')).toBeNull()
    expect(await loadKartGhost('c', 'ray')).toBeNull()
  })

  it('drop a kart the ghost names that is not one', () => {
    const json = JSON.parse(JSON.stringify(run(900, [300], 'tide')))
    expect(parseGhost(json, 'test-oval')?.kart).toBe('tide')
    expect(parseGhost({ ...json, kart: 'rocket' }, 'test-oval')).not.toHaveProperty('kart')
  })

  it('remember which ghost races along, the overall best unless told otherwise', () => {
    expect(loadGhostPick()).toBe('overall')
    saveGhostPick('kart')
    expect(loadGhostPick()).toBe('kart')
    localStorage.setItem('tku-arcade.kart.ghostPick', 'nonsense')
    expect(loadGhostPick()).toBe('overall')
  })
})

// 2026-11-20 (docs/ARCHITECTURE.md §4.40; #108): the ghosts in IndexedDB, the records in localStorage
describe('the ghosts in IndexedDB', () => {
  beforeEach(() => localStorage.clear())

  const run = (total: number, kart: KartId, track = 'test-oval'): Ghost => ({
    ...straightRun(30, 1),
    track,
    total,
    laps: [total],
    kart,
  })
  const ghostsLeft = () =>
    Object.keys(localStorage).filter((key) => /kart\.(ghost|kartGhost)\./.test(key))

  it('keep the ghosts out of localStorage: only the records are there', async () => {
    const store = await freshStore()
    keepIfBetter(run(900, 'heron'))
    await settleGhosts()
    expect(ghostsLeft()).toEqual([])
    const sizes = Object.keys(localStorage).map((key) => localStorage.getItem(key)!.length)
    expect(Math.max(...sizes)).toBeLessThan(40)
    expect((await store.get(ghostKeyOf('test-oval', null)))?.ghost.total).toBe(900)
    expect((await store.get(ghostKeyOf('test-oval', 'heron')))?.ghost.total).toBe(900)
  })

  it('move the ghosts localStorage kept, and delete them once moved', async () => {
    const store = await freshStore()
    const overall = run(900, 'heron')
    const tide = run(960, 'tide')
    localStorage.setItem('tku-arcade.kart.ghost.test-oval', JSON.stringify(overall))
    localStorage.setItem('tku-arcade.kart.kartGhost.heron.test-oval', JSON.stringify(overall))
    localStorage.setItem('tku-arcade.kart.kartGhost.tide.test-oval', JSON.stringify(tide))
    localStorage.setItem(
      'tku-arcade.kart.kartGhost.tide.a.b',
      JSON.stringify(run(500, 'tide', 'a.b')),
    )
    localStorage.setItem('tku-arcade.kart.ghost.broken', '{not json')
    localStorage.setItem('tku-arcade.kart.bestLap.test-oval', '900')
    localStorage.setItem('tku-arcade.kart.ghostPick', 'kart')
    expect(await loadKartGhost('test-oval', 'tide')).toMatchObject({ total: 960, kart: 'tide' })
    expect(ghostsLeft()).toEqual([])
    // Everything else stays where it was
    expect(localStorage.getItem('tku-arcade.kart.ghostPick')).toBe('kart')
    expect(loadBestLap('test-oval')).toBe(900)
    expect(loadBestRun('test-oval')).toEqual({ total: 900, kart: 'heron' })
    expect(loadKartBestRun('test-oval', 'tide')).toBe(960)
    expect(loadKartBestRun('a.b', 'tide')).toBe(500)
    expect(await loadGhost('test-oval')).toMatchObject({ total: 900 })
    expect((await loadKartGhost('a.b', 'tide'))?.total).toBe(500)
    expect(await store.keysByAge()).toHaveLength(4)
  })

  it('go without the ghost where there is no IndexedDB, keeping the record and the old ghosts', async () => {
    setGhostStore(null)
    const old = run(900, 'heron')
    localStorage.setItem('tku-arcade.kart.ghost.test-oval', JSON.stringify(old))
    // The old one still races, from where it was
    expect((await loadGhost('test-oval'))?.total).toBe(900)
    expect(ghostsLeft()).toHaveLength(1)
    // A better run: its record kept, no ghost anywhere, and the old one (no longer the record) gone
    expect(keepIfBetter(run(850, 'crab'))).toMatchObject({ bestRun: true, kartBestRun: true })
    await settleGhosts()
    expect(loadBestRun('test-oval')).toEqual({ total: 850, kart: 'crab' })
    expect(await loadGhost('test-oval')).toBeNull()
    expect(ghostsLeft()).toEqual([])
  })

  it('keep the record when the ghost cannot be kept, and never race a slower one in its place', async () => {
    const store = memoryGhostStore()
    setGhostStore(store)
    keepIfBetter(run(900, 'heron'))
    await settleGhosts()
    // From here on every put fails
    store.put = () => Promise.reject(new Error('broken'))
    keepIfBetter(run(800, 'heron'))
    await settleGhosts()
    expect(loadBestRun('test-oval')?.total).toBe(800)
    expect(await loadGhost('test-oval')).toBeNull()
  })

  it('keep at most MAX_GHOSTS, the oldest kart ghosts going first', async () => {
    const store = memoryGhostStore()
    setGhostStore(store)
    // The overall best and the heron's on one track, the oldest of all
    keepIfBetter(run(900, 'heron', 'first'))
    await settleGhosts()
    for (let index = 0; index < MAX_GHOSTS; index++) {
      await store.put({
        key: ghostKeyOf(`t${index}`, 'tide'),
        track: `t${index}`,
        kart: 'tide',
        ghost: run(900, 'tide', `t${index}`),
        savedAt: Date.now() + 1 + index,
      })
    }
    keepIfBetter(run(700, 'crab', 'last'))
    await settleGhosts()
    expect(store.size()).toBe(MAX_GHOSTS)
    // The oldest kart ghosts went; the tracks' overall bests stay
    expect(await store.get(ghostKeyOf('first', 'heron'))).toBeUndefined()
    expect(await store.get(ghostKeyOf('first', null))).toBeDefined()
    expect(await store.get(ghostKeyOf('last', 'crab'))).toBeDefined()
    expect(await store.get(ghostKeyOf('last', null))).toBeDefined()
    // Its record stays, ghost or not
    expect(loadKartBestRun('first', 'heron')).toBe(900)
  })

  it('make room when the disk is full', async () => {
    const store = memoryGhostStore(8)
    setGhostStore(store)
    for (let index = 0; index < 4; index++) {
      keepIfBetter(run(900, 'tide', `t${index}`))
      await settleGhosts()
    }
    expect(store.size()).toBe(8)
    keepIfBetter(run(800, 'crab', 'new'))
    await settleGhosts()
    expect((await loadGhost('new'))?.total).toBe(800)
    expect((await loadKartGhost('new', 'crab'))?.total).toBe(800)
    // The oldest kart ghost went first
    expect(await store.get(ghostKeyOf('t0', 'tide'))).toBeUndefined()
    expect(await store.get(ghostKeyOf('t0', null))).toBeDefined()
  })

  it('open no store where IndexedDB is missing or refuses', async () => {
    expect(await openIndexedGhostStore(null)).toBeNull()
    const refusing = {
      open: () => {
        throw new Error('blocked')
      },
    } as unknown as IDBFactory
    expect(await openIndexedGhostStore(refusing)).toBeNull()
  })
})
