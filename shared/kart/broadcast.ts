// 2026-11-23 (owner: "esports, professional"): the race broadcast's director (docs/KART-NETCODE.md
// §11.6). Watching live or a replay with the broadcast on, nobody picks the kart or the camera: this
// does, as a TV director would. It looks at the race a few times a second and decides whom to show
// and from where: the leader by default; two karts fighting for a place; an overtake as it happens;
// a hit; a kart in the air off a jump; the final lap; the finish line. And it keeps a rhythm: a shot
// stays up at least MIN_HOLD (longer with less motion asked for), the leader's shots change every
// several seconds, and only something that matters more than what is on screen cuts away from it.
// With less motion asked for, only the steady shots: behind the kart and high above it.
//
// It also notices what the captions say ("Overtake!", "Hit", "Final lap", "Fastest lap", the finish)
// and keeps the gaps between the karts, as a timing screen does: each kart's time at each gate, the
// gap to the kart ahead the difference at the last gate both have passed.
//
// 2026-11-23 (NEXT §5, "the director only scores, it does not see what is coming: it cuts to an
// overtake 0.8 s after the swap"): it also looks ahead (`foresee`). Two karts in neighbouring places,
// the one behind closing (faster, or on the inside of the bend they are in, which is the shorter
// way round), a pass expected within PREDICT_HORIZON: a prediction, and the side shot of the chaser
// before the pass rather than after it. A prediction that does not come true in PREDICT_GRACE is let
// go gently: the chaser keeps a fading say for RETRACT_SECONDS, so that the camera eases back to
// the race instead of jumping away. A shot (an item in flight) closing on a kart within
// HIT_HORIZON: that kart, before the hit. Watching a replay, the future is known: the overtakes to
// come (highlights.ts foreseePasses) and the hits to come are exact, cut to PREDICT_LEAD before.
//
// Pure and deterministic, so that a stretch of a replay gives the same cuts every time (tested in
// tests/kart/broadcast.test.ts); src/kart/watch/broadcast/ runs it and draws what it says.
import { cameraFor, FINISH_REACH, type TracksideCamera } from './broadcastCameras.ts'

/** The camera's kinds of shot (src/kart/broadcastShots.ts places each) */
export type ShotKind = 'chase' | 'side' | 'low' | 'aerial' | 'trackside'

/** Why the director is on a kart */
export type CutReason =
  | 'leader'
  | 'battle'
  | 'overtake'
  | 'hit'
  | 'jump'
  | 'finalLap'
  | 'finish'
  /** 2026-11-23: an overtake foreseen, before it happens */
  | 'attack'
  /** 2026-11-23: a hit foreseen: a shot closing on the kart */
  | 'incoming'

/** One kart as the director sees it */
export interface BroadcastKart {
  readonly seat: number
  readonly x: number
  readonly z: number
  readonly heading: number
  /** Forward speed, m/s */
  readonly speed: number
  /** How far round the race, in gates passed (raceProgress); bigger is further */
  readonly progress: number
  readonly airborne: boolean
  /** Its finish time, ms from GO, once it has crossed the line for the last time */
  readonly finishMs: number | null
  readonly out: boolean
  /** Its laps done so far, ms each */
  readonly lapMs: readonly number[]
}

/** A hit landed (an item race): on `target`, by `by`, at race time `at`, seconds */
export interface BroadcastHit {
  readonly by: number
  readonly target: number
  readonly at: number
}

/** An item in flight (an item race), where it is now: `target` the kart it homes in on, if any */
export interface BroadcastShot {
  readonly n: number
  readonly by: number
  readonly target: number | null
  readonly x: number
  readonly z: number
}

/** An overtake known to come (a replay's future, highlights.ts foreseePasses): race time, seconds */
export interface ForeseenPass {
  readonly seat: number
  readonly other: number
  /** The moment the places swap */
  readonly at: number
}

/** The race at one moment */
export interface BroadcastMoment {
  /** Seconds from GO */
  readonly time: number
  /** The karts, in race order (the first leads) */
  readonly karts: readonly BroadcastKart[]
  readonly laps: number
  /** The track's gates: a lap is this much progress */
  readonly gates: number
  /** Every hit so far (older ones are ignored); a replay's, those to come too */
  readonly hits: readonly BroadcastHit[]
  /** The items in flight now (2026-11-23), for the hits foreseen live */
  readonly shots?: readonly BroadcastShot[]
}

