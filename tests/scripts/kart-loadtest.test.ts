// @vitest-environment node
// e9-t11: the kart load test's numbers and report (scripts/kart/loadtest-report.ts)
import { describe, expect, it } from 'vitest'
import {
  buildReport,
  count,
  distribution,
  drops,
  emptyTraffic,
  formatReport,
  itemSummary,
  lapCheck,
  percentile,
  since,
  tally,
  wireBytes,
  type BotTally,
  type RunInfo,
} from '../../scripts/kart/loadtest-report.ts'

describe('wireBytes', () => {
  it('adds the WebSocket header, and the mask on what a client sends', () => {
    expect(wireBytes(32, true)).toBe(38)
    expect(wireBytes(33, false)).toBe(35)
    expect(wireBytes(125, false)).toBe(127)
    expect(wireBytes(126, false)).toBe(130)
    expect(wireBytes(70_000, true)).toBe(70_014)
  })

  it('counts messages, payload and wire', () => {
    const traffic = emptyTraffic()
    count(traffic, 32, true)
    count(traffic, 8, true)
    expect(traffic).toEqual({ messages: 2, bytes: 40, wire: 52 })
  })

  it('subtracts one copy of the counters from a later one', () => {
    const later = { frame: { messages: 5, bytes: 160, wire: 190 } }
    const earlier = { frame: { messages: 2, bytes: 64, wire: 76 } }
    expect(since(later, earlier)).toEqual({ frame: { messages: 3, bytes: 96, wire: 114 } })
  })
})

describe('percentile and distribution', () => {
  it('takes the nearest rank', () => {
    const values = Array.from({ length: 100 }, (_, i) => 100 - i)
    expect(percentile(values, 50)).toBe(50)
    expect(percentile(values, 95)).toBe(95)
    expect(percentile(values, 99)).toBe(99)
    expect(percentile(values, 100)).toBe(100)
    expect(percentile(values, 0)).toBe(1)
    expect(percentile([7], 99)).toBe(7)
    expect(percentile([], 50)).toBeNull()
  })

  it('sums up a list to a tenth, and nothing for none', () => {
    expect(distribution([1, 2, 3, 4.04])).toEqual({
      count: 4,
      min: 1,
      p50: 2,
      p95: 4,
      p99: 4,
      max: 4,
      mean: 2.5,
    })
    expect(distribution([]).p95).toBeNull()
  })
})

describe('lapCheck', () => {
  it('agrees when the running totals are within a frame', () => {
    expect(lapCheck([41_000, 40_000], [41_030, 39_990])).toEqual({
      own: 2,
      server: 2,
      maxDiffMs: 30,
      agree: true,
    })
  })

  it('compares running totals, so one late lap is not made up by the next', () => {
    const check = lapCheck([41_000, 40_000, 40_000], [41_100, 39_900, 40_000])
    expect(check.maxDiffMs).toBe(100)
    expect(check.agree).toBe(false)
  })

  it('disagrees on a different number of laps', () => {
    expect(lapCheck([41_000, 40_000], [41_000]).agree).toBe(false)
    expect(lapCheck([], []).agree).toBe(true)
    expect(lapCheck([], []).maxDiffMs).toBeNull()
  })
})

describe('drops', () => {
  it('tells frames nobody saw from frames some missed', () => {
    expect(drops([5, 5, 0, 3, 5, 0], 5)).toEqual({ sent: 6, dropped: 2, partial: 1 })
  })

  it('cannot tell anything with nobody else in the room', () => {
    expect(drops([0, 0], 0)).toEqual({ sent: 2, dropped: 0, partial: 0 })
  })

  it('adds up why, unknown for none', () => {
    expect(tally(['jump', null, 'jump', 'tick'])).toEqual({ jump: 2, tick: 1, unknown: 1 })
  })
})

describe('itemSummary', () => {
  it('counts uses, hits, shields and missing event numbers', () => {
    const summary = itemSummary([
      { n: 0, item: 'boost', targets: [], blocked: [], hit: false },
      { n: 1, item: 'hail', targets: [], blocked: [], hit: false },
      { n: 2, item: 'hail', targets: [3], blocked: [], hit: true },
      { n: 4, item: 'headwind', targets: [1, 2], blocked: [2], hit: false },
    ])
    expect(summary).toEqual({
      used: { boost: 1, hail: 1, headwind: 1 },
      reached: 1,
      hits: { hail: 1 },
      blocked: 1,
      missing: 1,
    })
    expect(itemSummary([]).missing).toBe(0)
  })
})

