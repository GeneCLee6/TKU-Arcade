// e9-t11: the numbers of a kart load test (scripts/kart-loadtest.ts), and the report made of them.
// Pure: what the bots counted goes in, a JSON report and a Markdown table come out. Tested in
// tests/scripts/kart-loadtest.test.ts; the results are in docs/KART-NETCODE.md §8.

/** What one bot sent or received on one kind of message */
export interface Traffic {
  messages: number
  /** Payload bytes: what the game puts in a message */
  bytes: number
  /** On the wire: the payload with its WebSocket header (and mask, from a browser) */
  wire: number
}

export const emptyTraffic = (): Traffic => ({ messages: 0, bytes: 0, wire: 0 })

/**
 * A WebSocket message's size on the wire (RFC 6455 §5.2): a 2-byte header, 2 or 8 more for a longer
 * payload, and a 4-byte mask on everything a client sends. TCP, TLS and IP come on top of this
 */
export function wireBytes(payload: number, fromClient: boolean): number {
  const length = payload < 126 ? 0 : payload < 65_536 ? 2 : 8
  return payload + 2 + length + (fromClient ? 4 : 0)
}

/** Adds one message of `payload` bytes */
export function count(traffic: Traffic, payload: number, fromClient: boolean): void {
  traffic.messages++
  traffic.bytes += payload
  traffic.wire += wireBytes(payload, fromClient)
}

/** The value at percentile `p` (0 to 100), nearest rank; null for no values */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((Math.max(0, Math.min(100, p)) / 100) * sorted.length)
  return sorted[Math.max(0, rank - 1)]!
}

export interface Distribution {
  count: number
  min: number | null
  p50: number | null
  p95: number | null
  p99: number | null
  max: number | null
  mean: number | null
}

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10)

/** Count, extremes, mean and the usual percentiles, to a tenth */
export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null }
  }
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
    sum += value
  }
  return {
    count: values.length,
    min: round1(min),
    p50: round1(percentile(values, 50)),
    p95: round1(percentile(values, 95)),
    p99: round1(percentile(values, 99)),
    max: round1(max),
    mean: round1(sum / values.length),
  }
}

/** Laps as the bot timed them against those the room judged */
export interface LapCheck {
  own: number
  server: number
  /** The biggest gap between the two running totals, ms; null when either has no laps */
  maxDiffMs: number | null
  /** Same number of laps, and every total within the tolerance */
  agree: boolean
}

/**
 * The room interpolates a lap's end between two frames (shared/kart/race.ts) and the bot counts
 * whole physics steps, so they may differ by up to a frame's worth (3 steps, 50 ms) and rounding
 */
export const LAP_TOLERANCE_MS = 60

export function lapCheck(
  own: readonly number[],
  server: readonly number[],
  toleranceMs = LAP_TOLERANCE_MS,
): LapCheck {
  let ownTotal = 0
  let serverTotal = 0
  let maxDiffMs: number | null = null
  for (let i = 0; i < Math.min(own.length, server.length); i++) {
    ownTotal += own[i]!
    serverTotal += server[i]!
    maxDiffMs = Math.max(maxDiffMs ?? 0, Math.abs(ownTotal - serverTotal))
  }
  return {
    own: own.length,
    server: server.length,
    maxDiffMs: maxDiffMs === null ? null : Math.round(maxDiffMs),
    agree: own.length === server.length && (maxDiffMs ?? 0) <= toleranceMs,
  }
}

/** Frames one bot sent, against who saw them relayed */
export interface Drops {
  /** Frames sent while the room was judging them */
  sent: number
  /** Seen by no other bot: the room refused them (judgeFrame) */
  dropped: number
  /** Seen by some others but not all: lost after the room passed them on */
  partial: number
}

/**
 * `seenBy[i]` is how many other bots received frame i of this bot; `others` is how many there are.
 * With no other bot nothing can be told, and nothing counts as dropped
 */
export function drops(seenBy: readonly number[], others: number): Drops {
  if (others <= 0) return { sent: seenBy.length, dropped: 0, partial: 0 }
  let dropped = 0
  let partial = 0
  for (const seen of seenBy) {
    if (seen === 0) dropped++
    else if (seen < others) partial++
  }
  return { sent: seenBy.length, dropped, partial }
}

/** Adds up why refused frames would have been refused, by the bot's own run of judgeFrame */
export function tally(reasons: readonly (string | null)[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const reason of reasons) counts[reason ?? 'unknown'] = (counts[reason ?? 'unknown'] ?? 0) + 1
  return counts
}