/** A caption the director calls for */
export type Caption =
  | { readonly kind: 'overtake'; readonly seat: number; readonly other: number; readonly place: number }
  | { readonly kind: 'hit'; readonly seat: number; readonly other: number }
  | { readonly kind: 'finalLap'; readonly seat: number }
  | { readonly kind: 'fastestLap'; readonly seat: number; readonly ms: number }
  | { readonly kind: 'finish'; readonly seat: number; readonly place: number }

export interface DirectorOptions {
  readonly cameras: readonly TracksideCamera[]
  readonly reducedMotion: boolean
  /** A kart to favour (a highlight's), if any */
  readonly favour?: number | null
  /**
   * 2026-11-23, a replay: the future is known. The overtakes to come (foreseePasses), and `hits`
   * holds the hits to come as well: both are cut to PREDICT_LEAD (HIT_LEAD) before, with no guess
   */
  readonly foreseen?: readonly ForeseenPass[]
}

/** A pass the director expects: `seat` past `other`, made at race time `made`, due at `due` */
export interface Prediction {
  readonly seat: number
  readonly other: number
  readonly made: number
  readonly due: number
  /** A replay's, known to come (DirectorOptions.foreseen): it comes true when due */
  readonly exact?: true
}

/** How the predictions have done: made, come true, let go (for the tests and the curious) */
export interface Foresight {
  readonly made: number
  readonly came: number
  readonly missed: number
}

export interface DirectorState {
  readonly seat: number | null
  readonly shot: ShotKind
  readonly reason: CutReason
  /** Race time of the last cut, seconds */
  readonly since: number
  readonly cuts: number
  /** Race time last stepped */
  readonly time: number
  /** Each seat's place at the last step */
  readonly places: Readonly<Record<number, number>>
  readonly overtakes: readonly { readonly seat: number; readonly other: number; readonly at: number }[]
  /** Swaps of place not yet held long enough to be an overtake, and the passes of late */
  readonly pending: readonly { readonly seat: number; readonly other: number; readonly at: number }[]
  readonly passes: readonly { readonly seat: number; readonly other: number; readonly at: number }[]
  /** Hits already seen, by "at:by:target" */
  readonly hitsSeen: readonly string[]
  readonly finalLap: boolean
  readonly bestLapMs: number | null
  readonly lapsSeen: Readonly<Record<number, number>>
  readonly finished: readonly number[]
  /** Turns of the leader's shots, so that they go round */
  readonly turn: number
  /** 2026-11-23: each seat's heading at the last step (how fast it turns: the bend it is in) */
  readonly headings: Readonly<Record<number, number>>
  /**
   * Pairs closing for a pass ("seat:other"): since when, and the gap then (metres along), before
   * that is a prediction: the gap must really have shrunk meanwhile
   */
  readonly closing: Readonly<Record<string, { readonly since: number; readonly gap: number }>>
  readonly predictions: readonly Prediction[]
  /** Predictions let go, the chaser's say fading from `at` (and the pair not foreseen again a while) */
  readonly retracting: readonly { readonly seat: number; readonly other: number; readonly at: number }[]
  /** Each shot's place at the last step, to tell its speed */
  readonly shotsSeen: Readonly<Record<number, { readonly x: number; readonly z: number }>>
  readonly foresight: Foresight
}

