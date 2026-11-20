// The kart race room (e9-t02, e9-t07, e9-t08; docs/ARCHITECTURE.md §4.14, docs/KART-NETCODE.md).
// Worker only: it judges laps on the tracks themselves.
//
// loading → countdown → racing → finished. Everyone's browser loads the track and says so; when all
// have (or LOAD_WAIT_MS runs out) the countdown starts, and the room's clock sets GO COUNTDOWN_MS
// later (`realtime.clock`): every browser counts down to that same moment on its own clock, synced
// to the server's (net.ts's clock pings). Then each browser races its own kart and sends frames;
// `realtime.frame` judges them (shared/kart/race.ts) and turns every lap the server sees into a
// `lap` action, the last of them a finish. CLOSE_AFTER_FINISH_MS after the first finish, or once
// everyone is done, the race is over; a kart not heard from for RETIRE_AFTER_MS drops out, and
// RACE_CAP_MS per lap closes a race nobody can end.
import {
  decodeItemFrame,
  drawItem,
  HARMFUL_ITEMS,
  isItemId,
  ITEM_TUNING,
  itemBoxes,
  KEEP_EVENTS,
  placeBucket,
  rollFor,
  type ItemFrame,
  type Warp,
} from '../../kart/items.ts'
import { loadoutOfByte } from '../../kart/karts.ts'
import { decodeFrame } from '../../kart/net.ts'
import {
  dropPuddle,
  isShot,
  isShotItem,
  keepShots,
  sendCloud,
  SHOT_TUNING,
  shotHits,
  throwHail,
  type Fix,
  type KartShot,
} from '../../kart/shots.ts'
import {
  judgeFrame,
  lapsDone,
  raceProgress,
  speedCapFor,
  startTracking,
  type Tracked,
} from '../../kart/race.ts'
import {
  assignTeams,
  foeShots,
  gaugeStep,
  isTeamId,
  NO_TRACE,
  scoreTeams,
  TEAM_BOOST_MS,
  TEAM_GAUGE,
  TEAM_NAMES,
  teamGain,
  type TeamTrace,
} from '../../kart/team.ts'
import { TEAM_BOOST } from '../../kart/teamBoost.ts'
import { courseOf, type Track } from '../../kart/track.ts'
import { formatTime } from '../../kart/timeTrial.ts'
import { CUSTOM_PREFIX, isCustomId, isTrackCode } from '../../kart/editor/custom.ts'
import { raceTrack } from '../../kart/tracks/registry.ts'
import {
  gameError,
  type GameModule,
  type GameResult,
  type RealtimeMemory,
  type SeatId,
  type Standing,
  type TimerSpec,
} from '../types.ts'
import { GAME_META } from '../lobby.ts'
import { BOT_LEVELS, BOT_NAMES } from './bots.ts'
import { CUSTOM_TRACK, kartInfo, MAX_LAPS } from './info.ts'
import type {
  KartAction,
  KartItemEvent,
  KartOptions,
  KartRacer,
  KartState,
  KartView,
} from './types.ts'

/** How long the room waits for everyone's track to load before it starts anyway */
export const LOAD_WAIT_MS = 25_000
/**
 * 2026-11-20 (the race's show, docs/ARCHITECTURE.md §4.43): the camera's fly round the grid before
 * the countdown, which anyone may skip on their own screen; GO is the room's and does not move
 */
export const INTRO_MS = 2_500
/** From everyone on the grid to GO: the fly round, a moment to settle, then 3, 2, 1 */
export const COUNTDOWN_MS = INTRO_MS + 4_000
/** After the first kart finishes, the others have this long */
export const CLOSE_AFTER_FINISH_MS = 30_000
/** A kart not heard from this long during the race drops out */
export const RETIRE_AFTER_MS = 20_000
/** A race closes after this long per lap, whatever happens */
export const RACE_CAP_MS = 4 * 60_000

/** A kart's path between two frames further apart than this is not judged against shots, only its end */
const PATH_GAP_MS = 1_000

const PHASE = 'games.kart.error.phase'
const BAD = 'games.kart.error.badAction'

const done = (racer: KartRacer) => racer.finishMs !== null || racer.out