/** An item event as the room keeps it (shared/games/kart/types.ts KartItemEvent), as far as counted */
export interface ItemEventLike {
  n: number
  item: string
  targets: readonly number[]
  blocked: readonly number[]
  hit: boolean
}

export interface ItemSummary {
  /** Items used, by item */
  used: Record<string, number>
  /** Uses that reached another kart (direct items) */
  reached: number
  /** Shots that hit a kart, by item */
  hits: Record<string, number>
  /** Uses or hits a shield stopped */
  blocked: number
  /** Event numbers that never reached any bot (more than KEEP_EVENTS in one patch) */
  missing: number
}

export function itemSummary(events: readonly ItemEventLike[]): ItemSummary {
  const used: Record<string, number> = {}
  const hits: Record<string, number> = {}
  let reached = 0
  let blocked = 0
  const numbers = new Set<number>()
  for (const event of events) {
    numbers.add(event.n)
    if (event.hit) hits[event.item] = (hits[event.item] ?? 0) + 1
    else {
      used[event.item] = (used[event.item] ?? 0) + 1
      if (event.targets.length > 0) reached++
    }
    if (event.blocked.length > 0) blocked++
  }
  const top = numbers.size === 0 ? -1 : Math.max(...numbers)
  return { used, reached, hits, blocked, missing: top + 1 - numbers.size }
}

// ── The report ───────────────────────────────────────────────────────────────────────────────

export type UpTraffic = { frame: Traffic; item: Traffic; clock: Traffic; json: Traffic }
export type DownTraffic = { relay: Traffic; clock: Traffic; json: Traffic }

/** What was counted between two copies of the same counters */
export function since<T extends Record<string, Traffic>>(later: T, earlier: T): T {
  const out = {} as Record<string, Traffic>
  for (const [name, one] of Object.entries(later)) {
    const before = earlier[name] ?? emptyTraffic()
    out[name] = {
      messages: one.messages - before.messages,
      bytes: one.bytes - before.bytes,
      wire: one.wire - before.wire,
    }
  }
  return out as T
}

/** Everything one bot counted over a run */
export interface BotTally {
  name: string
  seat: number
  look: string
  up: UpTraffic
  down: DownTraffic
  /** The same, counted from GO to the race's end only: what the rates are made of */
  raceUp: UpTraffic
  raceDown: DownTraffic
  /** Same-process relay time of every frame this bot received: sent → received, ms */
  relayMs: number[]
  /** The same, by the synced clock: arrival (server time) − the frame's tick time, ms */
  tickMs: number[]
  /** Clock ping round trips, ms */
  rttMs: number[]
  /** The bot's final estimate of the server's clock minus its own, ms */
  offsetMs: number | null
  /** For each frame sent while judged: how many other bots received it */
  seenBy: number[]
  /** For each of those the bot's own judgeFrame refused: why (null when it took it) */
  predicted: (string | null)[]
  /** Why the dropped ones would have been refused */
  droppedWhy: (string | null)[]
  pickups: number
  got: number
  uses: number
  resets: number
  ownLapsMs: number[]
  serverLapsMs: number[]
  finishMs: number | null
  out: boolean
}

export interface RunInfo {
  url: string
  room: string
  track: string
  laps: number
  mode: string
  bots: number
  /** When it ran, ISO */
  at: string
  /** GO to the race's end, by the bots' clock, s */
  raceSeconds: number
  /** Room created to the last socket closed, s */
  totalSeconds: number
  phase: string
  events: ItemEventLike[]
  /** The room was dissolved at the end (no room left behind) */
  dissolved: boolean
}

export interface BotReport {
  name: string
  seat: number
  look: string
  /** Bytes a second on the wire from GO to the race's end, and the payload alone */
  upPerSecond: number
  downPerSecond: number
  upPayloadPerSecond: number
  downPayloadPerSecond: number
  /** Payload bytes a second by kind of message, from GO to the race's end */
  upByKind: Record<string, number>
  downByKind: Record<string, number>
  framesSent: number
  framesReceived: number
  relayMs: Distribution
  tickMs: Distribution
  rttMs: Distribution
  offsetMs: number | null
  drops: Drops
  droppedWhy: Record<string, number>
  predictedRefusals: number
  laps: LapCheck
  finishMs: number | null
  out: boolean
  pickups: number
  got: number
  uses: number
  resets: number
}