/** A shot stays up at least this long, seconds (and this long with less motion asked for) */
export const MIN_HOLD = 2.6
export const MIN_HOLD_STEADY = 5
/** The leader's (or a fight's) shot changes after this long */
export const ROTATE_AFTER = 7
/** An overtake, a hit: worth a cut for this long after, seconds */
export const OVERTAKE_WINDOW = 2.5
export const HIT_WINDOW = 2
/** A kart just home stays on screen this long */
export const FINISH_WINDOW = 2.5
/** The last stretch before the line, in gates (the finish shot is up for it) */
export const FINISH_STRETCH = 0.35
/** Two karts this near (metres) in neighbouring places are fighting */
export const BATTLE_METRES = 14
/** A swap of places is an overtake once it has held this long, seconds */
export const CONFIRM_SECONDS = 0.8
/** The same two swapping back within this long is not a pass */
const ECHO_SECONDS = 4
/** The race's first seconds shuffle the places: no overtakes counted before this */
export const SETTLE_SECONDS = 4
/** A pass is foreseen this far ahead at the most, seconds ... */
export const PREDICT_HORIZON = 2.5
/** ... the pair closing at least this fast, m/s (speed and the inside of the bend together) ... */
export const PREDICT_CLOSING = 0.8
/** ... for at least this long, seconds, before it is a prediction (one frame's wobble is not) ... */
export const PREDICT_STEADY = 0.2
/** ... the gap meanwhile shrunk by at least this share of what that closing speed makes ... */
const PREDICT_SHRINK = 0.5
/** ... and the one behind at most this far back, metres */
export const PREDICT_METRES = 30
/** A prediction not come true this long after it was due is let go, seconds */
export const PREDICT_GRACE = 1.2
/** A pass counts as foreseen if the prediction was made at least this long before it, seconds */
export const PREDICT_EARLY = 0.5
/** A replay's overtakes and hits to come are cut to this long before, seconds */
export const PREDICT_LEAD = 2
export const HIT_LEAD = 1.2
/** A shot closing on a kart within this long, and passing this near it, is a hit foreseen */
export const HIT_HORIZON = 1.5
export const HIT_MISS_METRES = 3
/** A prediction let go keeps a fading say this long, seconds */
export const RETRACT_SECONDS = 1.5
/** Something foreseen may cut a shot up this long (MIN_HOLD otherwise; never with less motion) */
export const FORESEEN_HOLD = 1.2
/** A bend: the pair turning at least this fast, rad/s */
const BEND_TURN = 0.12
/** A highlight's kart gets this much more say */
const FAVOUR = 100
/** What is on screen gets this much more say, so that only something better cuts away */
export const STICKY = 15

/** How much each reason is worth (a fight more the closer it is) */
const WORTH: Readonly<Record<CutReason, number>> = {
  finish: 100,
  overtake: 80,
  hit: 75,
  incoming: 72,
  attack: 70,
  jump: 60,
  battle: 40,
  finalLap: 30,
  leader: 20,
}

/** The leader's shots go round these, and a fight's these */
const LEADER_SHOTS: readonly ShotKind[] = ['chase', 'aerial', 'side', 'trackside', 'chase', 'low']
const BATTLE_SHOTS: readonly ShotKind[] = ['chase', 'aerial', 'trackside', 'side']
const STEADY_SHOTS: readonly ShotKind[] = ['chase', 'aerial']

export function startDirector(): DirectorState {
  return {
    seat: null,
    shot: 'chase',
    reason: 'leader',
    since: -Infinity,
    cuts: 0,
    time: -Infinity,
    places: {},
    overtakes: [],
    pending: [],
    passes: [],
    hitsSeen: [],
    finalLap: false,
    bestLapMs: null,
    lapsSeen: {},
    finished: [],
    turn: 0,
    headings: {},
    closing: {},
    predictions: [],
    retracting: [],
    shotsSeen: {},
    foresight: { made: 0, came: 0, missed: 0 },
  }
}

interface Candidate {
  readonly seat: number
  readonly reason: CutReason
  readonly worth: number
  /** The shot this calls for; null: the reason's rotation */
  readonly shot: ShotKind | null
}

const hitKey = (hit: BroadcastHit) => `${hit.at.toFixed(2)}:${hit.by}:${hit.target}`

