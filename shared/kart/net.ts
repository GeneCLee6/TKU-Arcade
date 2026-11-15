// e9-t01: the kart's frames on the wire (docs/KART-NETCODE.md). Each browser simulates its own kart
// and sends its state about 20 times a second as one small binary frame; the room passes it on to
// everyone else with the sender's seat in front. Little-endian, fixed size, no JSON: a frame is
// FRAME_BYTES long and a relayed one RELAYED_BYTES.
//
//   0  u8   kind (FRAME_KIND)
//   1  u8   flags (FLAG_*), and the drift's way in bits 5–6 (0 none, 1 left, 2 right)
//   2  u8   the kart's body (cosmetic: an index into the bodies the browser knows)
//   3  i8   steer × 100
//   4  i32  race tick: steps of 1/60 s since GO, negative before it
//   8  f32  x        12 f32 z        16 f32 heading     20 f32 vx      24 f32 vz
//  28  u8   finish-line crossings (as course.ts counts them)
//  29  u8   the next gate
//  30  u16  sequence number, wrapping
//
// Pure and shared: the browser encodes and decodes, the Worker decodes and judges (race.ts).

export const FRAME_KIND = 1
export const FRAME_BYTES = 32
/** The seat in front, then the frame */
export const RELAYED_BYTES = FRAME_BYTES + 1

/** Frames a second each browser sends: every third physics step */
export const SEND_EVERY_STEPS = 3

/** This frame is a jump, not a move (a reset to the last gate): no gate is crossed on the way */
export const FLAG_RESET = 1
export const FLAG_DRIFTING = 2
export const FLAG_BOOSTING = 4
export const FLAG_SKIDDING = 8
/** The sender's own count says it has finished */
export const FLAG_FINISHED = 16

export interface KartFrame {
  readonly tick: number
  readonly x: number
  readonly z: number
  readonly heading: number
  readonly vx: number
  readonly vz: number
  readonly reset: boolean
  readonly drifting: boolean
  readonly boosting: boolean
  readonly skidding: boolean
  readonly finished: boolean
  readonly driftDirection: -1 | 0 | 1
  readonly steer: number
  readonly body: number
  readonly crossings: number
  readonly nextGate: number
  readonly seq: number
}

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export function encodeFrame(frame: KartFrame): Uint8Array {
  const bytes = new Uint8Array(FRAME_BYTES)
  const view = new DataView(bytes.buffer)
  const flags =
    (frame.reset ? FLAG_RESET : 0) |
    (frame.drifting ? FLAG_DRIFTING : 0) |
    (frame.boosting ? FLAG_BOOSTING : 0) |
    (frame.skidding ? FLAG_SKIDDING : 0) |
    (frame.finished ? FLAG_FINISHED : 0) |
    ((frame.driftDirection === -1 ? 1 : frame.driftDirection === 1 ? 2 : 0) << 5)
  view.setUint8(0, FRAME_KIND)
  view.setUint8(1, flags)
  view.setUint8(2, clampByte(frame.body))
  view.setInt8(3, Math.max(-100, Math.min(100, Math.round(frame.steer * 100))))
  view.setInt32(4, Math.round(frame.tick), true)
  view.setFloat32(8, frame.x, true)
  view.setFloat32(12, frame.z, true)
  view.setFloat32(16, frame.heading, true)
  view.setFloat32(20, frame.vx, true)
  view.setFloat32(24, frame.vz, true)
  view.setUint8(28, clampByte(frame.crossings))
  view.setUint8(29, clampByte(frame.nextGate))
  view.setUint16(30, frame.seq & 0xffff, true)
  return bytes
}

/** The frame in these bytes, or null for anything that is not one (they come off the network) */
export function decodeFrame(bytes: Uint8Array): KartFrame | null {
  if (bytes.byteLength !== FRAME_BYTES) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint8(0) !== FRAME_KIND) return null
  const flags = view.getUint8(1)
  const way = (flags >> 5) & 3
  if (way === 3) return null
  const frame: KartFrame = {
    tick: view.getInt32(4, true),
    x: view.getFloat32(8, true),
    z: view.getFloat32(12, true),
    heading: view.getFloat32(16, true),
    vx: view.getFloat32(20, true),
    vz: view.getFloat32(24, true),
    reset: (flags & FLAG_RESET) !== 0,
    drifting: (flags & FLAG_DRIFTING) !== 0,
    boosting: (flags & FLAG_BOOSTING) !== 0,
    skidding: (flags & FLAG_SKIDDING) !== 0,
    finished: (flags & FLAG_FINISHED) !== 0,
    driftDirection: way === 1 ? -1 : way === 2 ? 1 : 0,
    steer: view.getInt8(3) / 100,
    body: view.getUint8(2),
    crossings: view.getUint8(28),
    nextGate: view.getUint8(29),
    seq: view.getUint16(30, true),
  }
  const numbers = [frame.x, frame.z, frame.heading, frame.vx, frame.vz]
  return numbers.every(Number.isFinite) ? frame : null
}

/** What the room sends everyone else: the sender's seat, then its frame as it came */
export function relayFrame(seat: number, frame: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(RELAYED_BYTES)
  bytes[0] = seat
  bytes.set(frame, 1)
  return bytes
}

/** A relayed frame: whose, and what */
export function readRelayed(bytes: Uint8Array): { seat: number; frame: KartFrame } | null {
  if (bytes.byteLength !== RELAYED_BYTES) return null
  const frame = decodeFrame(bytes.subarray(1))
  return frame ? { seat: bytes[0]!, frame } : null
}

// ── The shared clock ─────────────────────────────────────────────────────────────────────────

/** One answer to a clock ping: when it left (this browser's clock), when it came back, the server's time */
export interface ClockSample {
  readonly sent: number
  readonly received: number
  readonly server: number
}

/**
 * The server's clock minus this browser's, from the samples so far: the one with the shortest round
 * trip wins (NTP's idea), taking the server's reading as halfway through it. Null before any
 */
export function clockOffset(samples: readonly ClockSample[]): number | null {
  let best: ClockSample | null = null
  for (const sample of samples) {
    if (!best || sample.received - sample.sent < best.received - best.sent) best = sample
  }
  return best ? best.server - (best.sent + best.received) / 2 : null
}