/** Over once nobody is still out on the track */
function settle(state: KartState): KartState {
  return state.racers.every(done) ? { ...state, phase: 'finished' } : state
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isSeatList = (value: unknown): value is SeatId[] =>
  Array.isArray(value) && value.every((seat) => Number.isInteger(seat))

const isWarp = (value: unknown): value is Warp =>
  isObject(value) &&
  Number.isInteger(value.seat) &&
  ['x', 'z', 'heading'].every((key) => isTime(value[key])) &&
  Number.isInteger(value.nextGate) &&
  Number.isInteger(value.crossings)

type Memory = {
  tracked: Map<SeatId, Tracked>
  /**
   * A team race (team.ts): what each kart's last frame showed, and each team's gauge to the
   * fraction (the state has it in steps); null until first read, then started from the state
   */
  traces: Map<SeatId, TeamTrace>
  gauge: [number, number] | null
}

const memoryOf = (memory: RealtimeMemory): Memory => {
  if (!(memory.tracked instanceof Map)) memory.tracked = new Map<SeatId, Tracked>()
  if (!(memory.traces instanceof Map)) memory.traces = new Map<SeatId, TeamTrace>()
  if (!Array.isArray(memory.gauge)) memory.gauge = null
  return memory as unknown as Memory
}

/** A kart's side in a team race; undefined in any other race */
const teamOfSeat = (state: KartState, seat: SeatId) =>
  state.teams ? state.racers.find((racer) => racer.seat === seat)?.team : undefined

/** How many karts each team has, dropped out or not */
const teamSizes = (state: KartState): [number, number] => [
  state.racers.filter((racer) => racer.team === 0).length,
  state.racers.filter((racer) => racer.team === 1).length,
]

/** A team race's score so far: the karts that have finished, in the order they did */
export function teamScore(state: KartState) {
  const finished = state.racers
    .filter((racer) => racer.finishMs !== null)
    .sort((a, b) => (a.finishMs as number) - (b.finishMs as number) || a.seat - b.seat)
    .map((racer) => racer.seat)
  const teamOf = (seat: SeatId) => state.racers.find((racer) => racer.seat === seat)?.team ?? null
  return scoreTeams(finished, teamOf, teamSizes(state))
}

/** A team race's result: everyone in finishing order with their points and team, and who won */
function teamResult(state: KartState): GameResult {
  const score = teamScore(state)
  const lines = standings(state).map((line): Standing => {
    const racer = state.racers.find((one) => one.seat === line.seat)
    const side = TEAM_NAMES[racer?.team ?? 0]
    const done = racer?.finishMs != null
    return {
      ...line,
      score: score.points.get(line.seat) ?? 0,
      note: {
        key: done ? `games.kart.note.${side}Time` : `games.kart.note.${side}Out`,
        params: line.note.params ?? {},
      },
    }
  })
  const [red, blue] = score.totals
  return {
    summary:
      score.winner === null
        ? { key: 'games.kart.result.teamDraw' }
        : { key: `games.kart.result.${TEAM_NAMES[score.winner]}Won`, params: { red, blue } },
    standings: lines,
  }
}

function standings(state: KartState): Standing[] {
  const finished = state.racers
    .filter((racer) => racer.finishMs !== null)
    .sort((a, b) => (a.finishMs as number) - (b.finishMs as number) || a.seat - b.seat)
  const rest = state.racers
    .filter((racer) => racer.finishMs === null)
    .sort((a, b) => b.lapMs.length - a.lapMs.length || a.seat - b.seat)
  const lines: Standing[] = finished.map((racer, index) => ({
    seat: racer.seat,
    // Two karts can only tie to the millisecond in theory, and then they share the place
    rank:
      index > 0 && finished[index - 1]!.finishMs === racer.finishMs
        ? finished.findIndex((other) => other.finishMs === racer.finishMs) + 1
        : index + 1,
    score: null,
    note: {
      key: 'games.kart.note.time',
      params: { time: formatTime((racer.finishMs as number) / 1000) },
    },
  }))
  // Those who did not finish share a place by laps done
  rest.forEach((racer, index) => {
    const first = rest.findIndex((other) => other.lapMs.length === racer.lapMs.length)
    lines.push({
      seat: racer.seat,
      rank: finished.length + (first === index ? index : first) + 1,
      score: null,
      note: { key: 'games.kart.note.out', params: { laps: racer.lapMs.length } },
    })
  })
  return lines
}

/**
 * The track a race runs on: one of the tracks by id, or (e10-t08) a track from the editor as
 * `custom:<code>`, built and checked again here whatever the options said; else the first track
 */
export function raceTrackId(options: Pick<KartOptions, 'track' | 'custom'>): string {
  if (options.track === CUSTOM_TRACK) {
    const id = `${CUSTOM_PREFIX}${options.custom}`
    return raceTrack(id) ? id : kartInfo.options.track.default
  }
  return !isCustomId(options.track) && raceTrack(options.track)
    ? options.track
    : kartInfo.options.track.default
}

export const kart: GameModule<KartState, KartAction, KartView, KartOptions> = {
  ...kartInfo,
  meta: GAME_META.kart,
  // e10-t08: the Worker's copy checks a custom track in full when the host sets it (custom.ts); the
  // browser's form (info.ts) checks only its shape
  options: {
    ...kartInfo.options,
    custom: { ...kartInfo.options.custom, check: isTrackCode },
  } as typeof kartInfo.options,

  init(seats, options, rng) {
    const track = raceTrackId(options)
    const laps = Math.max(1, Math.min(MAX_LAPS, Math.round(options.laps)))
    const mode = options.mode === 'race' ? 'race' : 'items'
    // 2026-11-18: a team race, each seat on the side it chose or the smaller one (team.ts)
    const teams = options.teams === 'teams' ? assignTeams(seats) : null
    return {
      ...(teams ? { teams: { gauge: [0, 0], fills: [0, 0] } } : {}),
      mode,
      seed: rng.int(2 ** 31),
      boxes: mode === 'items' ? itemBoxes(raceTrack(track)!).map(() => 0) : [],
      draws: 0,
      events: [],
      used: 0,
      shots: [],
      track,
      laps,
      phase: 'loading',
      goAt: null,
      racers: seats.map((seat, index) => ({
        seat: seat.id,
        loaded: false,
        lapMs: [],
        finishMs: null,
        out: false,
        item: null,
        shieldUntil: 0,
        ...(teams ? { team: teams[index]!, teamBoosts: 0, teamUsed: 0, teamUntil: 0 } : {}),
      })),
    }
  },

  reduce(state, action, actor) {
    if (!isObject(action) || typeof action.t !== 'string') return gameError(BAD)
    const a = action as Record<string, unknown>
    if (action.t === 'loaded') {
      const racer = state.racers.find((one) => one.seat === actor)
      if (actor === 'system' || !racer) return gameError(BAD)
      if (state.phase !== 'loading' || racer.loaded) return gameError(PHASE)
      const racers = state.racers.map((one) => (one === racer ? { ...one, loaded: true } : one))
      // A kart that dropped out before the start (a computer kart whose host went) is not waited for
      const all = racers.every((one) => one.loaded || one.out)
      return { ...state, racers, phase: all ? 'countdown' : 'loading' }
    }
    // Everything else is the room's own doing: a timer, the clock or a judged frame
    if (actor !== 'system') return gameError(BAD)
    switch (action.t) {
      case 'start':
        return state.phase === 'loading' ? { ...state, phase: 'countdown' } : gameError(PHASE)
      case 'schedule':
        if (state.phase !== 'countdown' || state.goAt !== null) return gameError(PHASE)
        return typeof a.goAt === 'number' && Number.isFinite(a.goAt)
          ? { ...state, goAt: a.goAt }
          : gameError(BAD)
      case 'go':
        return state.phase === 'countdown' ? { ...state, phase: 'racing' } : gameError(PHASE)
      case 'lap': {
        if (state.phase !== 'racing') return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        const ms = a.ms
        if (!racer || done(racer) || typeof ms !== 'number' || !Number.isFinite(ms)) {
          return gameError(BAD)
        }
        const sofar = racer.lapMs.reduce((sum, lap) => sum + lap, 0)
        if (ms < sofar) return gameError(BAD)
        const lapMs = [...racer.lapMs, Math.round(ms - sofar)]
        const finishMs = lapMs.length >= state.laps ? Math.round(ms) : null
        const racers = state.racers.map((one) =>
          one === racer ? { ...one, lapMs, finishMs } : one,
        )
        return settle({ ...state, racers })
      }
      case 'retire': {
        // Before GO too: a computer kart whose host went (`realtime.abandon`)
        if (state.phase === 'finished') return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        if (!racer || done(racer)) return gameError(BAD)
        const racers = state.racers.map((one) => (one === racer ? { ...one, out: true } : one))
        // Everyone else on the grid already: the countdown need not wait for this one
        const loaded = state.phase === 'loading' && racers.every((one) => one.loaded || one.out)
        return settle({ ...state, racers, phase: loaded ? 'countdown' : state.phase })
      }
      case 'got': {
        if (state.phase !== 'racing' || state.mode !== 'items') return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        const box = a.box
        const at = a.at
        const item = a.item
        if (
          !racer ||
          done(racer) ||
          (racer.item ?? null) !== null ||
          !isItemId(item) ||
          !isTime(at) ||
          typeof box !== 'number' ||
          !Number.isInteger(box) ||
          box < 0 ||
          box >= state.boxes.length ||
          state.boxes[box]! > at
        ) {
          return gameError(BAD)
        }
        return {
          ...state,
          boxes: state.boxes.map((ready, i) => (i === box ? at + ITEM_TUNING.boxRespawnMs : ready)),
          draws: state.draws + 1,
          racers: state.racers.map((one) => (one === racer ? { ...one, item } : one)),
        }
      }
      case 'use': {
        if (state.phase !== 'racing' || state.mode !== 'items') return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        const { item, at, targets, blocked, warps } = a
        const shot = a.shot ?? null
        if (
          !racer ||
          done(racer) ||
          !isItemId(item) ||
          racer.item !== item ||
          !isTime(at) ||
          !isSeatList(targets) ||
          !isSeatList(blocked) ||
          !Array.isArray(warps) ||
          !warps.every(isWarp) ||
          // A thrown or dropped item puts its shot on the road, and nothing else does
          (isShotItem(item)
            ? !isShot(shot) || shot.item !== item || shot.by !== racer.seat || shot.n !== state.used
            : shot !== null)
        ) {
          return gameError(BAD)
        }
        const event: KartItemEvent = {
          n: state.used,
          item,
          by: racer.seat,
          targets,
          blocked,
          at,
          warps,
          hit: false,
        }
        const racers = state.racers.map((one) => {
          if (one === racer) {
            return {
              ...one,
              item: null,
              shieldUntil: item === 'shield' ? at + ITEM_TUNING.shieldMs : one.shieldUntil,
            }
          }
          // A shield that stopped something is used up
          return blocked.includes(one.seat) ? { ...one, shieldUntil: 0 } : one
        })
        return {
          ...state,
          racers,
          used: state.used + 1,
          events: [...state.events, event].slice(-KEEP_EVENTS),
          shots: keepShots(isShot(shot) ? [...(state.shots ?? []), shot] : (state.shots ?? []), at),
        }
      }
      case 'hit': {
        if (state.phase !== 'racing' || state.mode !== 'items') return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        const shot = (state.shots ?? []).find((one) => one.n === a.shot)
        const at = a.at
        if (!racer || done(racer) || !shot || !isTime(at)) return gameError(BAD)
        // A shield up stops it, and is used up doing it
        const blocked = racer.shieldUntil > at
        const event: KartItemEvent = {
          n: state.used,
          item: shot.item,
          by: shot.by,
          targets: [racer.seat],
          blocked: blocked ? [racer.seat] : [],
          at,
          warps: [],
          hit: true,
        }
        return {
          ...state,
          racers: state.racers.map((one) =>
            one === racer && blocked ? { ...one, shieldUntil: 0 } : one,
          ),
          used: state.used + 1,
          events: [...state.events, event].slice(-KEEP_EVENTS),
          shots: keepShots(
            (state.shots ?? []).filter((one) => one !== shot),
            at,
          ),
        }
      }
      case 'tgauge': {
        const { team, gauge } = a
        if (state.phase !== 'racing' || !state.teams) return gameError(PHASE)
        if (!isTeamId(team) || !isTime(gauge) || gauge < 0 || gauge >= TEAM_GAUGE.full) {
          return gameError(BAD)
        }
        const next: [number, number] = [...state.teams.gauge]
        next[team] = gauge
        return { ...state, teams: { ...state.teams, gauge: next } }
      }
      case 'tfill': {
        const { team } = a
        if (state.phase !== 'racing' || !state.teams) return gameError(PHASE)
        if (!isTeamId(team)) return gameError(BAD)
        const gauge: [number, number] = [...state.teams.gauge]
        const fills: [number, number] = [...state.teams.fills]
        gauge[team] = 0
        fills[team]++
        return {
          ...state,
          teams: { gauge, fills },
          // The charges held by those still racing turn blue: all a kart can hold, until it says it
          // held fewer (`tkeep`). The room never hears how many charges a kart holds
          racers: state.racers.map((one) =>
            one.team === team && !done(one) ? { ...one, teamBoosts: TEAM_BOOST.maxHeld } : one,
          ),
        }
      }
      case 'tfire': {
        if (state.phase !== 'racing' || !state.teams) return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        const at = a.at
        if (!racer || done(racer) || !isTime(at) || (racer.teamBoosts ?? 0) <= 0) {
          return gameError(BAD)
        }
        return {
          ...state,
          racers: state.racers.map((one) =>
            one === racer
              ? {
                  ...one,
                  teamBoosts: (one.teamBoosts ?? 0) - 1,
                  teamUsed: (one.teamUsed ?? 0) + 1,
                  teamUntil: at + TEAM_BOOST_MS,
                }
              : one,
          ),
        }
      }
      case 'tkeep': {
        if (state.phase !== 'racing' || !state.teams) return gameError(PHASE)
        const racer = state.racers.find((one) => one.seat === a.seat)
        const held = a.held
        // Only ever down: a kart cannot talk itself into more
        if (!racer || typeof held !== 'number' || !Number.isInteger(held)) return gameError(BAD)
        if (held < 0 || held >= (racer.teamBoosts ?? 0)) return gameError(BAD)
        return {
          ...state,
          racers: state.racers.map((one) => (one === racer ? { ...one, teamBoosts: held } : one)),
        }
      }
      case 'close':
        if (state.phase === 'finished') return gameError(PHASE)
        return {
          ...state,
          phase: 'finished',
          racers: state.racers.map((one) => (done(one) ? one : { ...one, out: true })),
        }
      default:
        return gameError(BAD)
    }
  },

  view(state, viewer) {
    return { ...state, you: viewer === 'spectator' ? null : viewer }
  },

  legalActions(state, seat) {
    const racer = state.racers.find((one) => one.seat === seat)
    return state.phase === 'loading' && racer && !racer.loaded ? [{ t: 'loaded' }] : []
  },

  isOver: (state) => state.phase === 'finished',

  result(state): GameResult {
    if (state.teams) return teamResult(state)
    return { summary: { key: 'games.kart.result.won' }, standings: standings(state) }
  },

  timers(state): TimerSpec<KartAction>[] {
    switch (state.phase) {
      case 'loading':
        return [{ id: 'load', ms: LOAD_WAIT_MS, action: { t: 'start' } }]
      case 'countdown':
        // Started with the countdown, at the very moment `realtime.clock` sets goAt by
        return [{ id: 'go', ms: COUNTDOWN_MS, action: { t: 'go' } }]
      case 'racing': {
        const timers: TimerSpec<KartAction>[] = [
          { id: 'cap', ms: RACE_CAP_MS * state.laps, action: { t: 'close' } },
        ]
        if (state.racers.some((racer) => racer.finishMs !== null)) {
          timers.push({ id: 'close', ms: CLOSE_AFTER_FINISH_MS, action: { t: 'close' } })
        }
        return timers
      }
      default:
        return []
    }
  },

  // 2026-11-17: computer karts in a race room, run by the host's browser (§4.21)
  bots: { levels: BOT_LEVELS, names: BOT_NAMES },

  realtime: {
    memory: () => ({ tracked: new Map<SeatId, Tracked>() }),

    // The host who ran these computer karts went: they drop out at once
    abandon(state, seats) {
      if (state.phase === 'finished') return []
      return state.racers
        .filter((racer) => seats.includes(racer.seat) && !done(racer))
        .map((racer) => ({ t: 'retire', seat: racer.seat }))
    },

    clock(state, now) {
      return state.phase === 'countdown' && state.goAt === null
        ? [{ t: 'schedule', goAt: now + COUNTDOWN_MS }]
        : []
    },

    frame(state, memory, seat, data, now) {
      const itemFrame = decodeItemFrame(data)
      if (itemFrame) {
        const actions =
          itemFrame.op === 'team'
            ? judgeTeamFire(state, seat, now)
            : itemFrame.op === 'keep'
              ? judgeTeamKeep(state, seat, itemFrame.held, itemFrame.fill)
              : judgeItem(state, memoryOf(memory), seat, itemFrame, now)
        return { relay: null, actions }
      }
      const frame = decodeFrame(data)
      const racer = state.racers.find((one) => one.seat === seat)
      const track = raceTrack(state.track)
      if (!frame || !racer || !track || state.phase === 'finished') {
        return { relay: null, actions: [] }
      }
      // On the grid, and once a kart is done, its frames only go round to be drawn
      if (state.phase === 'loading' || done(racer)) return { relay: data, actions: [] }
      const { tracked } = memoryOf(memory)
      const slot = state.racers.indexOf(racer)
      const before = tracked.get(seat)
      const verdict = judgeFrame(tracked.get(seat) ?? startTracking(track, slot), frame, {
        track,
        slot,
        now,
        goAt: state.goAt,
        laps: racer.lapMs.length,
        // e10-t05a: held to its own kart's top speed, which the frame names (a faster kart is not a bug)
        speedCap: speedCapFor(loadoutOfByte(frame.body).kart),
      })
      tracked.set(seat, verdict.tracked)
      if (verdict.kind === 'refused') return { relay: null, actions: [] }
      const actions: KartAction[] = []
      if (verdict.lapAt !== null && state.phase === 'racing') {
        actions.push({ t: 'lap', seat, ms: Math.max(0, verdict.lapAt) })
      }
      // e9-t06b: the kart's path since its last frame, against every shot on the road
      const finishing = verdict.lapAt !== null && racer.lapMs.length + 1 >= state.laps
      if (state.phase === 'racing' && state.mode === 'items' && !finishing) {
        // After a jump (a reset, a swap) or a long gap, only where the kart is now counts
        const last = before?.last
        const from: Fix | null =
          last && !frame.reset && now - before.lastAt <= PATH_GAP_MS
            ? { x: last.x, z: last.z, at: before.lastAt }
            : null
        const shots = foeShots(state.shots ?? [], seat, (one) => teamOfSeat(state, one))
        const hit = shotHitting(shots, seat, from, { x: frame.x, z: frame.z, at: now })
        if (hit) actions.push({ t: 'hit', seat, shot: hit.n, at: now })
      }
      // 2026-11-18, a team race: what this frame earns the kart's team (team.ts)
      if (state.phase === 'racing' && state.teams && isTeamId(racer.team) && !finishing) {
        const filled = fillTeamGauge(state, memoryOf(memory), racer, frame, now)
        if (filled) actions.push(filled)
      }
      // Anyone gone quiet too long drops out; judged whenever someone else's frame comes in
      if (state.phase === 'racing' && state.goAt !== null) {
        for (const other of state.racers) {
          if (other.seat === seat || done(other)) continue
          const heard = tracked.get(other.seat)?.lastAt ?? 0
          if (now - Math.max(heard, state.goAt) > RETIRE_AFTER_MS) {
            actions.push({ t: 'retire', seat: other.seat })
          }
        }
      }
      return { relay: data, actions }
    },
  },
}

/**
 * The first shot (oldest first) that hits kart `seat` on its way from `from` to `to`: one a frame,
 * so that a shield stops only the first
 */
export function shotHitting(
  shots: readonly KartShot[],
  seat: SeatId,
  from: Fix | null,
  to: Fix,
): KartShot | null {
  return shots.find((shot) => shotHits(shot, seat, from, to)) ?? null
}

// ── The team race (2026-11-18, shared/kart/team.ts) ──────────────────────────────────────────────────

/**
 * A frame the room has taken, added to its kart's team's gauge. The gauge is kept to the fraction
 * in memory (frames never write the state); an action comes of it only when the gauge fills, or
 * moves on a step for the browsers to show. Should the memory be lost, it starts again from the
 * state's step
 */
function fillTeamGauge(
  state: KartState,
  memory: Memory,
  racer: KartRacer,
  frame: { vx: number; vz: number; drifting: boolean },
  now: number,
): KartAction | null {
  const team = racer.team
  if (!state.teams || !isTeamId(team)) return null
  memory.gauge ??= [...state.teams.gauge]
  const size = state.racers.filter((one) => one.team === team).length
  const burning = (racer.teamUntil ?? 0) > now
  const earned = teamGain(memory.traces.get(racer.seat) ?? NO_TRACE, frame, now, size, burning)
  memory.traces.set(racer.seat, earned.trace)
  if (earned.gain <= 0) return null
  memory.gauge[team] += earned.gain
  if (memory.gauge[team] >= TEAM_GAUGE.full) {
    memory.gauge[team] = 0
    return { t: 'tfill', team }
  }
  const step = gaugeStep(memory.gauge[team])
  return step !== state.teams.gauge[team] ? { t: 'tgauge', team, gauge: step } : null
}

/**
 * A kart says that when its team's gauge filled for the `fill`th time it held only `held` charges:
 * so many of its charges are blue, and no more. Taken only downwards, and only for the fill that
 * stands (one that crossed a newer fill on the way is about the charges of before)
 */
function judgeTeamKeep(state: KartState, seat: SeatId, held: number, fill: number): KartAction[] {
  const racer = state.racers.find((one) => one.seat === seat)
  if (state.phase !== 'racing' || !state.teams || !racer || done(racer)) return []
  if (!isTeamId(racer.team) || (state.teams.fills[racer.team] & 0xff) !== fill) return []
  if (held >= (racer.teamBoosts ?? 0)) return []
  return [{ t: 'tkeep', seat, held }]
}

/**
 * A kart says it has fired a blue boost: taken when the room knows it to hold one. That one fires
 * only once the last has burnt out is the kart's own physics' to keep (classic.ts): the room's
 * clock and the kart's are never quite the same, and a headwind or a hit ends a boost early
 */
function judgeTeamFire(state: KartState, seat: SeatId, now: number): KartAction[] {
  const racer = state.racers.find((one) => one.seat === seat)
  if (state.phase !== 'racing' || !state.teams || !racer || done(racer)) return []
  if ((racer.teamBoosts ?? 0) <= 0) return []
  return [{ t: 'tfire', seat, at: now }]
}

// ── Items (e9-t05, e9-t06a, e9-t06b) ──────────────────────────────────────────────────────────────────

type Runner = { seat: SeatId; at: number; tracked: Tracked | undefined }

/** Each kart still racing and how far round it is, by what the server last saw of it: first first */
function field(state: KartState, tracked: Map<SeatId, Tracked>, track: Track): Runner[] {
  return state.racers
    .filter((racer) => !done(racer))
    .map((racer) => {
      const one = tracked.get(racer.seat)
      const last = one?.last
      const at = one && last ? raceProgress(track, one.crossings, one.nextGate, last.x, last.z) : 0
      return { seat: racer.seat, at, tracked: one }
    })
    .sort((a, b) => b.at - a.at || a.seat - b.seat)
}

/** How far (x, z) is from the segment from a to b */
function distanceToSegment(
  x: number,
  z: number,
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = dx * dx + dz * dz
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length))
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
}