/** The captions, and the state's notes, for what changed since the last step */
function notice(
  state: DirectorState,
  moment: BroadcastMoment,
): { captions: Caption[]; next: Partial<DirectorState> } {
  const captions: Caption[] = []
  const places: Record<number, number> = {}
  moment.karts.forEach((kart, i) => {
    places[kart.seat] = i + 1
  })
  // Overtakes: a racer up a place on the one now just behind it, which was ahead before
  const overtakes = state.overtakes.filter((one) => moment.time - one.at < OVERTAKE_WINDOW)
  const pending = state.pending.filter((one) => moment.time - one.at < 2 * CONFIRM_SECONDS)
  const finished = [...state.finished]
  if (moment.time >= SETTLE_SECONDS && Number.isFinite(state.time)) {
    moment.karts.forEach((kart, i) => {
      const behind = moment.karts[i + 1]
      const was = state.places[kart.seat]
      const wasBehind = behind ? state.places[behind.seat] : undefined
      if (
        behind &&
        kart.finishMs === null &&
        behind.finishMs === null &&
        !kart.out &&
        !behind.out &&
        was !== undefined &&
        wasBehind !== undefined &&
        was > wasBehind
      ) {
        // Not the same two swapping back: a pass undone a moment ago is not a pass
        const echo = state.passes.some(
          (one) => one.seat === behind.seat && one.other === kart.seat && moment.time - one.at < ECHO_SECONDS,
        )
        // Nor taking back a place lost a moment ago, before that pass held
        const undone = pending.findIndex((one) => one.seat === behind.seat && one.other === kart.seat)
        if (undone >= 0) pending.splice(undone, 1)
        else if (!echo) pending.push({ seat: kart.seat, other: behind.seat, at: moment.time })
      }
    })
  }
  // A pass that has held CONFIRM_SECONDS is an overtake (two karts side by side swap places by a
  // hair, back and forth, before one of them really gets by)
  const passes = state.passes.filter((one) => moment.time - one.at < ECHO_SECONDS)
  for (const one of [...pending]) {
    if (moment.time - one.at < CONFIRM_SECONDS) continue
    pending.splice(pending.indexOf(one), 1)
    const place = places[one.seat]
    const other = places[one.other]
    if (place === undefined || other === undefined || place > other) continue
    if (moment.karts[place - 1]?.finishMs !== null) continue
    overtakes.push({ seat: one.seat, other: one.other, at: moment.time })
    passes.push(one)
    captions.push({ kind: 'overtake', seat: one.seat, other: one.other, place })
  }
  // Finishes, each once
  moment.karts.forEach((kart, i) => {
    if (kart.finishMs === null || finished.includes(kart.seat)) return
    finished.push(kart.seat)
    if (Number.isFinite(state.time)) captions.push({ kind: 'finish', seat: kart.seat, place: i + 1 })
  })
  // Hits, each once; those from before the director started only marked
  const hitsSeen = new Set(state.hitsSeen)
  for (const hit of moment.hits) {
    // A replay knows of hits to come: each is noticed when its moment comes
    if (hit.at > moment.time) continue
    const key = hitKey(hit)
    if (hitsSeen.has(key)) continue
    hitsSeen.add(key)
    if (Number.isFinite(state.time) && moment.time - hit.at < HIT_WINDOW) {
      captions.push({ kind: 'hit', seat: hit.target, other: hit.by })
    }
  }
  // The leader starts the final lap
  let finalLap = state.finalLap
  const leader = moment.karts[0]
  if (
    !finalLap &&
    leader &&
    moment.laps > 1 &&
    leader.finishMs === null &&
    leader.lapMs.length >= moment.laps - 1
  ) {
    finalLap = true
    if (Number.isFinite(state.time)) captions.push({ kind: 'finalLap', seat: leader.seat })
  }
  // A lap faster than any before it (not the race's first lap done: that one is trivially so)
  let bestLapMs = state.bestLapMs
  const lapsSeen: Record<number, number> = { ...state.lapsSeen }
  for (const kart of moment.karts) {
    const seen = lapsSeen[kart.seat] ?? 0
    for (let lap = seen; lap < kart.lapMs.length; lap++) {
      const ms = kart.lapMs[lap]!
      if (bestLapMs === null) bestLapMs = ms
      else if (ms < bestLapMs) {
        bestLapMs = ms
        if (Number.isFinite(state.time)) captions.push({ kind: 'fastestLap', seat: kart.seat, ms })
      }
    }
    lapsSeen[kart.seat] = kart.lapMs.length
  }
  return {
    captions,
    next: { places, overtakes, pending, passes, finished, hitsSeen: [...hitsSeen], finalLap, bestLapMs, lapsSeen },
  }
}

const wrapAngle = (angle: number): number => {
  let a = angle % (2 * Math.PI)
  if (a > Math.PI) a -= 2 * Math.PI
  if (a < -Math.PI) a += 2 * Math.PI
  return a
}

/**
 * When `behind` is expected to get past `ahead`, seconds from now, or null: how far it has to go to
 * be a metre past (along the way `ahead` faces), over how fast it closes. It closes by the
 * difference of their speeds, and in a bend by the inside line's shorter way round: a kart
 * `lateral` metres to the inside of another, both turning at `turn` rad/s, gains about lateral ×
 * turn m/s on it (an outside line loses as much)
 */
