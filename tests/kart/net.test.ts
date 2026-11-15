import { describe, expect, it } from 'vitest'
import {
  clockOffset,
  decodeFrame,
  encodeFrame,
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
