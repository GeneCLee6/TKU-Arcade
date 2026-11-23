import { describe, expect, it } from 'vitest'
import type { AchievementEvent, BoardResultEvent, KartRunEvent } from '../../src/achievements/events.ts'
import { newlyUnlocked } from '../../src/achievements/rules.ts'
import {
  applyEvent,
  boardOutcome,
  EMPTY_STATS,
  harderLevel,
  mergeStats,
  parseStats,
  type Stats,
} from '../../src/achievements/stats.ts'

const NOON = new Date(2026, 10, 23, 12)
const run = (over: Partial<KartRunEvent> = {}): KartRunEvent => ({
  type: 'kart.run',
  track: 'riverside',
  kart: 'tide',
  ms: 90_000,
  bestLapMs: 29_000,
  perfectStart: false,
  maxCombo: 0,
  cover: 0.2,
  boostMs: 18_000,
  driftJumps: 0,
  platforms: 0,
  gaps: 0,
  forks: 0,
  highTides: 0,
  ...over,
})
const board = (over: Partial<BoardResultEvent> = {}): BoardResultEvent => ({
  type: 'board.result',
  game: 'promotion',
  outcome: 'won',
  humans: 1,
  level: null,
  ...over,
})
const apply = (events: AchievementEvent[], at = NOON, from: Stats = EMPTY_STATS) =>
  events.reduce((stats, event) => applyEvent(stats, event, at), from)
const unlocks = (stats: Stats) => newlyUnlocked(stats, {}).map((rule) => rule.id)

describe('a finished race', () => {
  it('counts a finish, a perfect start, the combo, the share boosting and the feats', () => {
    const stats = apply([run({ perfectStart: true, maxCombo: 12, cover: 0.71, driftJumps: 2, platforms: 1, gaps: 1, forks: 1, highTides: 1 })])
    expect(stats.n['kart.finishes']).toBe(1)
    expect(stats.n['kart.maxCover']).toBe(71)
    expect(stats.t['kart.karts']).toEqual({ tide: 1 })
    expect(stats.t['kart.bestLap']).toEqual({ riverside: 29_000 })
    expect(unlocks(stats)).toEqual(
      expect.arrayContaining([
        'kart-first-finish',
        'kart-perfect-start',
        'kart-combo-10',
        'kart-cover-70',
        'kart-platform',
        'kart-gap',
        'kart-fork',
        'kart-high-tide',
      ]),
    )
    expect(unlocks(stats)).not.toContain('kart-combo-15')
    expect(unlocks(stats)).not.toContain('kart-drift-jump-5')
  })

  it('keeps the most, not the last, and the lowest lap', () => {
    const stats = apply([run({ maxCombo: 15, bestLapMs: 30_000 }), run({ maxCombo: 3, bestLapMs: 28_000 })])
    expect(stats.n['kart.maxCombo']).toBe(15)
    expect(stats.t['kart.bestLap']).toEqual({ riverside: 28_000 })
    expect(stats.n['kart.finishes']).toBe(2)
  })

  it('counts a challenge track or a custom one as a race, not as a map', () => {
    const stats = apply([run({ track: 'ch-needle' }), run({ track: 'custom-abc' })])
    expect(stats.n['kart.finishes']).toBe(2)
    expect(stats.t['kart.tracks']).toBeUndefined()
  })

  it('adds up drift jumps and boost time across races', () => {
    const stats = apply(Array.from({ length: 5 }, () => run({ driftJumps: 1, boostMs: 120_000 })))
    expect(unlocks(stats)).toContain('kart-drift-jump-5')
    expect(unlocks(stats)).toContain('kart-boost-10min')
  })

  it('a game after midnight is the late one', () => {
    expect(apply([run()], new Date(2026, 10, 23, 2)).n['platform.midnight']).toBe(1)
    expect(apply([run()], NOON).n['platform.midnight']).toBeUndefined()
  })
})