export function passIn(
  ahead: Pick<BroadcastKart, 'x' | 'z' | 'heading' | 'speed'>,
  behind: Pick<BroadcastKart, 'x' | 'z' | 'heading' | 'speed'>,
  turn: number,
): { seconds: number; gap: number } | null {
  const fx = Math.sin(ahead.heading)
  const fz = -Math.cos(ahead.heading)
  const dx = ahead.x - behind.x
  const dz = ahead.z - behind.z
  const along = dx * fx + dz * fz
  if (along > PREDICT_METRES || Math.hypot(dx, dz) > PREDICT_METRES) return null
  // The kart's right is (cos h, sin h), and a heading growing is a turn to the right: how far
  // right of the one ahead the one behind is, times the turn, is how far inside it is
  const lateral = -(dx * Math.cos(ahead.heading) + dz * Math.sin(ahead.heading))
  const inside = Math.abs(turn) >= BEND_TURN ? lateral * turn : 0
  const closing = behind.speed - ahead.speed + inside
  if (closing < PREDICT_CLOSING) return null
  const seconds = Math.max(0, along + 1) / closing
  return seconds <= PREDICT_HORIZON ? { seconds, gap: along } : null
}

/**
 * When the shot `shot` (now where it is, `seconds` ago at `was`) reaches `kart`, seconds from now,
 * or null: a shot homing in on that kart by how fast the gap closes, any other by its nearest pass
 * of the kart, which must come within HIT_MISS_METRES
 */
export function shotReaches(
  shot: Pick<BroadcastShot, 'x' | 'z' | 'target'>,
  was: { readonly x: number; readonly z: number },
  seconds: number,
  kart: Pick<BroadcastKart, 'seat' | 'x' | 'z' | 'heading' | 'speed'>,
): number | null {
  if (!(seconds > 0)) return null
  const svx = (shot.x - was.x) / seconds
  const svz = (shot.z - was.z) / seconds
  const kvx = Math.sin(kart.heading) * kart.speed
  const kvz = -Math.cos(kart.heading) * kart.speed
  const rx = kart.x - shot.x
  const rz = kart.z - shot.z
  const vx = svx - kvx
  const vz = svz - kvz
  const distance = Math.hypot(rx, rz)
  if (shot.target === kart.seat) {
    const closing = (rx * vx + rz * vz) / Math.max(1e-6, distance)
    if (closing <= 0) return distance <= HIT_MISS_METRES ? 0 : null
    const at = Math.max(0, distance - HIT_MISS_METRES / 2) / closing
    return at <= HIT_HORIZON ? at : null
  }
  const speedSq = vx * vx + vz * vz
  if (speedSq < 1e-6) return null
  const at = (rx * vx + rz * vz) / speedSq
  if (at < 0 || at > HIT_HORIZON) return null
  return Math.hypot(rx - vx * at, rz - vz * at) <= HIT_MISS_METRES ? at : null
}

/**
 * What the director sees coming (2026-11-23): the passes foreseen (a replay's, exact; live, from
 * the pairs closing in), how the earlier ones turned out, and the hits foreseen. The state's notes
 * for it, and the candidates it makes
 */
