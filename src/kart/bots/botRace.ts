// The computer opponents of a race against the computer (owner 2026-11-17; docs/ARCHITECTURE.md
// §4.20). Each bot is a kart simulated here exactly as a player's browser simulates its own: the time
// trial's steps (shared/kart/timeTrial.ts) with its kart's numbers, counted down to the room's GO,
// pushed out of the other karts, the items' effects applied (effects.ts), its frames sent to the
// room every third step. Its hands are brain.ts's; when to use an item, itemSense.ts's. The room is
// localRoom.ts (the race room's own rules, in this browser) or, for computer karts in a race room,
// the room itself through the host's socket (roomBots.ts, §4.21). Time is given (`advance(now)`), so
// the tests run a whole race in a moment and the page runs it on the clock (the room's, online).
import type { KartAction, KartState as RoomState } from '../../../shared/games/kart/types.ts'
import type { Course } from '../../../shared/kart/course.ts'
import { encodeItemFrame, ITEM_TUNING, itemBoxes, type ItemId } from '../../../shared/kart/items.ts'
import { applyKart, kartMass, loadoutByte } from '../../../shared/kart/karts.ts'
import {
  encodeFrame,
  readRelayed,
  SEND_EVERY_STEPS,
  type KartFrame,
} from '../../../shared/kart/net.ts'
import {
  DEFAULT_RULES,
  KART_TUNING,
  kartBoosting,
  kartSkidding,
  kartSlip,
  STEP_SECONDS,
  type KartInput,
} from '../../../shared/kart/physics.ts'
import { bumpKart, gridSpot, lapsDone, raceProgress } from '../../../shared/kart/race.ts'
import { shotLive, shotPosition } from '../../../shared/kart/shots.ts'
import {
  COUNTDOWN_SECONDS,
  nearestRoadPoint,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
} from '../../../shared/kart/timeTrial.ts'
import { courseOf, roadDirection, type Track } from '../../../shared/kart/track.ts'
import { createBotBrain, pointAhead, type BotBrain } from './brain.ts'
import { createItemRider, type ItemRider } from './effects.ts'
import { wantsToUse } from './itemSense.ts'
import type { BotEntry } from './roster.ts'
import { bandedShare, BOT_SKILLS, type BotSkill, type Difficulty } from './skill.ts'

const STEP_MS = STEP_SECONDS * 1000
/** Behind the clock by more than this (a hidden tab), the bots skip ahead instead of catching up */
const MAX_BEHIND_MS = 250
/** An item frame sent is not sent again for this long while the room answers, ms (as netRace.ts) */
const ITEM_WAIT_MS = 700
/** How far ahead the road is checked for a straight, metres, and how little it may turn, radians */
const STRAIGHT_METRES = 70
const STRAIGHT_TURN = 0.3
/** A hailstone this close and closing counts as coming at a kart, metres */
const HAIL_THREAT = 45

const wrap = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

/** One bot as the race runs it */
interface Bot {
  readonly seat: number
  readonly entry: BotEntry
  readonly skill: BotSkill
  readonly course: TrialCourse
  readonly brain: BotBrain
  readonly rider: ItemRider
  readonly mass: number
  readonly body: number
  readonly rng: () => number
  trial: Trial
  steps: number
  seq: number
  held: { item: ItemId; since: number; wait: number } | null
  pickupWait: number
  useWait: number
  /** Item frames sent: pickups and uses (for the tests) */
  pickups: number
  uses: number
}

/** What the tests and the page can read of a bot */
export interface BotStatus {
  readonly seat: number
  readonly trial: Trial
  readonly pickups: number
  readonly uses: number
}

export interface BotRace {
  /** Runs the bots up to `now` (ms, the room's clock), then the room's timers */
  advance(now: number): void
  bots(): readonly BotStatus[]
  stop(): void
}

/**
 * What the bots need of a room: localRoom.ts in this browser, or a race room through the host's
 * socket (roomBots.ts). `state` is the room's as it is now (a view of it will do: nothing is hidden)
 */
export interface BotRoom {
  state(): RoomState
  /** An action from a bot's seat (its `loaded`) */
  act(action: KartAction, seat: number): void
  /** A bot's frame, or an item frame, at the room's time `now` */
  frame(seat: number, data: Uint8Array, now: number): void
  /** The room's timers up to `now`: in this browser only */
  tick(now: number): void
  /** Every frame the room passes on, the seat first (net.ts `readRelayed`) */
  listen(listener: (data: Uint8Array) => void): () => void
}

