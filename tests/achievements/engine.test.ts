import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSaved, record, resetEngine, subscribeAchievements } from '../../src/achievements/engine.ts'
import { clearPopups, popupQueue } from '../../src/achievements/popups.ts'
import type { KartRunEvent } from '../../src/achievements/events.ts'

vi.mock('../../src/achievements/popupsRoot.tsx', () => ({ mountPopups: vi.fn() }))

const run: KartRunEvent = {
  type: 'kart.run',
  track: 'riverside',
  kart: 'tide',
  ms: 90_000,
  bestLapMs: 29_000,
  perfectStart: true,
  maxCombo: 3,
  cover: 0.3,
  boostMs: 27_000,
  driftJumps: 0,
  platforms: 0,
  gaps: 0,
  forks: 0,
  highTides: 0,
}

beforeEach(() => {
  localStorage.clear()
  resetEngine()
  clearPopups()
})
afterEach(() => localStorage.clear())

describe('the engine', () => {
  it('counts an event, keeps what it unlocked and queues its badges, once', async () => {
    const changed = vi.fn()
    const stop = subscribeAchievements(changed)
    expect(await record(run)).toEqual(['kart-first-finish', 'kart-perfect-start'])
    expect(Object.keys(currentSaved().unlocked)).toEqual(['kart-first-finish', 'kart-perfect-start'])
    expect(popupQueue().map((item) => (item.kind === 'rule' ? item.id : item.count))).toEqual([
      'kart-first-finish',
      'kart-perfect-start',
    ])
    expect(await record(run)).toEqual([])
    expect(currentSaved().stats.n['kart.finishes']).toBe(2)
    expect(changed).toHaveBeenCalledTimes(2)
    stop()
  })

  it('takes one event at a time, in order', async () => {
    const all = await Promise.all(Array.from({ length: 10 }, () => record(run)))
    expect(all.flat()).toEqual(['kart-first-finish', 'kart-perfect-start', 'kart-perfect-start-10', 'platform-games-10'])
    expect(currentSaved().stats.n['kart.finishes']).toBe(10)
  })

  it('reads the kart’s stores on its first event: a medal from before counts', async () => {
    localStorage.setItem(
      'tku-arcade.kart.challenge',
      JSON.stringify({ medals: { riverside: 'platinum' }, best: {}, stars: {} }),
    )
    localStorage.setItem('tku-arcade.kart.cup.best.ebb', JSON.stringify({ place: 1, points: 40 }))
    localStorage.setItem('tku-arcade.kart.bestRun.harbour@13', JSON.stringify({ total: 5000, kart: 'comet' }))
    localStorage.setItem('tku-arcade.kart.kartBestRun.comet.harbour@13', '5000')
    const fresh = await record({ type: 'platform.app' })
    expect(fresh).toEqual(expect.arrayContaining(['kart-first-finish', 'kart-gold', 'kart-platinum', 'kart-cup-win', 'platform-app']))
    expect(currentSaved().stats.t['kart.tracks']).toEqual({ harbour: 1 })
    expect(currentSaved().stats.t['kart.karts']).toEqual({ comet: 1 })
    // A burst: the first two, then how many more
    expect(popupQueue().at(-1)).toEqual({ kind: 'more', count: fresh.length - 2 })
  })

  it('a sync reads the stores again later', async () => {
    await record({ type: 'platform.app' })
    localStorage.setItem('tku-arcade.kart.school', JSON.stringify({ drive: 3 }))
    await record({ type: 'kart.sync' })
    expect(currentSaved().stats.t['kart.school3']).toEqual({ drive: 1 })
  })

  it('a room’s result becomes a board game’s', async () => {
    const view = {
      room: { id: 'r', gameId: 'holdem', status: 'ended', options: {}, minPlayers: 2, maxSeats: 6 },
      members: {
        me: { id: 'me', name: 'Me', seat: 0, ready: false, host: true, online: true, absent: false },
        bob: { id: 'bob', name: 'Bob', seat: 1, ready: false, host: false, online: true, absent: false },
      },
      game: {
        view: null,
        legal: [],
        over: true,
        chatLocked: false,
        result: {
          summary: { key: 'games.holdem.result.won' },
          standings: [
            { seat: 0, rank: 1, score: 100, note: { key: 'n' } },
            { seat: 1, rank: 2, score: 0, note: { key: 'n' } },
          ],
        },
      },
      coverable: [],
    } as const
    expect(await record({ type: 'room.result', view: structuredClone(view) as never, you: 'me' })).toEqual(
      expect.arrayContaining(['board-first-win', 'board-win-holdem', 'platform-friends']),
    )
  })
})