/**
 * An item frame from `seat`, judged against the state and where the server last saw every kart:
 * the actions it leads to, none when it is refused. A pickup needs the box there, nothing held and
 * the kart near the box on its way; the item is drawn by place. A use needs the item held and, for
 * one that reaches another kart, someone to reach; a shield up stops a harmful one
 */
function judgeItem(
  state: KartState,
  memory: Memory,
  seat: SeatId,
  frame: Exclude<ItemFrame, { op: 'team' | 'keep' }>,
  now: number,
): KartAction[] {
  const racer = state.racers.find((one) => one.seat === seat)
  const track = raceTrack(state.track)
  if (state.mode !== 'items' || state.phase !== 'racing' || !racer || done(racer) || !track) {
    return []
  }
  const own = memory.tracked.get(seat)
  const last = own?.last
  if (!own || !last) return []
  const racing = field(state, memory.tracked, track)
  const place = Math.max(
    0,
    racing.findIndex((one) => one.seat === seat),
  )

  if (frame.op === 'pickup') {
    const box = itemBoxes(track)[frame.box]
    if (!box || (racer.item ?? null) !== null || (state.boxes[frame.box] ?? Infinity) > now) {
      return []
    }
    // Where it was last seen, on to where it is heading in the next quarter second
    const ahead = { x: last.x + last.vx * 0.25, z: last.z + last.vz * 0.25 }
    if (distanceToSegment(box.x, box.z, last, ahead) > ITEM_TUNING.boxReach) return []
    // Karts that have finished are ahead of everyone still racing
    const before = state.racers.filter((one) => one.finishMs !== null).length
    const bucket = placeBucket(before + place, before + racing.length)
    const item = drawItem(bucket, rollFor(state.seed, state.draws))
    return [{ t: 'got', seat, box: frame.box, item, at: now }]
  }

  const item = frame.item
  if (racer.item !== item) return []
  const applied = (targets: SeatId[], warps: Warp[] = []): KartAction[] => {
    const blocked = HARMFUL_ITEMS.has(item)
      ? targets.filter(
          (target) => (state.racers.find((one) => one.seat === target)?.shieldUntil ?? 0) > now,
        )
      : []
    return [
      {
        t: 'use',
        seat,
        item,
        at: now,
        targets,
        blocked,
        warps: blocked.length ? [] : warps,
        shot: null,
      },
    ]
  }
  /** A thrown or dropped item: its shot goes on the road, from where the kart was last seen */
  const thrown = (shot: KartShot, targets: SeatId[] = []): KartAction[] => [
    { t: 'use', seat, item, at: now, targets, blocked: [], warps: [], shot },
  ]
  const thrower = {
    seat,
    x: last.x,
    z: last.z,
    heading: last.heading,
    vx: last.vx,
    vz: last.vz,
  }
  const ahead = racing.slice(0, place)
  // The kart right ahead, whoever it is: a tow pulls towards a team-mate as well as anyone
  const towed = ahead[ahead.length - 1]
  const towedAt = towed?.tracked?.last
  const towedDistance = towedAt ? Math.hypot(towedAt.x - last.x, towedAt.z - last.z) : Infinity
  // 2026-11-18, a team race: what harms passes team-mates by. A headwind slows only the other side,
  // and a swap or a cloud goes for the nearest of the other side ahead
  const foes = state.teams
    ? ahead.filter((one) => teamOfSeat(state, one.seat) !== racer.team)
    : ahead
  const next = foes[foes.length - 1]
  const there = next?.tracked?.last
  const distance = there ? Math.hypot(there.x - last.x, there.z - last.z) : Infinity
  switch (item) {
    case 'boost':
    case 'shield':
      return applied([])
    case 'tow':
      return towed && towedDistance <= ITEM_TUNING.towReach ? applied([towed.seat]) : []
    case 'headwind':
      return foes.length > 0 ? applied(foes.map((one) => one.seat)) : []
    case 'swap': {
      const other = next?.tracked
      if (!next || !other || !there || distance > ITEM_TUNING.swapReach) return []
      // Only on the same lap: the laps the room has counted stay right for both
      if (lapsDone(other.crossings) !== lapsDone(own.crossings)) return []
      const warps: Warp[] = [
        {
          seat,
          x: there.x,
          z: there.z,
          heading: there.heading,
          nextGate: other.nextGate,
          crossings: other.crossings,
        },
        {
          seat: next.seat,
          x: last.x,
          z: last.z,
          heading: last.heading,
          nextGate: own.nextGate,
          crossings: own.crossings,
        },
      ]
      const actions = applied([next.seat], warps)
      const action = actions[0]
      // Not stopped by a shield: the server lets each kart jump to where it was sent
      if (action?.t === 'use') {
        for (const warp of action.warps) {
          const one = memory.tracked.get(warp.seat)
          if (one) memory.tracked.set(warp.seat, { ...one, warp })
        }
      }
      return actions
    }
    case 'hail':
      return thrown(throwHail(state.used, thrower, now, courseOf(track).walls))
    case 'puddle':
      return thrown(dropPuddle(state.used, thrower, now))
    case 'cloud':
      if (!next || !there || distance > SHOT_TUNING.cloudReach) return []
      return thrown(sendCloud(state.used, thrower, next.seat, distance, now), [next.seat])
  }
}
