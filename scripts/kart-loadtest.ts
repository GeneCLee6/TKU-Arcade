// e9-t11: `npm run kart:loadtest -- [--url <site>] [--bots 6] [--track oldstreet] [--laps 3]
// [--mode items|race] [--teams] [--karts petrel,swift,whale] [--json <file>]`. Opens a kart room on a site (the local dev server by
// default), lets N bots (`bot-1`, `bot-2`, ...) join it over the real protocol, sit, pick karts and
// race it to the end with the game's physics and the autopilot (scripts/kart/loadtest-bot.ts), then
// dissolves the room and prints what they measured: bytes a second each way, how long a frame took
// from one bot to the others, frames the room dropped, whether the room's laps match the bots' own,
// items used and hit, and whether everyone finished (scripts/kart/loadtest-report.ts). Results and
// how to read them: docs/KART-NETCODE.md §8.
//
// Never against the live site unless its owner asks: that needs --allow-production.
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { DRIVER_IDS, isKartId, KART_IDS } from '../shared/kart/karts.ts'
import { teamScore } from '../shared/games/kart/rules.ts'
import type { KartView } from '../shared/games/kart/types.ts'
import { MAX_RACERS } from '../shared/kart/race.ts'
import { TEAM_NAMES } from '../shared/kart/team.ts'
import { ALL_RACE_TRACK_IDS } from '../shared/kart/tracks/list.ts'
import type { CreateRoomResponse } from '../shared/protocol.ts'
import { Bot, newLedger } from './kart/loadtest-bot.ts'
import {
  buildReport,
  formatReport,
  type ItemEventLike,
  type RunInfo,
} from './kart/loadtest-report.ts'

const PRODUCTION_HOST = 'tku-arcade.genelee-pro.workers.dev'
/** Frames sent this close before the race was seen to end may reach a room that has stopped judging */
const CLOSE_MARGIN_MS = 1_000

const USAGE = `Usage: npm run kart:loadtest -- [--url http://localhost:5175] [--bots 6] [--track oldstreet] [--laps 3] [--mode items|race] [--teams] [--karts petrel,swift,whale] [--json out.json] [--quiet]`

function usage(problem: string): never {
  console.error(`${problem}\n${USAGE}`)
  process.exit(2)
}

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5175' },
    bots: { type: 'string', default: '6' },
    track: { type: 'string', default: 'oldstreet' },
    laps: { type: 'string', default: '3' },
    mode: { type: 'string', default: 'items' },
    // 2026-11-18: a team race (shared/kart/team.ts); the bots then drift through the bends, so that
    // the team gauges fill, and fire the team boosts they get
    teams: { type: 'boolean', default: false },
    // 2026-11-19: the vehicles the bots take turns in (shared/kart/karts.ts); left out, all of them
    // in the table's order, so six bots drive the first six
    karts: { type: 'string' },
    json: { type: 'string' },
    quiet: { type: 'boolean', default: false },
    'allow-production': { type: 'boolean', default: false },
  },
})

const url = new URL(values.url)
const bots = Number(values.bots)
const laps = Number(values.laps)
const track = values.track
const mode = values.mode
if (!Number.isInteger(bots) || bots < 1 || bots > MAX_RACERS) usage(`--bots must be 1 to ${MAX_RACERS}`)
if (!Number.isInteger(laps) || laps < 1 || laps > 9) usage('--laps must be 1 to 9')
if (!(ALL_RACE_TRACK_IDS as readonly string[]).includes(track)) usage(`--track must be one of ${ALL_RACE_TRACK_IDS.join(', ')}`)
if (mode !== 'items' && mode !== 'race') usage('--mode must be items or race')
const picks = values.karts === undefined ? KART_IDS : values.karts.split(',').filter(isKartId)
if (picks.length === 0) usage(`--karts must name vehicles: ${KART_IDS.join(', ')}`)
if (url.hostname === PRODUCTION_HOST && !values['allow-production']) {
  usage(`${url.hostname} is the live site: only when its owner asks, with --allow-production`)
}

const log = (line: string) => {
  if (!values.quiet) console.error(line)
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(what: string, test: () => boolean, ms: number): Promise<void> {
  const until = performance.now() + ms
  while (!test()) {
    if (performance.now() > until) throw new Error(`timed out waiting for ${what}`)
    await pause(20)
  }
}

async function createRoom(): Promise<CreateRoomResponse> {
  const response = await fetch(new URL('/api/rooms', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      gameId: 'kart',
      options: { track, laps, mode, teams: values.teams ? 'teams' : 'solo' },
      public: false,
    }),
  })
  if (response.status !== 201) throw new Error(`POST /api/rooms: ${response.status} ${await response.text()}`)
  return (await response.json()) as CreateRoomResponse
}