/** One bot: its seat, who it is, and how well it drives */
export interface BotSeat {
  readonly seat: number
  readonly entry: BotEntry
  readonly difficulty: Difficulty
}

export interface BotRaceOptions {
  readonly room: BotRoom
  readonly track: Track
  readonly laps: number
  readonly bots: readonly BotSeat[]
  /** The people's seats: to bump into, to aim at, and for the rubber band (none: bots alone) */
  readonly players: readonly number[]
  readonly seed: number
  /** The room's clock now: the bots start here */
  readonly now: number
  /**
   * Behind the clock by more than this (a hidden tab), the bots skip ahead instead of catching up,
   * ms. Online the host's tab may be hidden for a while, and the bots must keep up with the room
   */
  readonly maxBehindMs?: number
}

/** The race against the computer's bots: `entries` in seat order from `firstSeat`, all at one level */
export const botSeats = (
  entries: readonly BotEntry[],
  firstSeat: number,
  difficulty: Difficulty,
): BotSeat[] => entries.map((entry, index) => ({ seat: firstSeat + index, entry, difficulty }))

/** A small seeded generator for the bots' coin flips (mulberry32) */
function flips(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

export function createBotRace(options: BotRaceOptions): BotRace {
  const { room, track, laps, players } = options
  const plain: Course = courseOf(track)
  const boxes = itemBoxes(track)
  const gateCount = track.gates.length
  const bots: Bot[] = options.bots.map(({ seat, entry, difficulty }) => {
    const skill = BOT_SKILLS[difficulty]
    const course: TrialCourse = {
      ...plain,
      start: gridSpot(track, seat),
      checkpoints: { ...plain.checkpoints!, laps },
      road: track.road,
    }
    const tuning = applyKart(KART_TUNING, entry.kart)
    return {
      seat,
      entry,
      skill,
      course,
      brain: createBotBrain(skill, track.road, tuning, options.seed * 31 + seat, track.jumps),
      rider: createItemRider(seat, track, room.state().used),
      mass: kartMass(entry.kart),
      body: loadoutByte(entry.kart, entry.driver),
      rng: flips(options.seed * 17 + seat),
      trial: startTrial(course),
      steps: 0,
      seq: 0,
      held: null,
      pickupWait: 0,
      useWait: 0,
      pickups: 0,
      uses: 0,
    }
  })
  const tunings = new Map(bots.map((bot) => [bot.seat, applyKart(KART_TUNING, bot.entry.kart)]))

  // The people's karts, as their frames go through the room: to bump into, and for the rubber band
  const people = new Map<number, KartFrame>()
  const stopListening = room.listen((data) => {
    const relayed = readRelayed(data)
    if (relayed && players.includes(relayed.seat)) people.set(relayed.seat, relayed.frame)
  })

  // Every bot is on the grid at once (not again, should the race have gone on without them)
  const atStart = room.state()
  for (const bot of bots) {
    const racer = atStart.racers.find((one) => one.seat === bot.seat)
    if (atStart.phase === 'loading' && racer && !racer.loaded && !racer.out) {
      room.act({ t: 'loaded' }, bot.seat)
    }
  }

  let simAt = options.now
  const maxBehind = options.maxBehindMs ?? MAX_BEHIND_MS

  const progressOf = (seat: number): number | null => {
    const bot = bots.find((one) => one.seat === seat)
    if (bot) {
      const { run } = bot.trial
      return raceProgress(track, run.crossings, run.nextGate, run.kart.x, run.kart.z)
    }
    const person = people.get(seat)
    if (person && person.nextGate < gateCount) {
      return raceProgress(track, person.crossings, person.nextGate, person.x, person.z)
    }
    return null
  }

  /** How far round the people are on average, for the rubber band; null before any frame */
  const peopleProgress = (): number | null => {
    const known = players.map(progressOf).filter((one): one is number => one !== null)
    return known.length ? known.reduce((sum, one) => sum + one, 0) / known.length : null
  }

  /** Where every other kart is now, with its speed and mass */
  const othersOf = (seat: number) => {
    const others: { x: number; z: number; vx: number; vz: number; mass: number; seat: number }[] =
      []
    for (const bot of bots) {
      if (bot.seat === seat) continue
      const { kart } = bot.trial.run
      others.push({
        seat: bot.seat,
        x: kart.x,
        z: kart.z,
        vx: kart.vx,
        vz: kart.vz,
        mass: bot.mass,
      })
    }
    for (const [person, frame] of people) {
      others.push({ seat: person, x: frame.x, z: frame.z, vx: frame.vx, vz: frame.vz, mass: 1 })
    }
    return others
  }

  const sendFrame = (bot: Bot, input: KartInput, reset: boolean, at: number) => {
    const { trial } = bot
    const kart = trial.run.kart
    const frame: KartFrame = {
      tick: trial.phase === 'countdown' ? -Math.round(trial.countdown * 60) : trial.steps,
      x: kart.x,
      z: kart.z,
      heading: kart.heading,
      vx: kart.vx,
      vz: kart.vz,
      reset,
      drifting: kart.drifting,
      boosting: kartBoosting(kart),
      skidding: kartSkidding(kart),
      finished: trial.phase === 'finished',
      driftDirection:
        kart.driftDirection ||
        (kartSkidding(kart) ? (-Math.sign(kartSlip(kart)) as -1 | 0 | 1) : 0),
      steer: input.steer,
      body: bot.body,
      crossings: trial.run.crossings,
      nextGate: trial.run.nextGate,
      seq: bot.seq++ & 0xffff,
      ...((kart.air ?? 0) > 0 ? { airborne: true } : {}),
    }
    room.frame(bot.seat, encodeFrame(frame), at)
  }

  /** Picks up a box driven through, and uses the item held when the moment comes */
  const handleItems = (bot: Bot, state: RoomState, at: number) => {
    const me = state.racers.find((racer) => racer.seat === bot.seat)
    if (!me || me.finishMs !== null || me.out) return
    const { kart } = bot.trial.run
    const item = me.item ?? null
    if (!item) {
      bot.held = null
      if (at < bot.pickupWait) return
      const index = boxes.findIndex(
        (box, i) =>
          (state.boxes[i] ?? Infinity) <= at &&
          Math.hypot(box.x - kart.x, box.z - kart.z) <= ITEM_TUNING.boxTouch,
      )
      if (index >= 0) {
        room.frame(
          bot.seat,
          encodeItemFrame({ op: 'pickup', box: index, tick: bot.trial.steps }),
          at,
        )
        bot.pickups++
        bot.pickupWait = at + ITEM_WAIT_MS
      }
      return
    }
    if (!bot.held || bot.held.item !== item) {
      const [shortest, longest] = bot.skill.itemDelayMs
      bot.held = { item, since: at, wait: shortest + (longest - shortest) * bot.rng() }
    }
    // Once in a while is enough to decide
    if (at < bot.useWait || bot.trial.steps % 6 !== 0) return
    if (!wantsToUse(bot.skill.itemSense, situationOf(bot, state, item, at))) return
    room.frame(bot.seat, encodeItemFrame({ op: 'use', item, tick: bot.trial.steps }), at)
    bot.uses++
    bot.useWait = at + ITEM_WAIT_MS
  }

  const situationOf = (bot: Bot, state: RoomState, item: ItemId, at: number) => {
    const { run } = bot.trial
    const { kart } = run
    const mine = progressOf(bot.seat) ?? 0
    const racing = state.racers
      .filter((racer) => racer.seat !== bot.seat && racer.finishMs === null && !racer.out)
      .map((racer) => ({ seat: racer.seat, at: progressOf(racer.seat) }))
      .filter((one): one is { seat: number; at: number } => one.at !== null)
    const aheadOf = racing.filter((one) => one.at > mine).sort((a, b) => a.at - b.at)
    const behindOf = racing.filter((one) => one.at <= mine)
    const others = othersOf(bot.seat)
    const poseOf = (seat: number) => others.find((one) => one.seat === seat) ?? null
    const next = aheadOf[0] ? poseOf(aheadOf[0].seat) : null
    const crossingsOf = (seat: number) =>
      bots.find((one) => one.seat === seat)?.trial.run.crossings ?? people.get(seat)?.crossings ?? 0
    const behindDistances = behindOf
      .map((one) => poseOf(one.seat))
      .filter((one) => one !== null)
      .map((one) => Math.hypot(one.x - kart.x, one.z - kart.z))
    // The road a little way on: does it run straight?
    const nearest = nearestRoadPoint(track.road, kart.x, kart.z)
    const later = pointAhead(track.road, nearest, STRAIGHT_METRES)
    const here = roadDirection(track.road, nearest)
    const there = roadDirection(track.road, later.index)
    const turn = Math.abs(wrap(Math.atan2(there.dx, -there.dz) - Math.atan2(here.dx, -here.dz)))
    const threatened = (state.shots ?? []).some((shot) => {
      if (!shotLive(shot, at)) return false
      if (shot.item === 'cloud') return shot.target === bot.seat
      if (shot.item !== 'hail' || shot.by === bot.seat) return false
      const where = shotPosition(shot, at)
      const dx = kart.x - where.x
      const dz = kart.z - where.z
      return (
        Math.hypot(dx, dz) < HAIL_THREAT && dx * (shot.vx - kart.vx) + dz * (shot.vz - kart.vz) > 0
      )
    })
    return {
      item,
      heldMs: at - (bot.held?.since ?? at),
      waitMs: bot.held?.wait ?? 0,
      ahead:
        next && aheadOf[0]
          ? {
              distance: Math.hypot(next.x - kart.x, next.z - kart.z),
              angle: wrap(Math.atan2(next.x - kart.x, -(next.z - kart.z)) - kart.heading),
              sameLap: lapsDone(crossingsOf(aheadOf[0].seat)) === lapsDone(run.crossings),
            }
          : null,
      aheadCount: aheadOf.length,
      behind: behindDistances.length ? Math.min(...behindDistances) : null,
      straight: turn < STRAIGHT_TURN,
      threatened,
    }
  }

  const stepBot = (bot: Bot, state: RoomState, at: number) => {
    // Dropped out (online, when its host went): nothing more to drive
    if (state.racers.find((racer) => racer.seat === bot.seat)?.out) return
    let { trial } = bot
    if (trial.phase === 'countdown') {
      // Counted down to the room's GO, as a player's browser does; held on the grid until it is set
      const left = state.goAt === null ? null : (state.goAt - at) / 1000
      trial = {
        ...trial,
        countdown: left === null ? COUNTDOWN_SECONDS + 1 : Math.min(left, COUNTDOWN_SECONDS),
      }
    }
    // The rubber band: by how far it is from the people (on average), in laps
    const mine = progressOf(bot.seat)
    const theirs = peopleProgress()
    const lead = mine === null || theirs === null ? 0 : (mine - theirs) / gateCount
    const input = bot.brain(trial, { speedShare: bandedShare(bot.skill.topSpeedShare, lead) })
    const before = trial.run
    trial = stepTrial(trial, input, bot.course, tunings.get(bot.seat), DEFAULT_RULES)
    if (trial.phase !== 'countdown') {
      const bumped = bumpKart(trial.run.kart, othersOf(bot.seat), bot.mass)
      if (bumped.kart !== trial.run.kart)
        trial = { ...trial, run: { ...trial.run, kart: bumped.kart } }
    }
    if (state.mode === 'items' && trial.phase === 'racing') {
      const others = othersOf(bot.seat)
      const run = bot.rider.step(
        trial.run,
        state,
        at,
        (seat) => others.find((one) => one.seat === seat) ?? null,
      )
      if (run !== trial.run) trial = { ...trial, run }
    }
    bot.trial = trial
    bot.steps++
    const reset = trial.run.resets !== before.resets
    if (reset || bot.steps % SEND_EVERY_STEPS === 0) sendFrame(bot, input, reset, at)
    if (state.mode === 'items' && trial.phase === 'racing') handleItems(bot, room.state(), at)
  }

  return {
    advance(now) {
      if (now - simAt > maxBehind) simAt = now - maxBehind
      while (simAt + STEP_MS <= now) {
        simAt += STEP_MS
        room.tick(simAt)
        const state = room.state()
        if (state.phase === 'finished') continue
        if (state.phase === 'loading') continue
        for (const bot of bots) stepBot(bot, room.state(), simAt)
      }
      room.tick(now)
    },
    bots: () =>
      bots.map((bot) => ({
        seat: bot.seat,
        trial: bot.trial,
        pickups: bot.pickups,
        uses: bot.uses,
      })),
    stop() {
      stopListening()
    },
  }
}