function foresee(
  state: DirectorState,
  previous: DirectorState,
  moment: BroadcastMoment,
  options: DirectorOptions,
): { next: Partial<DirectorState>; list: Candidate[] } {
  const list: Candidate[] = []
  const time = moment.time
  const step = Number.isFinite(previous.time) ? time - previous.time : 0
  const racing = (kart: BroadcastKart) => kart.finishMs === null && !kart.out
  const placeOf = (seat: number) => moment.karts.findIndex((kart) => kart.seat === seat)
  let { made, came, missed } = state.foresight
  const retracting = state.retracting.filter((one) => time - one.at < ECHO_SECONDS)
  // How each prediction did: come true once the places swapped (the director's pass in waiting, or
  // one confirmed), let go once past due and the grace, or once the two are no longer neighbours
  const swapped = (one: Prediction) =>
    [...state.pending, ...state.passes].some(
      (pass) => pass.seat === one.seat && pass.other === one.other && pass.at >= one.made - PREDICT_STEADY,
    )
  const predictions: Prediction[] = []
  for (const one of state.predictions) {
    if (one.exact ? time >= one.due : swapped(one)) {
      came++
      continue
    }
    const behind = placeOf(one.seat)
    const ahead = placeOf(one.other)
    const apart = !one.exact && (behind < 0 || ahead < 0 || Math.abs(behind - ahead) !== 1)
    if (time > one.due + PREDICT_GRACE || apart) {
      missed++
      retracting.push({ seat: one.seat, other: one.other, at: time })
      continue
    }
    predictions.push(one)
  }
  const expects = (seat: number, other: number) =>
    predictions.some((one) => one.seat === seat && one.other === other)
  const closing: Record<string, { since: number; gap: number }> = {}
  const headings: Record<number, number> = {}
  for (const kart of moment.karts) headings[kart.seat] = kart.heading
  if (options.foreseen) {
    // A replay: the overtakes to come, exactly
    for (const pass of options.foreseen) {
      if (pass.at <= time || pass.at - time > PREDICT_LEAD) continue
      if (predictions.some((one) => one.exact && one.seat === pass.seat && one.due === pass.at)) continue
      predictions.push({ seat: pass.seat, other: pass.other, made: time, due: pass.at, exact: true })
      made++
    }
  } else if (time >= SETTLE_SECONDS && step > 0) {
    // Live: neighbouring places, the one behind closing in, steadily
    const turnOf = (kart: BroadcastKart) => {
      const was = state.headings[kart.seat]
      return was === undefined ? 0 : wrapAngle(kart.heading - was) / step
    }
    for (let i = 0; i + 1 < moment.karts.length; i++) {
      const ahead = moment.karts[i]!
      const behind = moment.karts[i + 1]!
      if (!racing(ahead) || !racing(behind)) continue
      const pass = passIn(ahead, behind, (turnOf(ahead) + turnOf(behind)) / 2)
      if (pass === null) continue
      const key = `${behind.seat}:${ahead.seat}`
      const first = state.closing[key] ?? { since: time, gap: pass.gap }
      closing[key] = first
      if (time - first.since < PREDICT_STEADY || expects(behind.seat, ahead.seat)) continue
      // The gap really closing meanwhile, not one frame's speed
      if (first.gap - pass.gap < PREDICT_CLOSING * (time - first.since) * PREDICT_SHRINK) continue
      // Not the same two straight back after a pass between them
      const echo = state.passes.some(
        (pass) => pass.seat === ahead.seat && pass.other === behind.seat && time - pass.at < ECHO_SECONDS,
      )
      if (echo) continue
      predictions.push({ seat: behind.seat, other: ahead.seat, made: time, due: time + pass.seconds })
      made++
    }
  }
  for (const one of predictions) {
    // Known to come (a replay's): worth more than an overtake already over
    const worth = one.exact ? WORTH.overtake + 5 : WORTH.attack
    list.push({ seat: one.seat, reason: 'attack', worth, shot: 'side' })
  }
  // A prediction let go: the chaser's say fades, so the camera eases back rather than jumps
  for (const one of retracting) {
    if (time - one.at >= RETRACT_SECONDS || predictions.some((other) => other.seat === one.seat)) continue
    const worth = WORTH.attack * (1 - (time - one.at) / RETRACT_SECONDS)
    if (worth > 0) list.push({ seat: one.seat, reason: 'battle', worth, shot: null })
  }
  // The hits to come: a replay's exactly; live, a shot closing on a kart
  const shotsSeen: Record<number, { x: number; z: number }> = {}
  if (options.foreseen) {
    for (const hit of moment.hits) {
      if (hit.at > time && hit.at - time <= HIT_LEAD) {
        list.push({ seat: hit.target, reason: 'incoming', worth: WORTH.incoming, shot: 'side' })
      }
    }
  } else {
    for (const shot of moment.shots ?? []) {
      shotsSeen[shot.n] = { x: shot.x, z: shot.z }
      const was = state.shotsSeen[shot.n]
      if (!was) continue
      for (const kart of moment.karts) {
        if (kart.seat === shot.by || !racing(kart)) continue
        if (shot.target !== null && shot.target !== kart.seat) continue
        if (shotReaches(shot, was, step, kart) === null) continue
        list.push({ seat: kart.seat, reason: 'incoming', worth: WORTH.incoming, shot: 'side' })
      }
    }
  }
  return {
    next: { headings, closing, predictions, retracting, shotsSeen, foresight: { made, came, missed } },
    list,
  }
}