/** A team race as it ended: how often each gauge filled, the team boosts fired, and the score */
function teamRun(game: KartView): NonNullable<RunInfo['teams']> {
  const score = teamScore(game)
  return {
    fills: game.teams?.fills ?? [0, 0],
    fired: game.racers.reduce((sum, racer) => sum + (racer.teamUsed ?? 0), 0),
    held: game.racers.reduce((sum, racer) => sum + (racer.teamBoosts ?? 0), 0),
    score: [score.totals[0], score.totals[1]],
    winner: score.winner === null ? null : TEAM_NAMES[score.winner],
  }
}

async function main(): Promise<number> {
  const startedAt = performance.now()
  const room = await createRoom()
  log(`room ${room.id} (${room.code ?? 'no code'}) on ${url.origin}`)
  const ledger = newLedger()
  const racers: Bot[] = []
  let dissolved = false
  let loop: ReturnType<typeof setInterval> | null = null
  const events = new Map<number, ItemEventLike>()
  let goAt: number | null = null
  let endedAt: number | null = null
  let goSeenAt: number | null = null
  try {
    // One at a time, so that bot-1 is the host and the seats go in order
    for (let i = 0; i < bots; i++) {
      const kart = picks[i % picks.length]!
      const driver = DRIVER_IDS[i % DRIVER_IDS.length]!
      const bot = new Bot({ name: `bot-${i + 1}`, url: url.origin, room: room.id, kart, driver, ledger, log })
      await bot.connect()
      bot.sendJson({ t: 'set_look', look: bot.look })
      racers.push(bot)
    }
    const host = racers[0]!
    await waitFor(
      'every bot seated',
      () => racers.every((bot) => bot.me()?.seat !== null && bot.me()?.seat !== undefined),
      10_000,
    )
    // 2026-11-21: the race room starts only once everyone but the host is ready (protocol.ts 8.)
    for (const bot of racers.slice(1)) bot.sendJson({ t: 'ready', ready: true })
    await waitFor(
      'every bot ready',
      () => racers.slice(1).every((bot) => bot.me()?.ready === true),
      10_000,
    )
    // Everyone's clock settled before the countdown, as a browser's is while it loads the track
    await pause(1_500)
    host.sendJson({ t: 'start' })
    log(`${bots} bots seated; start`)

    loop = setInterval(() => {
      const now = performance.now()
      for (const bot of racers) bot.tick(now)
      for (const event of host.game()?.events ?? []) events.set(event.n, event)
    }, 4)

    await waitFor('GO', () => host.game()?.goAt != null, 40_000)
    goAt = host.game()!.goAt
    // Rates count from GO, by the host's synced clock
    await waitFor('GO to come', () => (host.serverNow() ?? 0) >= goAt!, 10_000)
    for (const bot of racers) bot.markGo()
    goSeenAt = performance.now()
    log(`GO at ${new Date(goAt!).toISOString()}`)
    await waitFor('the race to end', () => host.game()?.phase === 'finished', laps * 4 * 60_000 + 60_000)
    endedAt = performance.now()
    for (const bot of racers) bot.markEnd()
    ledger.closedAt = endedAt
    // The last patches and frames in flight
    await pause(1_500)
  } finally {
    if (loop) clearInterval(loop)
    const host = racers[0]
    if (host) {
      if (host.closed && host.token) {
        // Back in with the host's token to dissolve the room
        await host.connect().catch(() => {})
      }
      host.sendJson({ t: 'dissolve' })
      await waitFor('the room to close', () => racers.every((bot) => bot.closed), 5_000)
        .then(() => {
          dissolved = racers.every((bot) => bot.closeCode === 4412)
        })
        .catch(() => {})
    }
    for (const bot of racers) bot.close()
  }

  const raceEnd = endedAt ?? performance.now()
  const raceSeconds = goSeenAt === null ? 0 : (raceEnd - goSeenAt) / 1000
  for (const bot of racers) bot.forgetAfter(raceEnd - CLOSE_MARGIN_MS)
  const lastGame = racers[0]?.game() ?? null
  const report = buildReport(
    {
      url: url.origin,
      room: room.id,
      track,
      laps,
      mode,
      bots,
      at: new Date().toISOString(),
      raceSeconds,
      totalSeconds: (performance.now() - startedAt) / 1000,
      phase: racers[0]?.game()?.phase ?? 'none',
      events: [...events.values()].sort((a, b) => a.n - b.n),
      dissolved,
      ...(lastGame?.teams ? { teams: teamRun(lastGame) } : {}),
    },
    racers.map((bot) => bot.tally()),
  )
  console.log(formatReport(report))
  if (values.json) {
    writeFileSync(values.json, `${JSON.stringify(report, null, 2)}\n`)
    log(`JSON: ${values.json}`)
  }
  return report.summary.allFinished && report.summary.lapsAgree && dissolved ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  },
)
