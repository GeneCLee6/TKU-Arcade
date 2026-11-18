// e9-t01, e9-t03, e9-t09: this browser's side of a race in a room (docs/KART-NETCODE.md). It keeps
// the room's clock (pings, shortest round trip wins), sends this kart's frame every third physics
// step, takes in everyone else's, and hands the race loop what it asks for (`SpikeNet`): the
// countdown to the room's GO, the other karts to draw and to bump into, and their name tags.
import {
  clockOffset,
  encodeFrame,
  readRelayed,
  SEND_EVERY_STEPS,
  type ClockSample,
  type KartFrame,
} from '../../../shared/kart/net.ts'
import {
  kartBoosting,
  kartSkidding,
  kartSlip,
  STEP_SECONDS,
  type KartInput,
} from '../../../shared/kart/physics.ts'
import type { Run } from '../../../shared/kart/course.ts'
import { encodeItemFrame, ITEM_TUNING, itemBoxes, type ItemId } from '../../../shared/kart/items.ts'
import {
  boostKart,
  headwindStep,
  stunStep,
  towStep,
  warpRun,
} from '../../../shared/kart/itemEffects.ts'
import {
  foreseeHit,
  SHOT_TUNING,
  shotLive,
  shotPosition,
  type Fix,
  type ShotItem,
} from '../../../shared/kart/shots.ts'
import { gridSpot, raceProgress } from '../../../shared/kart/race.ts'
import { foeShots } from '../../../shared/kart/team.ts'
import { createTeamRider } from '../../../shared/kart/teamRider.ts'
import type { Trial } from '../../../shared/kart/timeTrial.ts'
import type { Track } from '../../../shared/kart/track.ts'
import type { KartRacer, KartView } from '../../../shared/games/kart/types.ts'
import { CLOCK_ANSWER_BYTES, CLOCK_FRAME, CLOCK_PING_BYTES } from '../../../shared/protocol.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'
import {
  kartMass,
  loadoutByte,
  loadoutOfByte,
  type DriverId,
} from '../../../shared/kart/karts.ts'
import type { KartBody } from '../bodies.ts'
import type { OtherKart, ScreenPoint } from '../Scene.ts'
import { skidStrength } from '../feelFx.ts'
import {
  confirmsForeseen,
  createHitFeed,
  hitFrameOf,
  type Foreseen,
  type ItemCue,
} from '../hitFx.ts'
import type { SpikeNet } from '../spikeLoop.ts'
import { createRemotes, type RemotePose } from './remotes.ts'

/** Clock pings: a quick few at first, then one every PING_EVERY_MS */
const FIRST_PINGS = 5
const FIRST_PING_GAP_MS = 250
const PING_EVERY_MS = 2_000
/** Clock answers kept: the best of the recent ones wins */
const KEEP_SAMPLES = 10
/** A round trip slower than this, or no answer for this long, is an unstable connection */
export const SLOW_RTT_MS = 300
const SILENT_MS = 5_000
/** A connection is called unstable once it has looked so for this long */
const UNSTABLE_AFTER_MS = 1_500
/** Name tags float this high over a kart, metres */
const TAG_HEIGHT = 2.4

export interface NameTag {
  readonly seat: number
  readonly at: ScreenPoint
  /** Where the kart is on the track, for the minimap (2026-11-18) */
  readonly x: number
  readonly z: number
}

export interface RaceNetStatus {
  /** The last clock ping's round trip, ms; null before the first answer */
  readonly rtt: number | null
  /** The connection looks unstable: slow pings, silent pings, or karts gone quiet */
  readonly unstable: boolean
}

export interface RaceNet {
  readonly net: SpikeNet
  /** Where each other kart's name tag goes, every frame */
  onTags(listener: (tags: readonly NameTag[]) => void): void
  status(): RaceNetStatus
  /**
   * Seats in race order: finished first by the server's times, then those racing by how far round
   * they are (this kart by its own count, the others by their newest frames), then those out
   */
  order(racers: readonly KartRacer[]): number[]
  stop(): void
}