describe('a race against others', () => {
  const race = (place: number | null, level: string | null = 'normal', team: 'won' | 'lost' | 'draw' | null = null) =>
    ({ type: 'kart.race', mode: 'bots', place, racers: 6, level, team, humans: 1 }) as const

  it('a win, an expert win, a team win', () => {
    expect(unlocks(apply([race(1)]))).toContain('kart-first-win')
    expect(unlocks(apply([race(1)]))).not.toContain('kart-expert-win')
    expect(unlocks(apply([race(1, 'expert')]))).toContain('kart-expert-win')
    expect(unlocks(apply([race(2, 'expert')]))).not.toContain('kart-expert-win')
    expect(unlocks(apply([race(4, 'normal', 'won')]))).toContain('kart-team-win')
    expect(unlocks(apply([race(1, 'normal', 'lost')]))).not.toContain('kart-team-win')
  })

  it('alone on the grid is no win', () => {
    expect(apply([{ ...race(1), racers: 1 }]).n['kart.wins']).toBeUndefined()
  })

  it('a race not finished still counts as a game; a room with a friend counts as with friends', () => {
    expect(apply([race(null)]).n['platform.games']).toBe(1)
    expect(apply([race(2)]).n['platform.games']).toBeUndefined()
    expect(apply([{ ...race(2), mode: 'room', humans: 2 }]).n['platform.friendGames']).toBe(1)
  })
})

describe('a board game', () => {
  it('a first win of the game and a computer on Normal', () => {
    const stats = apply([board({ level: 'normal' })])
    expect(unlocks(stats)).toEqual(expect.arrayContaining(['board-first-win', 'board-win-promotion', 'board-bot-normal']))
    expect(unlocks(apply([board({ level: 'easy' })]))).not.toContain('board-bot-normal')
  })

  it('a streak counts wins in a row; a loss ends it, a shared game does not', () => {
    const three = apply([board(), board(), board({ outcome: 'shared', game: 'odd-word' }), board()])
    expect(three.n['board.maxStreak']).toBe(3)
    expect(unlocks(three)).toContain('board-streak-3')
    const broken = apply([board(), board(), board({ outcome: 'lost' }), board()])
    expect(broken.n['board.maxStreak']).toBe(2)
    expect(broken.n['board.streak']).toBe(1)
  })

  it('the co-operative ones', () => {
    expect(unlocks(apply([board({ game: 'lantern', outcome: 'coopWon' })]))).toContain('board-lantern')
    expect(unlocks(apply([board({ game: 'lantern', outcome: 'coopLost' })]))).not.toContain('board-lantern')
    expect(unlocks(apply([board({ game: 'silent-table', outcome: 'coopWon', levels: 5 })]))).toContain('board-silent-five')
    expect(unlocks(apply([board({ game: 'silent-table', outcome: 'coopWon', levels: 4 })]))).not.toContain('board-silent-five')
    const kite = (score: number) => unlocks(apply([board({ game: 'kite', outcome: 'coopLost', score, most: 25 })]))
    expect(kite(18)).toContain('board-kite')
    expect(kite(17)).not.toContain('board-kite')
    expect(kite(25)).toContain('board-kite-perfect')
    expect(kite(24)).not.toContain('board-kite-perfect')
  })

  it('ten games of anything; a seat at every table', () => {
    const games = ['promotion', 'silent-table', 'spectrum', 'bluff', 'odd-word', 'lantern', 'tiles', 'kite', 'traders', 'secret-scroll', 'wasabi', 'palace', 'holdem', 'misery', 'word-bridge', 'clue-clash']
    const stats = apply(games.map((game) => board({ game, outcome: 'lost', humans: 3 })))
    expect(unlocks(stats)).toEqual(expect.arrayContaining(['board-all-games', 'platform-games-10', 'platform-friends']))
    expect(unlocks(apply(games.slice(1).map((game) => board({ game }))))).not.toContain('board-all-games')
  })
})