describe('buildReport', () => {
  const traffic = (messages: number, bytes: number, wire: number) => ({ messages, bytes, wire })
  const bot = (seat: number, finishMs: number | null, seenBy: number[]): BotTally => ({
    name: `bot-${seat + 1}`,
    seat,
    look: 'tide.spade',
    up: {
      frame: traffic(1000, 32_000, 38_000),
      item: traffic(0, 0, 0),
      clock: traffic(0, 0, 0),
      json: traffic(0, 0, 0),
    },
    down: { relay: traffic(1000, 33_000, 35_000), clock: traffic(0, 0, 0), json: traffic(0, 0, 0) },
    raceUp: {
      frame: traffic(200, 6_400, 7_600),
      item: traffic(2, 16, 28),
      clock: traffic(5, 45, 75),
      json: traffic(0, 0, 0),
    },
    raceDown: {
      relay: traffic(200, 6_600, 7_000),
      clock: traffic(5, 85, 95),
      json: traffic(3, 1_000, 1_006),
    },
    relayMs: [10, 20, 30],
    tickMs: [5, 15],
    rttMs: [40, 60],
    offsetMs: 100 + seat * 2,
    seenBy,
    predicted: seenBy.map((seen) => (seen === 0 ? 'jump' : null)),
    droppedWhy: seenBy.filter((seen) => seen === 0).map(() => 'jump'),
    pickups: 3,
    got: 2,
    uses: 2,
    resets: 0,
    ownLapsMs: [40_000],
    serverLapsMs: [40_020],
    finishMs: finishMs,
    out: finishMs === null,
  })
  const run: RunInfo = {
    url: 'http://localhost:5175',
    room: 'abc',
    track: 'oldstreet',
    laps: 1,
    mode: 'items',
    bots: 2,
    at: '2026-11-17T00:00:00.000Z',
    raceSeconds: 10,
    totalSeconds: 20,
    phase: 'finished',
    events: [{ n: 0, item: 'boost', targets: [], blocked: [], hit: false }],
    dissolved: true,
  }

  it('makes rates from the race window and adds up the bots', () => {
    const report = buildReport(run, [bot(0, 40_020, [1, 1, 0]), bot(1, 41_000, [1, 1, 1])])
    const first = report.bots[0]!
    expect(first.upPerSecond).toBe(Math.round((7_600 + 28 + 75) / 10))
    expect(first.downPerSecond).toBe(Math.round((7_000 + 95 + 1_006) / 10))
    expect(first.upPayloadPerSecond).toBe(Math.round((6_400 + 16 + 45) / 10))
    expect(first.downByKind).toEqual({ relay: 660, clock: 9, json: 100 })
    expect(first.framesSent).toBe(1000)
    expect(first.drops).toEqual({ sent: 3, dropped: 1, partial: 0 })
    expect(first.droppedWhy).toEqual({ jump: 1 })
    expect(first.laps.agree).toBe(true)
    expect(report.summary.offsetSpreadMs).toBe(2)
    expect(report.summary.dropped).toBe(1)
    expect(report.summary.droppedWhy).toEqual({ jump: 1 })
    expect(report.summary.roomInPerSecond).toBe(40)
    expect(report.summary.roomOutPerSecond).toBe(40)
    expect(report.summary.relayMs.count).toBe(6)
    expect(report.summary.allFinished).toBe(true)
    expect(report.summary.lapsAgree).toBe(true)
    expect(report.summary.items.used).toEqual({ boost: 1 })
  })

  it('says when someone did not finish, and prints a table', () => {
    const report = buildReport(run, [bot(0, 40_020, [1]), bot(1, null, [1])])
    expect(report.summary.allFinished).toBe(false)
    const text = formatReport(report)
    expect(text).toContain('| bot-1 | 0 | tide.spade |')
    expect(text).toContain('| out |')
    expect(text).toContain('all finished: NO')
    expect(text).toContain('room dissolved')
    expect(text.split('\n').filter((line) => line.startsWith('| bot-'))).toHaveLength(2)
  })
})
