import { describe, expect, it } from 'vitest'
import {
  CLOCK_SETTLE_ANYWAY,
  clockOffset,
  clockSettled,
  decodeFrame,
  encodeFrame,
  FLAG_AIRBORNE,
  FRAME_BYTES,
  readRelayed,
  RELAYED_BYTES,
  relayFrame,
  type KartFrame,
} from '../../shared/kart/net.ts'

const FRAME: KartFrame = {
  tick: -120,
  x: 12.5,
  z: -340.25,
  heading: 1.25,
  vx: 30.5,
  vz: -44,
  reset: false,
  drifting: true,
  boosting: true,
  skidding: true,
  finished: false,
  driftDirection: -1,
  steer: -0.75,
  body: 2,
  crossings: 3,
  nextGate: 17,
  seq: 65_535,
}

describe('kart frames on the wire (e9-t01)', () => {
  it('are small and come back as they went', () => {
    const bytes = encodeFrame(FRAME)
    expect(bytes.byteLength).toBe(FRAME_BYTES)
    expect(FRAME_BYTES).toBeLessThanOrEqual(40)
    expect(decodeFrame(bytes)).toEqual(FRAME)
  })

  it('keep every flag and the drift either way', () => {
    const other = {
      ...FRAME,
      reset: true,
      drifting: false,
      finished: true,
      driftDirection: 1 as const,
    }
    expect(decodeFrame(encodeFrame(other))).toEqual({ ...other, boosting: true, skidding: true })
  })

  it('refuse what is not a frame', () => {
    expect(decodeFrame(new Uint8Array(FRAME_BYTES - 1))).toBeNull()
    const wrongKind = encodeFrame(FRAME)
    wrongKind[0] = 9
    expect(decodeFrame(wrongKind)).toBeNull()
    const notANumber = encodeFrame(FRAME)
    new DataView(notANumber.buffer).setFloat32(8, Number.NaN, true)
    expect(decodeFrame(notANumber)).toBeNull()
  })

  it('go round with the seat in front', () => {
    const relayed = relayFrame(5, encodeFrame(FRAME))
    expect(relayed.byteLength).toBe(RELAYED_BYTES)
    expect(readRelayed(relayed)).toEqual({ seat: 5, frame: FRAME })
    expect(readRelayed(encodeFrame(FRAME))).toBeNull()
  })
})

describe('the shared clock', () => {
  it('trusts the ping with the shortest round trip, halfway through it', () => {
    expect(clockOffset([])).toBeNull()
    const offset = clockOffset([
      { sent: 0, received: 400, server: 10_150 },
      { sent: 1000, received: 1040, server: 11_020 },
      { sent: 2000, received: 2300, server: 12_000 },
    ])
    expect(offset).toBe(11_020 - 1020)
  })
})

describe('the airborne flag (2026-11-17, a track with jumps)', () => {
  it('rides in the free top bit of the flags: same size, same bytes otherwise', () => {
    const plain = encodeFrame(FRAME)
    const flying = encodeFrame({ ...FRAME, airborne: true })
    expect(flying.byteLength).toBe(FRAME_BYTES)
    expect(flying[1]).toBe(plain[1]! | FLAG_AIRBORNE)
    expect([...flying.slice(2)]).toEqual([...plain.slice(2)])
    expect(decodeFrame(flying)).toEqual({ ...FRAME, airborne: true })
    // A frame on the ground has no airborne key at all, as before
    expect('airborne' in decodeFrame(plain)!).toBe(false)
    // and the drift's way still reads under it
    expect(decodeFrame(flying)!.driftDirection).toBe(-1)
  })
})

// 2026-11-23 (#152): the opening presents its drivers only once the clock's answers agree
describe('a settled clock', () => {
  /** An answer with the server `ahead` of this browser, going out in `up` ms and back in `down` */
  const answer = (sent: number, up: number, down: number, ahead = 5_000) => ({
    sent,
    received: sent + up + down,
    server: sent + up + ahead,
  })

  it('not before three answers, then once the three quickest agree', () => {
    expect(clockSettled([])).toBe(false)
    expect(clockSettled([answer(0, 20, 20), answer(120, 20, 20)])).toBe(false)
    expect(clockSettled([answer(0, 20, 20), answer(120, 22, 18), answer(240, 19, 21)])).toBe(true)
  })

  it('not while the only quick answers were read late by a busy page', () => {
    // The first came back while the page was building the race: read 1.4 s late
    const busy = [answer(0, 20, 1_420), answer(120, 20, 900), answer(240, 20, 20)]
    expect(clockSettled(busy)).toBe(false)
    expect(Math.abs(clockOffset(busy)! - 5_000)).toBeLessThan(1)
    // ... and its offset would be 0.7 s out had it been the only one
    expect(Math.abs(clockOffset(busy.slice(0, 1))! - 5_000)).toBeGreaterThan(690)
    expect(clockSettled([...busy, answer(360, 21, 19), answer(480, 20, 20)])).toBe(true)
  })

  it('a slow but steady network settles; a jittery one after enough answers', () => {
    expect(clockSettled([answer(0, 200, 200), answer(120, 205, 195), answer(240, 198, 202)])).toBe(true)
    const jitter = Array.from({ length: CLOCK_SETTLE_ANYWAY }, (_, i) =>
      answer(i * 120, 40 + (i % 2) * 120, 40 + ((i + 1) % 2) * 120),
    )
    expect(clockSettled(jitter.slice(0, CLOCK_SETTLE_ANYWAY - 1))).toBe(false)
    expect(clockSettled(jitter)).toBe(true)
  })
})