export interface RaceNetOptions {
  readonly realtime: RoomRealtime
  readonly track: Track
  readonly seat: number
  /** This kart's place in the race's list: its place on the grid */
  readonly slot: number
  readonly body: KartBody
  /** e10-t05b: who sits in it */
  readonly driver: DriverId
  /** The room's GO, by the server's clock (ms since the epoch); null until set */
  readonly goAt: () => number | null
  /** Laps in this race: the room's, not the track's own */
  readonly laps: number
  /** The room's view now (the items: the boxes, what this kart holds, the items used) */
  readonly view: () => KartView
  /** The item key pressed with `item` held, as the use goes to the room */
  readonly onItemPress?: (item: ItemId) => void
  /** #86: this browser foresaw a hit on its own kart, stunned for `ms` (the room still judges) */
  readonly onForeseenHit?: (item: ShotItem, ms: number) => void
}

/** Two of this kart's own steps further apart than this are not one straight path, ms */
const FORESEE_GAP_MS = 1_000
/** ...or further apart than this, m: a jump (a swap), not a drive */
const FORESEE_JUMP_M = 20

/** A pickup or a use sent is not sent again for this long while the room answers, ms */
const ITEM_WAIT_MS = 700

/** What tests can read */
export interface RaceDebug {
  seat: number
  offset: number | null
  rtt: number | null
  sent: number
  received: number
  /** Other karts with a recent frame */
  others: number
  countdown: number | null
  /** Whether this browser has counted down to the room's GO (a countdown was seen above zero) */
  counted: boolean
  /** This kart's own count: finish line crossings and the next gate */
  crossings: number
  nextGate: number
  /** Item frames sent: pickups and uses */
  pickups: number
  uses: number
  /** A team race: team boosts fired here and told to the room */
  teamFires: number
  /** #86: hits on this kart foreseen here, and of those the ones the room confirmed */
  foreseen: number
  confirmed: number
}

declare global {
  interface Window {
    __kartRace?: RaceDebug
  }
}