/** Who is worth showing now, best first */
function candidates(
  state: Pick<DirectorState, 'overtakes' | 'finished'>,
  moment: BroadcastMoment,
  options: DirectorOptions,
  foreseen: readonly Candidate[] = [],
): Candidate[] {
  const list: Candidate[] = [...foreseen]
  const racing = moment.karts.filter((kart) => kart.finishMs === null && !kart.out)
  const lapLength = moment.gates
  const raceLength = lapLength * moment.laps
  const finishCamera = options.cameras.some((camera) => camera.finish)
  for (const kart of moment.karts) {
    // Coming to the line for the last time (the lap's last stretch), or just over it
    if (kart.finishMs === null && !kart.out && kart.progress >= raceLength - FINISH_STRETCH) {
      list.push({ seat: kart.seat, reason: 'finish', worth: WORTH.finish, shot: finishCamera ? 'trackside' : 'low' })
    }
    if (kart.finishMs !== null && moment.time - kart.finishMs / 1000 < FINISH_WINDOW && moment.time >= kart.finishMs / 1000) {
      list.push({ seat: kart.seat, reason: 'finish', worth: WORTH.finish - 5, shot: finishCamera ? 'trackside' : 'low' })
    }
  }
  for (const one of state.overtakes) {
    if (moment.time - one.at < OVERTAKE_WINDOW) {
      list.push({ seat: one.seat, reason: 'overtake', worth: WORTH.overtake, shot: 'side' })
    }
  }
  for (const hit of moment.hits) {
    if (moment.time >= hit.at && moment.time - hit.at < HIT_WINDOW) {
      list.push({ seat: hit.target, reason: 'hit', worth: WORTH.hit, shot: 'side' })
    }
  }
  for (const kart of racing) {
    if (kart.airborne) list.push({ seat: kart.seat, reason: 'jump', worth: WORTH.jump, shot: 'low' })
  }
  // Fights: neighbouring places this near; the chaser is shown, the one ahead in the frame too
  for (let i = 0; i + 1 < moment.karts.length; i++) {
    const ahead = moment.karts[i]!
    const behind = moment.karts[i + 1]!
    if (ahead.finishMs !== null || behind.finishMs !== null || ahead.out || behind.out) continue
    const metres = Math.hypot(ahead.x - behind.x, ahead.z - behind.z)
    if (metres > BATTLE_METRES || Math.abs(ahead.progress - behind.progress) > 1.5) continue
    // A fight for the lead counts more, and a closer one
    const worth = WORTH.battle + (BATTLE_METRES - metres) + (i === 0 ? 8 : 0)
    list.push({ seat: behind.seat, reason: 'battle', worth, shot: null })
  }
  const leader = racing[0]
  if (leader) {
    const onFinalLap = moment.laps > 1 && leader.lapMs.length >= moment.laps - 1
    list.push({
      seat: leader.seat,
      reason: onFinalLap ? 'finalLap' : 'leader',
      worth: onFinalLap ? WORTH.finalLap : WORTH.leader,
      shot: null,
    })
  }
  // Everyone home or out: the winner
  if (list.length === 0 && moment.karts[0]) {
    list.push({ seat: moment.karts[0].seat, reason: 'leader', worth: WORTH.leader, shot: null })
  }
  const favour = options.favour
  if (favour !== undefined && favour !== null) {
    const favoured = moment.karts.find((kart) => kart.seat === favour)
    if (favoured && !list.some((one) => one.seat === favour)) {
      list.push({ seat: favour, reason: 'leader', worth: WORTH.leader, shot: null })
    }
  }
  return list
    .map((one) => (one.seat === favour ? { ...one, worth: one.worth + FAVOUR } : one))
    .sort((a, b) => b.worth - a.worth || a.seat - b.seat)
}

/** The shot for `candidate`: its own, or the next of its rotation; a steady one with less motion */
function shotFor(
  candidate: Candidate,
  turn: number,
  kart: BroadcastKart | undefined,
  options: DirectorOptions,
): ShotKind {
  const rotation = candidate.reason === 'battle' ? BATTLE_SHOTS : LEADER_SHOTS
  let shot = candidate.shot ?? rotation[turn % rotation.length]!
  if (options.reducedMotion) {
    return STEADY_SHOTS.includes(shot)
      ? shot
      : (STEADY_SHOTS[turn % STEADY_SHOTS.length] ?? 'chase')
  }
  // A roadside camera only where one can see the kart; else the next of the rotation
  const finish = candidate.reason === 'finish'
  if (shot === 'trackside' && (!kart || !cameraFor(options.cameras, kart, finish, finish ? FINISH_REACH : undefined))) {
    shot = candidate.reason === 'finish' ? 'low' : rotation[(turn + 1) % rotation.length]!
    if (shot === 'trackside') shot = 'side'
  }
  return shot
}

/**
 * One step of the director: the race at `moment`, what it shows next, and the captions for what
 * just happened. Cuts only once the shot on screen has been up MIN_HOLD, but at once when its kart
 * is gone. A step back in time (a replay sought backwards) starts afresh
 */
