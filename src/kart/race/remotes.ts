// e9-t03: the other karts, drawn from their frames (docs/KART-NETCODE.md). Each kart's frames carry
// its own race tick; they arrive about every 50 ms, unevenly. Each is drawn INTERP_DELAY behind its
// newest frame's place on this browser's clock, between the two frames around that moment, so that
// the uneven arrivals do not show; when frames stop coming it goes on along its last speed for up to
// EXTRAPOLATE_MAX and then waits there, marked stale. A reset is a jump: never drawn in between.
//
// Which moment of a kart's own clock is "now" on ours is learnt per kart from the arrivals (the
// smallest gap seen between the two clocks, which jitter only ever makes bigger), so a kart whose
// tab ran slow, or a clock sync that is a little off, does not leave it extrapolating for ever.
import type { KartFrame } from '../../../shared/kart/net.ts'

/** How far behind its newest frame a kart is drawn, seconds */
export const INTERP_DELAY = 0.1
/** How far past its newest frame a kart is carried on along its speed, seconds */
export const EXTRAPOLATE_MAX = 0.2
/** Frames kept per kart */
const KEEP = 24
/** The clock gap is learnt again from the arrivals of this many seconds */
const OFFSET_WINDOW = 3

export interface RemotePose {
  readonly seat: number
  readonly x: number
  readonly z: number
  readonly heading: number
  readonly vx: number
  readonly vz: number
  readonly frame: KartFrame
  /** Nothing new for longer than the extrapolation covers */
  readonly stale: boolean
}

interface Arrival {
  readonly frame: KartFrame
  /** This browser's clock when it came, seconds */
  readonly at: number
}

interface Remote {
  arrivals: Arrival[]
  /** Our clock minus the kart's, smallest seen in the window, and when it was seen */
  offset: number
  offsetAt: number
}

const wrapAngle = (angle: number) => angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))

export interface Remotes {
  /** A frame from `seat`, received at `at` (seconds, this browser's clock) */
  add(seat: number, frame: KartFrame, at: number): void
  /** Where each kart is to be drawn at `at` */
  poses(at: number): RemotePose[]
  /** The newest frame of each kart, as it came */
  latest(): ReadonlyMap<number, KartFrame>
  /** Forget a kart (it left) */
  drop(seat: number): void
}

export function createRemotes(): Remotes {
  const karts = new Map<number, Remote>()
  return {
    add(seat, frame, at) {
      const time = frame.tick / 60
      let remote = karts.get(seat)
      if (!remote) {
        remote = { arrivals: [], offset: at - time, offsetAt: at }
        karts.set(seat, remote)
      }
      const newest = remote.arrivals[remote.arrivals.length - 1]
      // Out of order: older than what is drawn already
      if (newest && frame.tick < newest.frame.tick) return
      // A reset is a jump: what came before it is not on the way
      if (frame.reset) remote.arrivals = []
      remote.arrivals.push({ frame, at })
      if (remote.arrivals.length > KEEP) remote.arrivals.shift()
      const gap = at - time
      if (gap <= remote.offset || at - remote.offsetAt > OFFSET_WINDOW) {
        remote.offset = gap
        remote.offsetAt = at
      }
    },
    poses(at) {
      const out: RemotePose[] = []
      for (const [seat, remote] of karts) {
        const { arrivals } = remote
        const newest = arrivals[arrivals.length - 1]
        if (!newest) continue
        const time = at - remote.offset - INTERP_DELAY
        let after = arrivals.findIndex((one) => one.frame.tick / 60 >= time)
        if (after === 0) after = 1
        if (after > 0 && after < arrivals.length) {
          const a = arrivals[after - 1]!.frame
          const b = arrivals[after]!.frame
          const span = (b.tick - a.tick) / 60
          const share = span > 0 ? Math.max(0, Math.min(1, (time - a.tick / 60) / span)) : 1
          out.push({
            seat,
            x: a.x + (b.x - a.x) * share,
            z: a.z + (b.z - a.z) * share,
            heading: a.heading + wrapAngle(b.heading - a.heading) * share,
            vx: a.vx + (b.vx - a.vx) * share,
            vz: a.vz + (b.vz - a.vz) * share,
            frame: share < 0.5 ? a : b,
            stale: false,
          })
          continue
        }
        // Past the newest frame: on along its speed, for a while
        const frame = newest.frame
        const ahead = Math.max(0, time - frame.tick / 60)
        const carried = Math.min(ahead, EXTRAPOLATE_MAX)
        out.push({
          seat,
          x: frame.x + frame.vx * carried,
          z: frame.z + frame.vz * carried,
          heading: frame.heading,
          vx: frame.vx,
          vz: frame.vz,
          frame,
          stale: ahead > EXTRAPOLATE_MAX,
        })
      }
      return out
    },
    latest() {
      const latest = new Map<number, KartFrame>()
      for (const [seat, remote] of karts) {
        const newest = remote.arrivals[remote.arrivals.length - 1]
        if (newest) latest.set(seat, newest.frame)
      }
      return latest
    },
    drop(seat) {
      karts.delete(seat)
    },
  }
}