export function createRaceNet(options: RaceNetOptions): RaceNet {
  const { realtime, track, seat } = options
  const remotes = createRemotes()
  const samples: ClockSample[] = []
  let offset: number | null = null
  let lastRtt: number | null = null
  let lastAnswerAt = performance.now()
  let badSince: number | null = null
  let steps = 0
  let seq = 0
  let poses: RemotePose[] = []
  let tagListener: ((tags: readonly NameTag[]) => void) | null = null
  let own = { crossings: 0, nextGate: 0, x: 0, z: 0 }
  // e10-t05: the kart and driver in one byte; the room holds the frame to this kart's top speed
  const body = loadoutByte(options.body, options.driver)
  const debug: RaceDebug = {
    seat,
    offset: null,
    rtt: null,
    sent: 0,
    received: 0,
    others: 0,
    countdown: null,
    counted: false,
    crossings: 0,
    nextGate: 0,
    pickups: 0,
    uses: 0,
    teamFires: 0,
    foreseen: 0,
    confirmed: 0,
  }
  window.__kartRace = debug
  // The item race (e9-t05, e9-t06a)
  const boxes = itemBoxes(track)
  /** Boxes this kart has asked for, hidden here until the room answers (performance.now) */
  const asked = new Map<number, number>()
  let pickupWait = 0
  let useWait = 0
  let itemHeld = false
  let tick = 0
  /** Items used before this browser joined the race are not applied again */
  let seen = options.view().used
  let towUntil = 0
  let towSeat: number | null = null
  let headwindUntil = 0
  /** Hit by a shot (e9-t06b): stunned until then, by the server's clock */
  let stunUntil = 0
  // 2026-11-17: how the hits look and sound (hitFx.ts), from the same events
  const feed = createHitFeed(seat, seen)
  let lastHeld = options.view().racers.find((racer) => racer.seat === seat)?.item ?? null
  // #86: hits on this kart foreseen before the room's word: where it was last step, and the shots
  let lastFix: Fix | null = null
  let lastResets = -1
  const foreseenShots = new Set<number>()
  let foreseen: Foreseen[] = []
  // 2026-11-18, a team race: the team boosts this kart may fire, kept in step with the room
  const rider = createTeamRider(options.view().racers.find((racer) => racer.seat === seat))

  const pingClock = () => {
    const ping = new Uint8Array(CLOCK_PING_BYTES)
    ping[0] = CLOCK_FRAME
    new DataView(ping.buffer).setFloat64(1, performance.now(), true)
    realtime.send(ping)
  }
  const stopListening = realtime.listen((data) => {
    if (data.byteLength === CLOCK_ANSWER_BYTES && data[0] === CLOCK_FRAME) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const sample: ClockSample = {
        sent: view.getFloat64(1, true),
        received: performance.now(),
        server: view.getFloat64(CLOCK_PING_BYTES, true),
      }
      lastAnswerAt = sample.received
      lastRtt = sample.received - sample.sent
      debug.rtt = lastRtt
      samples.push(sample)
      if (samples.length > KEEP_SAMPLES) samples.shift()
      offset = clockOffset(samples)
      debug.offset = offset
      return
    }
    const relayed = readRelayed(data)
    if (!relayed || relayed.seat === seat) return
    debug.received++
    remotes.add(relayed.seat, relayed.frame, performance.now() / 1000)
  })
  const timers: ReturnType<typeof setTimeout>[] = []
  for (let i = 0; i < FIRST_PINGS; i++) {
    timers.push(setTimeout(() => pingClock(), i * FIRST_PING_GAP_MS))
  }
  const pinger = setInterval(() => pingClock(), PING_EVERY_MS)

  const serverNow = () => (offset === null ? null : performance.now() + offset)
  /** The server's clock, or this browser's before the first answer: the items' times need one */
  const roughNow = () => serverNow() ?? Date.now()

  /** The items used since the last step, applied to this kart */
  const applyEvents = (run: Run): Run => {
    const view = options.view()
    let next = run
    for (const event of view.events) {
      if (event.n < seen) continue
      seen = event.n + 1
      const reached = event.targets.includes(seat) && !event.blocked.includes(seat)
      // A shot that hit this kart (e9-t06b): stunned, and a tow let go
      if (event.hit) {
        if (
          reached &&
          (event.item === 'hail' || event.item === 'cloud' || event.item === 'puddle')
        ) {
          const confirmed = confirmsForeseen(event, seat, foreseen)
          if (confirmed >= 0) {
            // Stunned since it was foreseen
            foreseen = foreseen.filter((_, i) => i !== confirmed)
            debug.confirmed++
          } else {
            // #86: the whole stun from when this browser hears of it, as the spin shows it
            stunUntil = Math.max(stunUntil, roughNow() + SHOT_TUNING.stunMs[event.item])
          }
          towUntil = 0
        }
        continue
      }
      if (event.by === seat) {
        if (event.item === 'boost') next = { ...next, kart: boostKart(next.kart) }
        if (event.item === 'tow') {
          towUntil = event.at + ITEM_TUNING.towMs
          towSeat = event.targets[0] ?? null
        }
      }
      if (reached && event.item === 'headwind') {
        headwindUntil = event.at + ITEM_TUNING.headwindMs
        towUntil = 0
      }
      const warp = event.warps.find((one) => one.seat === seat)
      if (warp) {
        next = warpRun(next, warp, track)
        towUntil = 0
      }
    }
    return next
  }

  const sendItem = (frame: Parameters<typeof encodeItemFrame>[0]) =>
    realtime.send(encodeItemFrame(frame))

  /** A team race: a team boost just fired goes to the room, and the kart hears how many it has left */
  const teamStep = (run: Run, view: KartView): Run => {
    const held = rider.step(
      run.kart,
      view.racers.find((racer) => racer.seat === seat),
    )
    if (held.fired && sendItem({ op: 'team', tick })) debug.teamFires++
    return held.kart === run.kart ? run : { ...run, kart: held.kart }
  }

  const adjust = (start: Run, input: KartInput): Run => {
    const view = options.view()
    const run = view.teams ? teamStep(start, view) : start
    if (view.mode !== 'items') return run
    let next = applyEvents(run)
    const now = performance.now()
    const me = view.racers.find((racer) => racer.seat === seat)
    const holding = me?.item ?? null
    // The item key, once per press
    const pressed = (input.item ?? false) && !itemHeld
    itemHeld = input.item ?? false
    if (pressed && holding && now >= useWait) {
      if (sendItem({ op: 'use', item: holding, tick })) debug.uses++
      useWait = now + ITEM_WAIT_MS
      options.onItemPress?.(holding)
    }
    // A box driven through, while nothing is held
    if (!holding && now >= pickupWait) {
      const at = roughNow()
      const { x, z } = next.kart
      const index = boxes.findIndex(
        (box, i) =>
          (view.boxes[i] ?? Infinity) <= at &&
          (asked.get(i) ?? 0) <= now &&
          Math.hypot(box.x - x, box.z - z) <= ITEM_TUNING.boxTouch,
      )
      if (index >= 0) {
        if (sendItem({ op: 'pickup', box: index, tick })) debug.pickups++
        asked.set(index, now + ITEM_WAIT_MS)
        pickupWait = now + ITEM_WAIT_MS
      }
    }
    // #86: a shot this kart has just driven into, told at once rather than a round trip later
    const server = roughNow()
    if (offset !== null && view.phase === 'racing') {
      const to: Fix = { x: next.kart.x, z: next.kart.z, at: server }
      const from =
        lastFix &&
        next.resets === lastResets &&
        to.at - lastFix.at <= FORESEE_GAP_MS &&
        Math.hypot(to.x - lastFix.x, to.z - lastFix.z) <= FORESEE_JUMP_M
          ? lastFix
          : null
      lastFix = to
      lastResets = next.resets
      const shot = foreseeHit(
        // A team race: a team-mate's shot passes this kart by, as the room judges it
        foeShots(view.shots ?? [], seat, (one) =>
          view.teams ? view.racers.find((racer) => racer.seat === one)?.team : undefined,
        ),
        seat,
        from,
        to,
        me?.shieldUntil ?? 0,
        foreseenShots,
      )
      if (shot) {
        const ms = SHOT_TUNING.stunMs[shot.item]
        foreseenShots.add(shot.n)
        foreseen = [
          ...foreseen.filter((one) => server - one.at <= 3_000),
          { item: shot.item, at: server },
        ]
        stunUntil = Math.max(stunUntil, server + ms)
        towUntil = 0
        feed.foresee(shot.item, server)
        debug.foreseen++
        options.onForeseenHit?.(shot.item, ms)
      }
    }
    // What is on this kart now
    const dt = STEP_SECONDS
    if (server < headwindUntil) next = { ...next, kart: headwindStep(next.kart, dt) }
    if (server < stunUntil) next = { ...next, kart: stunStep(next.kart, dt) }
    if (server < towUntil && towSeat !== null) {
      const target = poses.find((pose) => pose.seat === towSeat && !pose.stale)
      if (target) next = { ...next, kart: towStep(next.kart, target, dt) }
    }
    return next
  }

  const send = (trial: Trial, input: KartInput, reset: boolean) => {
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
      body,
      crossings: trial.run.crossings,
      nextGate: trial.run.nextGate,
      seq: seq++,      // Off a jump (2026-11-17): the others draw it in the air
      ...((kart.air ?? 0) > 0 ? { airborne: true } : {}),
    }
    if (realtime.send(encodeFrame(frame))) debug.sent++
  }

  const net: SpikeNet = {
    start: gridSpot(track, options.slot),
    laps: options.laps,
    countdown() {
      const goAt = options.goAt()
      const now = serverNow()
      const left = goAt === null || now === null ? null : (goAt - now) / 1000
      debug.countdown = left
      if (left !== null && left > 0) debug.counted = true
      return left
    },
    afterStep(trial, input, reset) {
      steps++
      tick = trial.steps
      own = {
        crossings: trial.run.crossings,
        nextGate: trial.run.nextGate,
        x: trial.run.kart.x,
        z: trial.run.kart.z,
      }
      debug.crossings = own.crossings
      debug.nextGate = own.nextGate
      if (reset || steps % SEND_EVERY_STEPS === 0) send(trial, input, reset)
    },
    bumpers: () =>
      poses
        .filter((pose) => !pose.stale)
        .map((pose) => ({ ...pose, mass: kartMass(loadoutOfByte(pose.frame.body).kart) })),
    others() {
      poses = remotes.poses(performance.now() / 1000)
      debug.others = poses.filter((pose) => !pose.stale).length
      const view = options.view()
      const at = roughNow()
      // A team race: whose team boost burns now, by the room's word (their flames are blue)
      const burning = view.teams
        ? new Set(
            view.racers
              .filter((racer) => (racer.teamUntil ?? 0) > at)
              .map((racer) => racer.seat),
          )
        : null
      return poses.map((pose): OtherKart => {
        const { kart, driver } = loadoutOfByte(pose.frame.body)
        const forward = pose.vx * Math.sin(pose.heading) - pose.vz * Math.cos(pose.heading)
        const side = pose.vx * Math.cos(pose.heading) + pose.vz * Math.sin(pose.heading)
        return {
          id: pose.seat,
          x: pose.x,
          z: pose.z,
          heading: pose.heading,
          // A track with jumps (2026-11-17): in the air only when its frame says so
          airborne: pose.frame.airborne === true,
          body: kart,
          driver,
          look: {
            speed: forward,
            steer: pose.frame.steer,
            drift: pose.frame.driftDirection,
            boosting: pose.frame.boosting,
            ...(pose.frame.boosting && burning?.has(pose.seat) ? { tint: 'team' as const } : {}),
            // How hard its tyres slide (2026-11-17, feelFx.ts): its skid marks and smoke
            skid: skidStrength(
              Math.atan2(side, forward),
              Math.hypot(pose.vx, pose.vz),
              pose.frame.drifting || pose.frame.skidding,
            ),
          },
        }
      })
    },
    adjust,
    props(pose) {
      const view = options.view()
      if (view.mode !== 'items') return { boxes: [], shields: [], shots: [] }
      const at = roughNow()
      const now = performance.now()
      const shields = view.racers
        .filter((racer) => (racer.shieldUntil ?? 0) > at)
        .map((racer) => (racer.seat === seat ? pose : poses.find((one) => one.seat === racer.seat)))
        .filter((one): one is { x: number; z: number } & typeof pose => one !== undefined)
      return {
        boxes: boxes.map((box, i) => ({
          x: box.x,
          z: box.z,
          shown: (view.boxes[i] ?? Infinity) <= at && (asked.get(i) ?? 0) <= now,
        })),
        shields,
        // e9-t06b: the shots on the road; a cloud flies at its target as this browser sees it
        shots: (view.shots ?? [])
          .filter((shot) => shotLive(shot, at))
          .map((shot) => {
            const target =
              shot.target === null
                ? null
                : shot.target === seat
                  ? pose
                  : (poses.find((one) => one.seat === shot.target && !one.stale) ?? null)
            return { n: shot.n, item: shot.item, ...shotPosition(shot, at, target) }
          }),
      }
    },
    fx(pose) {
      const view = options.view()
      if (view.mode !== 'items') return null
      const now = roughNow()
      const read = feed.read(view.events, now)
      const cues: ItemCue[] = [...read.cues]
      const holding = view.racers.find((racer) => racer.seat === seat)?.item ?? null
      if (holding && !lastHeld) cues.unshift({ kind: 'pickup' })
      lastHeld = holding
      const where = (one: number) =>
        one === seat ? pose : poses.find((other) => other.seat === one && !other.stale)
      return { ...hitFrameOf(feed.effects, read.effects, now, where, seat), cues }
    },
    drawn(scene) {
      if (!tagListener) return
      const points = scene.project(poses.map((pose) => [pose.x, TAG_HEIGHT, pose.z] as const))
      tagListener(
        poses.map((pose, index) => ({
          seat: pose.seat,
          at: points[index] ?? null,
          x: pose.x,
          z: pose.z,
        })),
      )
    },
  }

  return {
    net,
    onTags(listener) {
      tagListener = listener
    },
    status() {
      const now = performance.now()
      const silent = now - lastAnswerAt > SILENT_MS
      const slow = lastRtt !== null && lastRtt > SLOW_RTT_MS
      const quiet = poses.some((pose) => pose.stale)
      // Only once it has lasted: one late ping or one gap in someone's frames is not worth a warning
      if (!(silent || slow || quiet)) badSince = null
      else badSince ??= now
      return { rtt: lastRtt, unstable: badSince !== null && now - badSince >= UNSTABLE_AFTER_MS }
    },
    order(racers) {
      const count = track.gates.length
      const latest = remotes.latest()
      const progress = (racer: KartRacer): number => {
        if (racer.seat === seat)
          return raceProgress(track, own.crossings, own.nextGate, own.x, own.z)
        const frame = latest.get(racer.seat)
        if (!frame || frame.nextGate >= count) return racer.lapMs.length * count
        return raceProgress(track, frame.crossings, frame.nextGate, frame.x, frame.z)
      }
      const finished = racers
        .filter((racer) => racer.finishMs !== null)
        .sort((a, b) => (a.finishMs as number) - (b.finishMs as number))
      const racing = racers
        .filter((racer) => racer.finishMs === null && !racer.out)
        .map((racer) => ({ racer, at: progress(racer) }))
        .sort((a, b) => b.at - a.at)
        .map(({ racer }) => racer)
      const out = racers.filter((racer) => racer.finishMs === null && racer.out)
      return [...finished, ...racing, ...out].map((racer) => racer.seat)
    },
    stop() {
      stopListening()
      for (const timer of timers) clearTimeout(timer)
      clearInterval(pinger)
      tagListener = null
    },
  }
}