export function directorStep(
  previous: DirectorState,
  moment: BroadcastMoment,
  options: DirectorOptions,
): { state: DirectorState; captions: Caption[]; cut: boolean } {
  const fresh = moment.time < previous.time || moment.time - previous.time > 3
  const base = fresh ? { ...startDirector(), cuts: previous.cuts, turn: previous.turn } : previous
  const { captions, next } = notice(base, moment)
  const seen: DirectorState = { ...base, ...next }
  const ahead = foresee(seen, base, moment, options)
  const noticed: DirectorState = { ...seen, ...ahead.next, time: moment.time }
  const list = candidates(noticed, moment, options, ahead.list)
  const best = list[0]
  if (!best) return { state: { ...noticed, seat: null }, captions, cut: false }
  const kartOf = (seat: number | null) => moment.karts.find((kart) => kart.seat === seat)
  const onScreen = kartOf(noticed.seat)
  const held = moment.time - noticed.since
  const hold = options.reducedMotion ? MIN_HOLD_STEADY : MIN_HOLD
  const cutTo = (candidate: Candidate, turn: number) => {
    const state: DirectorState = {
      ...noticed,
      seat: candidate.seat,
      reason: candidate.reason,
      shot: shotFor(candidate, turn, kartOf(candidate.seat), options),
      since: moment.time,
      cuts: noticed.cuts + 1,
      turn,
    }
    return { state, captions, cut: true }
  }
  // Nothing on screen yet, or its kart gone: at once
  if (noticed.seat === null || !onScreen) return cutTo(best, noticed.turn)
  // Something foreseen cannot wait the whole hold: it is about to happen (never with less motion)
  const soon = (best.reason === 'attack' || best.reason === 'incoming') && !options.reducedMotion
  if (held < (soon ? Math.min(hold, FORESEEN_HOLD) : hold)) return { state: noticed, captions, cut: false }
  // What the kart on screen is worth now (it may have stopped fighting), plus its say
  const current = list.find((one) => one.seat === noticed.seat)
  const currentWorth = (current?.worth ?? 0) + STICKY
  if (best.seat !== noticed.seat && best.worth > currentWorth) return cutTo(best, noticed.turn + 1)
  // The same kart: a reason that calls for a shot of its own not on screen (a new reason, or the
  // finish line's camera now in reach), or the rotation's next after a while
  const stay = current ?? best
  if (stay.shot !== null && shotFor(stay, noticed.turn + 1, onScreen, options) !== noticed.shot) {
    return cutTo(stay, noticed.turn + 1)
  }
  if (held >= ROTATE_AFTER) {
    // Long enough on one kart: the next shot of it, or someone else worth as much
    const other = list.find((one) => one.seat !== noticed.seat && one.worth >= stay.worth)
    return cutTo(other ?? stay, noticed.turn + 1)
  }
  return { state: { ...noticed, reason: stay.reason }, captions, cut: false }
}

// ── The gaps between the karts ────────────────────────────────────────────────────────────────

/** Each seat's time (seconds from GO) at each gate passed: index n is the nth gate of the race */
export type Passings = ReadonlyMap<number, readonly number[]>

/** Notes the gates each kart has passed by `time`; a step back in time starts afresh */
export function notePassings(
  passings: Map<number, number[]>,
  time: number,
  karts: readonly { readonly seat: number; readonly progress: number }[],
): void {
  for (const kart of karts) {
    let times = passings.get(kart.seat)
    if (!times) {
      times = []
      passings.set(kart.seat, times)
    }
    const passed = Math.floor(kart.progress)
    while (times.length <= passed) times.push(time)
  }
}

/**
 * The gap in seconds from the kart ahead to `behind`, at the last gate both have passed; null when
 * there is none yet. Two karts home: the difference of their finish times
 */
export function gapSeconds(
  passings: Passings,
  ahead: Pick<BroadcastKart, 'seat' | 'finishMs'>,
  behind: Pick<BroadcastKart, 'seat' | 'finishMs' | 'progress'>,
): number | null {
  if (ahead.finishMs !== null && behind.finishMs !== null) {
    return Math.max(0, (behind.finishMs - ahead.finishMs) / 1000)
  }
  const gate = Math.floor(behind.progress)
  if (gate < 1) return null
  const aheadTime = passings.get(ahead.seat)?.[gate]
  const behindTime = passings.get(behind.seat)?.[gate]
  if (aheadTime === undefined || behindTime === undefined) return null
  return Math.max(0, behindTime - aheadTime)
}
