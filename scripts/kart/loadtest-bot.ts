// e9-t11: one bot racer for the kart load test (scripts/kart-loadtest.ts). It speaks the room's real
// protocol over a WebSocket, as a browser does (shared/protocol.ts, shared/kart/net.ts): joins, sits,
// picks a kart, says it has loaded, keeps the room's clock, simulates its own kart with the game's
// physics and the careful `?autopilot` driver (src/kart/race/autopilot.ts), sends a frame every
// third step, takes boxes and uses items as src/kart/race/netRace.ts does, and counts everything it
// sends and receives (scripts/kart/loadtest-report.ts). No drawing, no bumping into other karts.
import { applyPatch, type JsonValue, type PatchOp } from '../../shared/patch.ts'
import {
  CLOCK_ANSWER_BYTES,
  CLOCK_FRAME,
  CLOCK_PING_BYTES,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import {
  clockOffset,
  encodeFrame,
  readRelayed,
  SEND_EVERY_STEPS,
  type ClockSample,
  type KartFrame,
} from '../../shared/kart/net.ts'
import {
  KART_TUNING,
  kartBoosting,
  kartSkidding,
  kartSlip,
  STEP_SECONDS,
  type KartInput,
  type KartTuning,
} from '../../shared/kart/physics.ts'
import { encodeItemFrame, ITEM_TUNING, itemBoxes, type ItemFrame } from '../../shared/kart/items.ts'
import {
  boostKart,
  headwindStep,
  stunStep,
  towStep,
  warpRun,
} from '../../shared/kart/itemEffects.ts'
import { SHOT_TUNING } from '../../shared/kart/shots.ts'
import {
  gridSpot,
  judgeFrame,
  speedCapFor,
  startTracking,
  type Tracked,
} from '../../shared/kart/race.ts'
import {
  COUNTDOWN_SECONDS,
  resetTrial,
  startTrial,
  stepTrial,
  type Trial,
  type TrialCourse,
} from '../../shared/kart/timeTrial.ts'
import { courseOf, type Track } from '../../shared/kart/track.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { applyKart, loadoutByte, lookOf, type DriverId, type KartId } from '../../shared/kart/karts.ts'
import type { KartView } from '../../shared/games/kart/types.ts'
import { autopilot } from '../../src/kart/race/autopilot.ts'
import { count, emptyTraffic, since, type BotTally, type DownTraffic, type UpTraffic } from './loadtest-report.ts'

/** Clock pings as netRace.ts sends them: a quick few, then one every 2 s; the best of 10 wins */
const FIRST_PINGS = 5
const FIRST_PING_GAP_MS = 250
const PING_EVERY_MS = 2_000
const KEEP_SAMPLES = 10
/** A pickup or use is not asked again for this long while the room answers (netRace.ts) */
const ITEM_WAIT_MS = 700
/** Stopped this long while racing: reset, as a person would press the key */
const STUCK_SECONDS = 4
const STUCK_SPEED = 1.5
/** A box this close ahead, and no more than this far off the nose, is worth steering for */
const SEEK_BOX_REACH = 30
const SEEK_BOX_ANGLE = 0.5

const wrapAngle = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

/** What every bot of a run shares: when each frame left, and who has seen it */
export interface Ledger {
  /** seat × 65536 + seq → when it was sent (performance.now) and how many others received it */
  readonly frames: Map<number, { at: number; seen: number; judged: boolean; why: string | null }>
  /** Stop counting frames as judged from this moment (the race is over, or about to be) */
  closedAt: number | null
}

export const newLedger = (): Ledger => ({ frames: new Map(), closedAt: null })

const key = (seat: number, seq: number) => seat * 65_536 + (seq & 0xffff)

const wrap = <T>(fn: () => T): T | null => {
  try {
    return fn()
  } catch {
    return null
  }
}

export interface BotOptions {
  readonly name: string
  readonly url: string
  readonly room: string
  readonly kart: KartId
  readonly driver: DriverId
  readonly ledger: Ledger
  readonly log?: (line: string) => void
}

export class Bot {
  readonly name: string
  readonly look: string
  ws: WebSocket | null = null
  view: RoomView | null = null
  you: string | null = null
  token: string | null = null
  rev = 0
  closed = false
  closeCode: number | null = null

  private readonly options: BotOptions
  private readonly tuning: KartTuning
  private readonly body: number
  private readonly up: UpTraffic = { frame: emptyTraffic(), item: emptyTraffic(), clock: emptyTraffic(), json: emptyTraffic() }
  private readonly down: DownTraffic = { relay: emptyTraffic(), clock: emptyTraffic(), json: emptyTraffic() }
  /** Copies of the counters at GO and at the race's end */
  private atGo: { up: UpTraffic; down: DownTraffic } | null = null
  private atEnd: { up: UpTraffic; down: DownTraffic } | null = null
  private readonly samples: ClockSample[] = []
  private offset: number | null = null
  private readonly rttMs: number[] = []
  private readonly relayMs: number[] = []
  private readonly tickMs: number[] = []
  private readonly sentKeys: number[] = []
  private timers: ReturnType<typeof setTimeout>[] = []

  // The race
  private track: Track | null = null
  private course: TrialCourse | null = null
  private trial: Trial | null = null
  private slot = 0
  private seat = -1
  private steps = 0
  private seq = 0
  private accumulator = 0
  private lastTick: number | null = null
  private stuckSeconds = 0
  private loadedSent = false
  private judged: Tracked | null = null
  /** The newest frame of every other kart, for a tow */
  private readonly others = new Map<number, KartFrame>()
  // Items, as netRace.ts
  private asked = new Map<number, number>()
  private pickupWait = 0
  private useWait = 0
  private itemHeld = false
  private seen = 0
  private towUntil = 0
  private towSeat: number | null = null
  private headwindUntil = 0
  private stunUntil = 0
  private pickups = 0
  private uses = 0
  private got = 0
  private lastItem: string | null = null

  constructor(options: BotOptions) {
    this.options = options
    this.name = options.name
    this.look = lookOf(options.kart, options.driver)
    this.tuning = applyKart(KART_TUNING, options.kart)
    this.body = loadoutByte(options.kart, options.driver)
  }

  private log(line: string) {
    this.options.log?.(`[${this.name}] ${line}`)
  }

  // ── The socket ─────────────────────────────────────────────────────────────────────────────

  /** Opens the socket and joins; resolves on `welcome` */
  connect(): Promise<void> {
    const base = new URL(this.options.url)
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
    base.pathname = `/ws/${this.options.room}`
    base.search = `?v=${PROTOCOL_VERSION}`
    const ws = new WebSocket(base.toString())
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.closed = false
    return new Promise((resolve, reject) => {
      let welcomed = false
      ws.addEventListener('open', () => {
        this.sendJson({ t: 'join', name: this.name, token: this.token })
      })
      ws.addEventListener('message', (event) => {
        const data = event.data as ArrayBuffer | string
        if (typeof data === 'string') {
          this.count(this.down.json, Buffer.byteLength(data), false)
          if (data === HEARTBEAT_PONG) return
          const message = wrap(() => JSON.parse(data) as ServerMessage)
          if (!message) return
          this.onMessage(message)
          if (message.t === 'welcome' && !welcomed) {
            welcomed = true
            resolve()
          }
          return
        }
        this.onBinary(new Uint8Array(data))
      })
      ws.addEventListener('close', (event) => {
        this.closed = true
        this.closeCode = event.code
        if (!welcomed) reject(new Error(`${this.name}: closed ${event.code} before welcome`))
      })
      ws.addEventListener('error', () => {
        if (!welcomed) reject(new Error(`${this.name}: socket error before welcome`))
      })
    })
  }

  private count(traffic: ReturnType<typeof emptyTraffic>, bytes: number, fromClient: boolean) {
    count(traffic, bytes, fromClient)
  }

  sendJson(message: ClientMessage | typeof HEARTBEAT_PING): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const text = typeof message === 'string' ? message : JSON.stringify(message)
    this.count(this.up.json, Buffer.byteLength(text), true)
    this.ws.send(text)
  }

  private sendBinary(bytes: Uint8Array, traffic: ReturnType<typeof emptyTraffic>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.count(traffic, bytes.byteLength, true)
    this.ws.send(bytes)
    return true
  }

  private onMessage(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome':
        this.you = message.you
        this.token = message.token
        this.rev = message.rev
        this.view = message.state
        this.startClock()
        return
      case 'snapshot':
        this.rev = message.rev
        this.view = message.state
        return
      case 'patch':
        if (!this.view) return
        if (message.rev !== this.rev + 1) {
          this.sendJson({ t: 'resync' })
          return
        }
        this.rev = message.rev
        this.view = applyPatch(this.view as unknown as JsonValue, message.ops as PatchOp[]) as unknown as RoomView
        this.afterPatch()
        return
      case 'error':
        this.log(`error ${message.code}${message.code === 'game_error' ? ` ${JSON.stringify(message.error)}` : ''}`)
        return
      default:
        return
    }
  }

  private onBinary(bytes: Uint8Array): void {
    const now = performance.now()
    if (bytes.byteLength === CLOCK_ANSWER_BYTES && bytes[0] === CLOCK_FRAME) {
      this.count(this.down.clock, bytes.byteLength, false)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const sample: ClockSample = {
        sent: view.getFloat64(1, true),
        received: now,
        server: view.getFloat64(CLOCK_PING_BYTES, true),
      }
      this.rttMs.push(sample.received - sample.sent)
      this.samples.push(sample)
      if (this.samples.length > KEEP_SAMPLES) this.samples.shift()
      this.offset = clockOffset(this.samples)
      return
    }
    const relayed = readRelayed(bytes)
    if (!relayed) return
    this.count(this.down.relay, bytes.byteLength, false)
    this.others.set(relayed.seat, relayed.frame)
    const entry = this.options.ledger.frames.get(key(relayed.seat, relayed.frame.seq))
    if (entry) {
      entry.seen++
      this.relayMs.push(now - entry.at)
    }
    const game = this.game()
    // A finished kart's tick stands still (timeTrial.ts), so only frames of karts still racing
    if (game?.goAt && this.offset !== null && relayed.frame.tick > 0 && !relayed.frame.finished) {
      this.tickMs.push(now + this.offset - (game.goAt + (relayed.frame.tick * 1000) / 60))
    }
  }

  private startClock(): void {
    this.stopTimers()
    const ping = () => {
      const bytes = new Uint8Array(CLOCK_PING_BYTES)
      bytes[0] = CLOCK_FRAME
      new DataView(bytes.buffer).setFloat64(1, performance.now(), true)
      this.sendBinary(bytes, this.up.clock)
    }
    for (let i = 0; i < FIRST_PINGS; i++) this.timers.push(setTimeout(ping, i * FIRST_PING_GAP_MS))
    this.timers.push(setInterval(ping, PING_EVERY_MS))
    this.timers.push(setInterval(() => this.sendJson(HEARTBEAT_PING), HEARTBEAT_INTERVAL_MS))
  }

  private stopTimers(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
  }

  close(): void {
    this.stopTimers()
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close(1000, 'done')
  }

  // ── The room ───────────────────────────────────────────────────────────────────────────────

  me() {
    return this.you && this.view ? this.view.members[this.you] : undefined
  }

  game(): KartView | null {
    return (this.view?.game?.view as KartView | undefined) ?? null
  }

  serverNow(): number | null {
    return this.offset === null ? null : performance.now() + this.offset
  }

  /** The room's view changed: say the track is loaded, and see what item this kart holds */
  private afterPatch(): void {
    const game = this.game()
    if (!game) return
    const me = this.me()
    if (me?.seat === null || me?.seat === undefined) return
    if (game.phase === 'loading' && !this.loadedSent) {
      this.loadedSent = true
      this.sendJson({ t: 'action', action: { t: 'loaded' } })
    }
    const racer = game.racers.find((one) => one.seat === me.seat)
    const item = racer?.item ?? null
    if (item !== null && item !== this.lastItem) this.got++
    this.lastItem = item
  }

  /** The race this bot is in, once the room has a game: its track, grid place and course */
  private ensureRace(game: KartView): boolean {
    if (this.trial) return true
    const me = this.me()
    if (me?.seat === null || me?.seat === undefined) return false
    const track = raceTrack(game.track)
    if (!track) return false
    this.seat = me.seat
    this.slot = Math.max(
      0,
      game.racers.findIndex((racer) => racer.seat === me.seat),
    )
    const plain = courseOf(track)
    this.track = track
    this.course = {
      ...plain,
      start: gridSpot(track, this.slot),
      checkpoints: { ...plain.checkpoints!, laps: game.laps },
      road: track.road,
    }
    this.trial = startTrial(this.course)
    this.judged = startTracking(track, this.slot)
    this.seen = game.used
    // A game that had begun before this view: its loaded flag may already be set
    this.afterPatch()
    return true
  }

  // ── Driving ────────────────────────────────────────────────────────────────────────────────

  /** Runs the physics up to now, as a browser's frame loop does (60 steps a second of real time) */
  tick(now: number): void {
    const game = this.game()
    if (!game || this.closed || this.view?.room.status !== 'playing') {
      this.lastTick = now
      return
    }
    if (!this.ensureRace(game)) return
    const elapsed = this.lastTick === null ? 0 : Math.min(0.25, (now - this.lastTick) / 1000)
    this.lastTick = now
    this.accumulator += elapsed
    while (this.accumulator >= STEP_SECONDS) {
      this.accumulator -= STEP_SECONDS
      this.step(game)
    }
  }

  private step(game: KartView): void {
    const course = this.course!
    let trial = this.trial!
    const input = this.seekBox(trial, autopilot(trial, course.road), game)
    if (trial.phase === 'countdown') {
      const server = this.serverNow()
      const left = game.goAt === null || server === null ? null : (game.goAt - server) / 1000
      trial = {
        ...trial,
        countdown: left === null ? COUNTDOWN_SECONDS + 1 : Math.min(left, COUNTDOWN_SECONDS),
      }
    }
    const resetsBefore = trial.run.resets
    trial = stepTrial(trial, input, course, this.tuning)
    if (trial.phase === 'racing') {
      const run = this.adjust(trial, input, game)
      if (run !== trial.run) trial = { ...trial, run }
      // Stuck against something: reset, as a person would
      const speed = Math.hypot(trial.run.kart.vx, trial.run.kart.vz)
      this.stuckSeconds = speed < STUCK_SPEED ? this.stuckSeconds + STEP_SECONDS : 0
      if (this.stuckSeconds >= STUCK_SECONDS) {
        trial = resetTrial(trial)
        this.stuckSeconds = 0
      }
    }
    this.trial = trial
    this.steps++
    const reset = trial.run.resets > resetsBefore
    if (reset || this.steps % SEND_EVERY_STEPS === 0) this.send(trial, input, reset, game)
  }

  /**
   * The autopilot keeps to the middle of the road, where an item track (N2) has few boxes: with
   * nothing held, a bot steers for a box that is there and close ahead, as a person would
   */
  private seekBox(trial: Trial, input: KartInput, game: KartView): KartInput {
    if (trial.phase !== 'racing' || game.mode !== 'items' || !this.track) return input
    const racer = game.racers.find((one) => one.seat === this.seat)
    if (!racer || racer.item !== null) return input
    const server = this.serverNow() ?? Date.now()
    const now = performance.now()
    const { x, z, heading } = trial.run.kart
    let best: { turn: number; distance: number } | null = null
    itemBoxes(this.track).forEach((box, i) => {
      if ((game.boxes[i] ?? Infinity) > server || (this.asked.get(i) ?? 0) > now) return
      const distance = Math.hypot(box.x - x, box.z - z)
      if (distance > SEEK_BOX_REACH) return
      const turn = wrapAngle(Math.atan2(box.x - x, -(box.z - z)) - heading)
      if (Math.abs(turn) > SEEK_BOX_ANGLE) return
      if (!best || distance < best.distance) best = { turn, distance }
    })
    const target = best as { turn: number; distance: number } | null
    if (!target) return input
    return { ...input, steer: Math.max(-1, Math.min(1, target.turn * 3)) }
  }

  private send(trial: Trial, input: KartInput, reset: boolean, game: KartView): void {
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
      body: this.body,
      crossings: trial.run.crossings,
      nextGate: trial.run.nextGate,
      seq: this.seq++,
    }
    const now = performance.now()
    // Judged by the room (and so counted) while the race runs and this kart is still in it
    const racer = game.racers.find((one) => one.seat === this.seat)
    const ledger = this.options.ledger
    const judged =
      (game.phase === 'countdown' || game.phase === 'racing') &&
      racer !== undefined &&
      racer.finishMs === null &&
      !racer.out &&
      ledger.closedAt === null
    let why: string | null = null
    if (judged && this.judged && this.track) {
      // The room's own judgement, run here with the time the frame should reach it
      const server = this.serverNow()
      const rtt = this.rttMs.length ? Math.min(...this.rttMs.slice(-KEEP_SAMPLES)) : 0
      const verdict = judgeFrame(this.judged, frame, {
        track: this.track,
        slot: this.slot,
        now: (server ?? Date.now()) + rtt / 2,
        goAt: game.goAt,
        laps: racer!.lapMs.length,
        speedCap: speedCapFor(this.options.kart),
      })
      this.judged = verdict.tracked
      if (verdict.kind === 'refused') why = verdict.why
    }
    if (!this.sendBinary(encodeFrame(frame), this.up.frame)) return
    const id = key(this.seat, frame.seq)
    ledger.frames.set(id, { at: now, seen: 0, judged, why })
    if (judged) this.sentKeys.push(id)
  }

  /** Items, as netRace.ts's `adjust`: events applied, boxes taken, the held item used */
  private adjust(trial: Trial, input: KartInput, game: KartView) {
    let run = trial.run
    if (game.mode !== 'items' || !this.track) return run
    for (const event of game.events) {
      if (event.n < this.seen) continue
      this.seen = event.n + 1
      const reached = event.targets.includes(this.seat) && !event.blocked.includes(this.seat)
      if (event.hit) {
        if (reached && (event.item === 'hail' || event.item === 'cloud' || event.item === 'puddle')) {
          this.stunUntil = event.at + SHOT_TUNING.stunMs[event.item]
          this.towUntil = 0
        }
        continue
      }
      if (event.by === this.seat) {
        if (event.item === 'boost') run = { ...run, kart: boostKart(run.kart) }
        if (event.item === 'tow') {
          this.towUntil = event.at + ITEM_TUNING.towMs
          this.towSeat = event.targets[0] ?? null
        }
      }
      if (reached && event.item === 'headwind') {
        this.headwindUntil = event.at + ITEM_TUNING.headwindMs
        this.towUntil = 0
      }
      const warp = event.warps.find((one) => one.seat === this.seat)
      if (warp) {
        run = warpRun(run, warp, this.track)
        this.towUntil = 0
        // The room expects this kart's next reset frame there (race.ts)
        if (this.judged) this.judged = { ...this.judged, warp }
      }
    }
    const now = performance.now()
    const racer = game.racers.find((one) => one.seat === this.seat)
    const holding = racer?.item ?? null
    const pressed = (input.item ?? false) && !this.itemHeld
    this.itemHeld = input.item ?? false
    const sendItem = (frame: ItemFrame) => this.sendBinary(encodeItemFrame(frame), this.up.item)
    if (pressed && holding && now >= this.useWait) {
      if (sendItem({ op: 'use', item: holding, tick: trial.steps })) this.uses++
      this.useWait = now + ITEM_WAIT_MS
    }
    const server = this.serverNow() ?? Date.now()
    if (!holding && now >= this.pickupWait) {
      const boxes = itemBoxes(this.track)
      const { x, z } = run.kart
      const index = boxes.findIndex(
        (box, i) =>
          (game.boxes[i] ?? Infinity) <= server &&
          (this.asked.get(i) ?? 0) <= now &&
          Math.hypot(box.x - x, box.z - z) <= ITEM_TUNING.boxTouch,
      )
      if (index >= 0) {
        if (sendItem({ op: 'pickup', box: index, tick: trial.steps })) this.pickups++
        this.asked.set(index, now + ITEM_WAIT_MS)
        this.pickupWait = now + ITEM_WAIT_MS
      }
    }
    const dt = STEP_SECONDS
    if (server < this.headwindUntil) run = { ...run, kart: headwindStep(run.kart, dt) }
    if (server < this.stunUntil) run = { ...run, kart: stunStep(run.kart, dt) }
    if (server < this.towUntil && this.towSeat !== null) {
      const target = this.others.get(this.towSeat)
      if (target) run = { ...run, kart: towStep(run.kart, target, dt) }
    }
    return run
  }

  // ── What it counted ────────────────────────────────────────────────────────────────────────

  tally(): BotTally {
    const game = this.game()
    const racer = game?.racers.find((one) => one.seat === this.seat)
    const ledger = this.options.ledger
    const seenBy: number[] = []
    const predicted: (string | null)[] = []
    const droppedWhy: (string | null)[] = []
    for (const id of this.sentKeys) {
      const entry = ledger.frames.get(id)
      if (!entry) continue
      seenBy.push(entry.seen)
      predicted.push(entry.why)
      if (entry.seen === 0) droppedWhy.push(entry.why)
    }
    return {
      name: this.name,
      seat: this.seat,
      look: this.look,
      up: this.up,
      down: this.down,
      raceUp: since(this.atEnd?.up ?? this.up, this.atGo?.up ?? this.up),
      raceDown: since(this.atEnd?.down ?? this.down, this.atGo?.down ?? this.down),
      relayMs: this.relayMs,
      tickMs: this.tickMs,
      rttMs: this.rttMs,
      offsetMs: this.offset,
      seenBy,
      predicted,
      droppedWhy,
      pickups: this.pickups,
      got: this.got,
      uses: this.uses,
      resets: this.trial?.run.resets ?? 0,
      ownLapsMs: (this.trial?.laps ?? []).map((steps) => (steps * 1000) / 60),
      serverLapsMs: racer?.lapMs ?? [],
      finishMs: racer?.finishMs ?? null,
      out: racer?.out ?? false,
    }
  }

  private copy() {
    return { up: structuredClone(this.up), down: structuredClone(this.down) }
  }

  /** The race's window: rates are counted from GO to its end */
  markGo(): void {
    this.atGo = this.copy()
  }

  markEnd(): void {
    this.atEnd = this.copy()
  }

  /** Forgets the frames sent after the race was closed (they were never going to be judged) */
  forgetAfter(at: number): void {
    const ledger = this.options.ledger
    this.sentKeys.splice(
      0,
      this.sentKeys.length,
      ...this.sentKeys.filter((id) => (ledger.frames.get(id)?.at ?? 0) < at),
    )
  }
}