export interface Report {
  run: RunInfo
  bots: BotReport[]
  summary: {
    upPerSecond: Distribution
    downPerSecond: Distribution
    relayMs: Distribution
    tickMs: Distribution
    rttMs: Distribution
    /** Spread of the bots' clock offsets: they share one clock, so this is the sync error, ms */
    offsetSpreadMs: number | null
    framesSent: number
    dropped: number
    partial: number
    droppedWhy: Record<string, number>
    /** Frames the room took in, and sent out, a second from GO to the race's end */
    roomInPerSecond: number
    roomOutPerSecond: number
    lapsAgree: boolean
    allFinished: boolean
    items: ItemSummary
  }
}

const perSecond = (bytes: number, seconds: number) =>
  seconds > 0 ? Math.round(bytes / seconds) : 0

const sumTraffic = (list: readonly Traffic[], key: 'bytes' | 'wire') =>
  list.reduce((sum, one) => sum + one[key], 0)

export function buildReport(run: RunInfo, tallies: readonly BotTally[]): Report {
  const seconds = run.raceSeconds
  const others = tallies.length - 1
  const bots = tallies.map((bot): BotReport => {
    const up = Object.values(bot.raceUp)
    const down = Object.values(bot.raceDown)
    return {
      name: bot.name,
      seat: bot.seat,
      look: bot.look,
      upPerSecond: perSecond(sumTraffic(up, 'wire'), seconds),
      downPerSecond: perSecond(sumTraffic(down, 'wire'), seconds),
      upPayloadPerSecond: perSecond(sumTraffic(up, 'bytes'), seconds),
      downPayloadPerSecond: perSecond(sumTraffic(down, 'bytes'), seconds),
      upByKind: Object.fromEntries(
        Object.entries(bot.raceUp).map(([kind, one]) => [kind, perSecond(one.bytes, seconds)]),
      ),
      downByKind: Object.fromEntries(
        Object.entries(bot.raceDown).map(([kind, one]) => [kind, perSecond(one.bytes, seconds)]),
      ),
      framesSent: bot.up.frame.messages,
      framesReceived: bot.down.relay.messages,
      relayMs: distribution(bot.relayMs),
      tickMs: distribution(bot.tickMs),
      rttMs: distribution(bot.rttMs),
      offsetMs: bot.offsetMs === null ? null : Math.round(bot.offsetMs * 10) / 10,
      drops: drops(bot.seenBy, others),
      droppedWhy: tally(bot.droppedWhy),
      predictedRefusals: bot.predicted.filter((why) => why !== null).length,
      laps: lapCheck(bot.ownLapsMs, bot.serverLapsMs),
      finishMs: bot.finishMs,
      out: bot.out,
      pickups: bot.pickups,
      got: bot.got,
      uses: bot.uses,
      resets: bot.resets,
    }
  })
  const offsets = tallies.map((bot) => bot.offsetMs).filter((one): one is number => one !== null)
  const droppedWhy: Record<string, number> = {}
  for (const bot of bots) {
    for (const [why, n] of Object.entries(bot.droppedWhy)) droppedWhy[why] = (droppedWhy[why] ?? 0) + n
  }
  const framesIn = tallies.reduce((sum, bot) => sum + bot.raceUp.frame.messages, 0)
  const framesOut = tallies.reduce((sum, bot) => sum + bot.raceDown.relay.messages, 0)
  return {
    run,
    bots,
    summary: {
      upPerSecond: distribution(bots.map((bot) => bot.upPerSecond)),
      downPerSecond: distribution(bots.map((bot) => bot.downPerSecond)),
      relayMs: distribution(tallies.flatMap((bot) => bot.relayMs)),
      tickMs: distribution(tallies.flatMap((bot) => bot.tickMs)),
      rttMs: distribution(tallies.flatMap((bot) => bot.rttMs)),
      offsetSpreadMs:
        offsets.length === 0
          ? null
          : Math.round((Math.max(...offsets) - Math.min(...offsets)) * 10) / 10,
      framesSent: bots.reduce((sum, bot) => sum + bot.drops.sent, 0),
      dropped: bots.reduce((sum, bot) => sum + bot.drops.dropped, 0),
      partial: bots.reduce((sum, bot) => sum + bot.drops.partial, 0),
      droppedWhy,
      roomInPerSecond: seconds > 0 ? Math.round(framesIn / seconds) : 0,
      roomOutPerSecond: seconds > 0 ? Math.round(framesOut / seconds) : 0,
      lapsAgree: bots.every((bot) => bot.laps.agree),
      allFinished: bots.every((bot) => bot.finishMs !== null && !bot.out),
      items: itemSummary(run.events),
    },
  }
}

