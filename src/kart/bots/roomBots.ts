// 2026-11-17: the computer karts of a race room, run by the host's browser (docs/ARCHITECTURE.md
// §4.21, docs/KART-NETCODE.md §13). The very bots of the race against the computer (botRace.ts),
// pointed at the real room instead of one in this browser: their `loaded` goes as an action for
// their seat, their frames wrapped for their seat (shared/protocol.ts PROXY_FRAME), and the room
// judges them like anyone's and passes them on, to this browser too, whose race draws them from
// those. Their clock is the room's (the same pings as a racer's), so they count down to the same GO.
// Nothing here is trusted by the room: it only takes these from the host, for a computer seat.
import type { KartView } from '../../../shared/games/kart/types.ts'
import { isBotName, type BotName } from '../../../shared/games/kart/bots.ts'
import { DRIVER_IDS, KART_IDS, parseLook } from '../../../shared/kart/karts.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import { proxyFrame } from '../../../shared/protocol.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'
import { createServerClock } from '../watch/serverClock.ts'
import { createBotRace, type BotRace, type BotSeat } from './botRace.ts'
import { isDifficulty } from './skill.ts'

/** How often the bots are run up to the room's clock, ms: they step at 60 Hz on their own count */
const RUN_EVERY_MS = 16
/** A hidden tab's timers slow to once a second or worse: the bots catch up rather than lag */
const MAX_BEHIND_MS = 2_000

/** One computer seat as the room shows it: RoomMember.bot, its seat and its look */
export interface RoomBot {
  readonly seat: number
  readonly level: string
  readonly name: string
  readonly look?: string
}

export interface RoomBotsOptions {
  readonly realtime: RoomRealtime
  /** An action for a computer seat (useRoom's `actFor`) */
  actFor(seat: number, action: JsonValue): boolean
  /** The room's race now */
  view(): KartView
  readonly bots: readonly RoomBot[]
}

/** A bot as botRace.ts drives it: its kart and driver are its look, else drawn by its seat */
export function botSeatOf(bot: RoomBot): BotSeat {
  const pick = parseLook(bot.look)
  const name: BotName = isBotName(bot.name) ? bot.name : 'pepper'
  return {
    seat: bot.seat,
    entry: {
      name,
      kart: pick?.kart ?? KART_IDS[bot.seat % KART_IDS.length]!,
      driver: pick?.driver ?? DRIVER_IDS[bot.seat % DRIVER_IDS.length]!,
    },
    difficulty: isDifficulty(bot.level) ? bot.level : 'normal',
  }
}

/** Starts driving; returns the way to stop */
export function startRoomBots(options: RoomBotsOptions): () => void {
  const { realtime } = options
  const clock = createServerClock(realtime)
  const seats = new Set(options.bots.map((bot) => bot.seat))
  let race: BotRace | null = null
  // Only from the grid: a page that comes in later (a reload) cannot pick up where the last one was,
  // and the room has already dropped those karts out (their host's socket closed)
  const fromGrid = options.view().phase === 'loading'
  const timer = window.setInterval(() => {
    const view = options.view()
    if (view.phase === 'finished' || !fromGrid) return
    if (!race) {
      // Not before the room's clock is known: the bots count down to GO by it
      const track = raceTrack(view.track)
      if (!clock.synced() || !track) return
      race = createBotRace({
        room: {
          state: options.view,
          act: (action, seat) => void options.actFor(seat, action),
          frame: (seat, data) => void realtime.send(proxyFrame(seat, data)),
          // The room keeps its own timers
          tick: () => {},
          listen: realtime.listen,
        },
        track,
        laps: view.laps,
        bots: options.bots.map(botSeatOf),
        players: view.racers.map((racer) => racer.seat).filter((seat) => !seats.has(seat)),
        seed: view.seed,
        now: clock.now(),
        maxBehindMs: MAX_BEHIND_MS,
      })
    }
    race.advance(clock.now())
  }, RUN_EVERY_MS)
  return () => {
    window.clearInterval(timer)
    race?.stop()
    clock.stop()
  }
}