describe('the kart stores and the rest', () => {
  it('takes the stores as they are, without counting twice', () => {
    const progress = {
      type: 'kart.progress',
      gold: 2,
      platinum: 1,
      school: ['drive'],
      chapters: ['basics'],
      cups: ['ebb'],
      tracks: ['riverside', 'test-oval'],
      karts: ['tide'],
    } as const
    const stats = apply([progress, progress])
    expect(stats.n['kart.gold']).toBe(2)
    expect(stats.t['kart.cupsWon']).toEqual({ ebb: 1 })
    expect(stats.t['kart.tracks']).toEqual({ riverside: 1 })
    expect(stats.n['kart.finishes']).toBe(1)
    expect(unlocks(stats)).toEqual(
      expect.arrayContaining(['kart-gold', 'kart-platinum', 'kart-chapter-basics', 'kart-cup-win', 'kart-first-finish']),
    )
    expect(unlocks(stats)).not.toContain('kart-school-all')
    expect(unlocks(stats)).not.toContain('kart-chapter-technique')
  })

  it('a leaderboard place and the app', () => {
    expect(unlocks(apply([{ type: 'kart.leaderboard', track: 'riverside', rank: 3 }]))).toContain('kart-leaderboard')
    expect(unlocks(apply([{ type: 'kart.leaderboard', track: 'riverside', rank: 101 }]))).not.toContain('kart-leaderboard')
    expect(unlocks(apply([{ type: 'platform.app' }]))).toContain('platform-app')
  })

  it('leaves what it does not count alone', () => {
    expect(applyEvent(EMPTY_STATS, { type: 'kart.sync' }, NOON)).toBe(EMPTY_STATS)
  })
})

describe('reading a board result', () => {
  const standings = (ranks: number[]) => ranks.map((rank, seat) => ({ seat, rank }))
  it('won, lost, shared and co-operative', () => {
    expect(boardOutcome('promotion', standings([1, 2, 3]), 0, 'games.promotion.result.won')).toBe('won')
    expect(boardOutcome('promotion', standings([1, 2, 3]), 2, 'games.promotion.result.won')).toBe('lost')
    expect(boardOutcome('promotion', standings([1, 1, 3]), 1, 'x')).toBe('won')
    expect(boardOutcome('odd-word', standings([1, 1, 1]), 1, 'games.odd-word.result.done')).toBe('shared')
    expect(boardOutcome('lantern', standings([1, 1]), 1, 'games.lantern.result.won')).toBe('coopWon')
    expect(boardOutcome('lantern', standings([1, 1]), 1, 'games.lantern.result.lost')).toBe('coopLost')
    expect(boardOutcome('word-bridge', standings([1, 1]), 0, 'games.word-bridge.result.duo.won')).toBe('coopWon')
    expect(boardOutcome('promotion', standings([1, 2]), 5, 'x')).toBe('lost')
  })

  it('the harder of two computer levels', () => {
    expect(harderLevel(null, 'easy')).toBe('easy')
    expect(harderLevel('expert', 'normal')).toBe('expert')
    expect(harderLevel('normal', 'hard')).toBe('hard')
  })
})

describe('keeping and merging the stats', () => {
  it('merges two copies at the higher of each, a best lap at the lower', () => {
    const a: Stats = { n: { 'kart.finishes': 3, 'kart.maxCombo': 9 }, t: { 'kart.karts': { tide: 2 }, 'kart.bestLap': { riverside: 30_000 } } }
    const b: Stats = { n: { 'kart.finishes': 5, 'board.wins': 1 }, t: { 'kart.karts': { comet: 1, tide: 1 }, 'kart.bestLap': { riverside: 29_000, harbour: 40_000 } } }
    expect(mergeStats(a, b)).toEqual({
      n: { 'kart.finishes': 5, 'kart.maxCombo': 9, 'board.wins': 1 },
      t: { 'kart.karts': { tide: 2, comet: 1 }, 'kart.bestLap': { riverside: 29_000, harbour: 40_000 } },
    })
  })

  it('drops whatever is not a count', () => {
    expect(parseStats(null)).toEqual(EMPTY_STATS)
    expect(parseStats([1, 2])).toEqual(EMPTY_STATS)
    expect(
      parseStats({
        n: { 'kart.finishes': 2, bad: -1, worse: 'x', 'Not a key': 3, nan: Number.NaN },
        t: { 'kart.karts': { tide: 1, comet: 'x' }, broken: 5, list: [1] },
      }),
    ).toEqual({ n: { 'kart.finishes': 2 }, t: { 'kart.karts': { tide: 1 } } })
  })
})