// ── As text ──────────────────────────────────────────────────────────────────────────────────

const show = (value: number | null | undefined) => (value === null || value === undefined ? '–' : String(value))
const kB = (bytes: number) => (bytes / 1000).toFixed(2)
const time = (ms: number | null) => (ms === null ? '–' : (ms / 1000).toFixed(2))
const pcts = (d: Distribution) => `${show(d.p50)} / ${show(d.p95)} / ${show(d.p99)}`
const counts = (record: Record<string, number>) =>
  Object.entries(record)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, n]) => `${key} ${n}`)
    .join(', ') || '–'

/** The report as Markdown: a line about the run, a table of the bots, then the totals */
export function formatReport(report: Report): string {
  const { run, summary } = report
  const lines = [
    `## Kart load test: ${run.bots} bots, ${run.track}, ${run.laps} laps, ${run.mode}`,
    '',
    `${run.at} · ${run.url} · room ${run.room} · race ${run.raceSeconds.toFixed(1)} s · ` +
      `total ${run.totalSeconds.toFixed(1)} s · phase ${run.phase} · ` +
      `room ${run.dissolved ? 'dissolved' : 'NOT dissolved'}`,
    '',
    '| bot | seat | kart | up kB/s | down kB/s | sent | recv | relay p50/p95/p99 ms | tick p50/p95/p99 ms | rtt p50/p95 ms | dropped | laps own/srv | Δ ms | finish s | pick/got/use | resets |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const bot of report.bots) {
    lines.push(
      `| ${bot.name} | ${bot.seat} | ${bot.look} | ${kB(bot.upPerSecond)} | ${kB(bot.downPerSecond)} | ` +
        `${bot.framesSent} | ${bot.framesReceived} | ${pcts(bot.relayMs)} | ${pcts(bot.tickMs)} | ` +
        `${show(bot.rttMs.p50)} / ${show(bot.rttMs.p95)} | ${bot.drops.dropped}` +
        `${bot.drops.partial ? ` (+${bot.drops.partial} partial)` : ''} | ` +
        `${bot.laps.own}/${bot.laps.server}${bot.laps.agree ? '' : ' ✗'} | ${show(bot.laps.maxDiffMs)} | ` +
        `${bot.out ? 'out' : time(bot.finishMs)} | ${bot.pickups}/${bot.got}/${bot.uses} | ${bot.resets} |`,
    )
  }
  lines.push(
    '',
    `- Per bot, on the wire: up ${kB(summary.upPerSecond.mean ?? 0)} kB/s, down ${kB(summary.downPerSecond.mean ?? 0)} kB/s (mean; max ${kB(summary.downPerSecond.max ?? 0)})`,
    `- Down payload by kind (bot-1): ${counts(report.bots[0]?.downByKind ?? {})} B/s; up: ${counts(report.bots[0]?.upByKind ?? {})} B/s`,
    `- Room: ${summary.roomInPerSecond} frames/s in, ${summary.roomOutPerSecond} out`,
    `- Relay (same clock) ms p50/p95/p99/max: ${pcts(summary.relayMs)} / ${show(summary.relayMs.max)}`,
    `- Relay by synced clock (tick) ms p50/p95/p99: ${pcts(summary.tickMs)}`,
    `- Clock round trip ms p50/p95: ${show(summary.rttMs.p50)} / ${show(summary.rttMs.p95)}; offsets spread ${show(summary.offsetSpreadMs)} ms`,
    `- Frames judged ${summary.framesSent}, dropped by the room ${summary.dropped} (${counts(summary.droppedWhy)}), lost after relay ${summary.partial}`,
    `- Laps agree with the room: ${summary.lapsAgree ? 'yes' : 'NO'}; all finished: ${summary.allFinished ? 'yes' : 'NO'}`,
    `- Items used: ${counts(summary.items.used)}; reached ${summary.items.reached}; shot hits: ${counts(summary.items.hits)}; blocked ${summary.items.blocked}` +
      (summary.items.missing ? `; ${summary.items.missing} events not seen` : ''),
  )
  return lines.join('\n')
}
