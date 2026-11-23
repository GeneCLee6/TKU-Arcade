// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { KartFrame } from '../../shared/kart/net.ts'
import {
  createReplayRecorder,
  type RecordedView,
  type Replay,
} from '../../shared/kart/replay.ts'
import { checkReplayMeta, decodeReplay, encodeReplay } from '../../shared/kart/replayBlob.ts'
import {
  FILE_VERSION,
  LINK_MAX_BYTES,
  linkedReplay,
  MAX_FILE_BYTES,
  packReplayFile,
  readReplayFile,
  replayLink,
  unpackReplayFile,
  writeReplayFile,
  type ReplayFileInfo,
} from '../../shared/kart/replayFile.ts'

const frame = (tick: number, seat: number): KartFrame => ({
  tick,
  // Wandering, as a kart does: a race does not deflate to nothing
  x: 10 + tick * 0.5 + seat + Math.sin(tick * 1.7 + seat) * 3,
  z: -20 - tick * 0.25 + Math.cos(tick * 0.9) * 2,
  heading: Math.sin(tick * 0.37),
  vx: 30,
  vz: -15,
  reset: false,
  drifting: tick % 50 < 20,
  boosting: false,
  skidding: false,
  finished: false,
  driftDirection: 0,
  steer: 0.25,
  body: 3 + seat,
  crossings: 1,
  nextGate: 3,
  seq: tick,
})

const VIEW: RecordedView = {
  track: 'riverside',
  laps: 2,
  mode: 'items',
  goAt: 100_000,
  racers: [
    { seat: 0, item: null, lapMs: [], finishMs: null, out: false },
    { seat: 1, item: null, lapMs: [], finishMs: null, out: false },
  ],
  events: [],
}

/** A race of `seconds`, two karts, an item used and a lap done */
function race(seconds: number): Replay {
  const recorder = createReplayRecorder(VIEW)
  for (let tick = 0; tick <= seconds * 60; tick += 3) {
    recorder.frame(0, frame(tick, 0))
    recorder.frame(1, frame(tick, 1))
  }
  recorder.view({
    ...VIEW,
    racers: [
      { seat: 0, item: 'boost', lapMs: [40_000], finishMs: null, out: false },
      { seat: 1, item: null, lapMs: [41_000], finishMs: null, out: false },
    ],
    events: [{ n: 0, item: 'hail', by: 0, targets: [1], blocked: [], at: 105_000, hit: true }],
  })
  return recorder.replay()
}

const INFO: ReplayFileInfo = {
  revision: 3,
  names: [
    { seat: 0, name: 'Ann' },
    { seat: 1, name: 'Bo\u0007b' },
  ],
  you: 0,
  savedAt: 1_790_000_000_000,
}

describe('a replay file (.tkureplay)', () => {
  it('goes to a file and back, with its track revision, names and items', async () => {
    const replay = race(20)
    const bytes = await writeReplayFile(replay, INFO)
    const read = await readReplayFile(bytes)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.file.replay).toEqual(decodeReplay(encodeReplay(replay)))
    expect(read.file.replay.events[0]).toMatchObject({ item: 'hail', by: 0, targets: [1], hit: true })
    expect(read.file.revision).toBe(3)
    expect(read.file.you).toBe(0)
    // A name loses what cannot be shown
    expect(read.file.names).toEqual([
      { seat: 0, name: 'Ann' },
      { seat: 1, name: 'Bob' },
    ])
    // Deflated: smaller than the replay itself
    expect(bytes.byteLength).toBeLessThan(encodeReplay(replay).byteLength)
  })

  it('says what is wrong with a file that is not one, is cut short or is broken', async () => {
    const bytes = await writeReplayFile(race(5), INFO)
    expect(await readReplayFile(new TextEncoder().encode('hello, not a replay'))).toEqual({
      ok: false,
      problem: 'notReplay',
    })
    expect((await readReplayFile(bytes.subarray(0, bytes.length - 20))).ok).toBe(false)
    const flipped = bytes.slice()
    flipped[flipped.length >> 1] ^= 0xff
    expect((await readReplayFile(flipped)).ok).toBe(false)
    // Unknown flags
    const flagged = bytes.slice()
    flagged[5] = 0x80
    expect(await readReplayFile(flagged)).toEqual({ ok: false, problem: 'broken' })
  })

  it('tells a file from a newer version apart', async () => {
    const bytes = await writeReplayFile(race(5), INFO)
    const newer = bytes.slice()
    newer[4] = FILE_VERSION + 1
    expect(await readReplayFile(newer)).toEqual({ ok: false, problem: 'version' })
    // The replay inside from a newer version
    const body = packReplayFile(race(5), INFO)
    const headerLength = new DataView(body.buffer).getUint32(0, true)
    body[4 + headerLength + 1] = 99
    expect(unpackReplayFile(body)).toEqual({ ok: false, problem: 'version' })
  })

  it('refuses a file too big, before and while inflating it', async () => {
    expect(await readReplayFile(new Uint8Array(MAX_FILE_BYTES + 1))).toEqual({
      ok: false,
      problem: 'tooBig',
    })
    // A small file that inflates to far more than any replay
    const zeros = new Uint8Array(20_000_000)
    const stream = new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    const deflated = new Uint8Array(await new Response(stream).arrayBuffer())
    const bomb = new Uint8Array(6 + deflated.length)
    bomb.set([0x54, 0x4b, 0x55, 0x52, FILE_VERSION, 1])
    bomb.set(deflated, 6)
    expect(bomb.byteLength).toBeLessThan(MAX_FILE_BYTES)
    expect(await readReplayFile(bomb)).toEqual({ ok: false, problem: 'tooBig' })
  })

  it('trusts nothing in the replay: a wrong field makes it unreadable', () => {
    const good = { ...race(2) } as Record<string, unknown>
    delete good.karts
    expect(checkReplayMeta(good)).not.toBeNull()
    const broken: unknown[] = [
      null,
      [],
      { ...good, track: 42 },
      { ...good, laps: 0 },
      { ...good, laps: 1.5 },
      { ...good, mode: 'drag' },
      { ...good, racers: [{ seat: -1, lapMs: [], finishMs: null, out: false }] },
      { ...good, racers: [{ seat: 0, lapMs: ['1'], finishMs: null, out: false }] },
      { ...good, events: [{ tick: 1, item: 'rocket', by: 0, targets: [], blocked: [] }] },
      { ...good, events: [{ tick: 1, item: 'hail', by: 0, targets: [99], blocked: [] }] },
      { ...good, held: [{ tick: 1, seat: 0, item: '<script>' }] },
      { ...good, shots: [{ n: 1 }] },
      { ...good, events: new Array(20_001).fill({ tick: 1, item: 'hail', by: 0, targets: [], blocked: [] }) },
    ]
    for (const one of broken) expect(checkReplayMeta(one)).toBeNull()
    // Fields a replay does not have are left behind
    expect(checkReplayMeta({ ...good, __proto__: { polluted: true }, extra: 1 })).not.toHaveProperty('extra')
  })

  it('makes a link only of a small replay, and reads it back', async () => {
    const small = await writeReplayFile(race(1), INFO)
    expect(small.byteLength).toBeLessThanOrEqual(LINK_MAX_BYTES)
    const link = replayLink('https://example.test', small)!
    expect(link).toMatch(/^https:\/\/example\.test\/kart\/replay#r=[A-Za-z0-9_-]+$/)
    const back = linkedReplay(new URL(link).hash)!
    expect(back).toEqual(small)
    expect((await readReplayFile(back)).ok).toBe(true)
    const big = await writeReplayFile(race(120), INFO)
    expect(big.byteLength).toBeGreaterThan(LINK_MAX_BYTES)
    expect(replayLink('https://example.test', big)).toBeNull()
    expect(linkedReplay('#r=not*base64')).toBeNull()
    expect(linkedReplay('#r=' + 'A'.repeat(10_000))).toBeNull()
    expect(linkedReplay('')).toBeNull()
  })
})

// 2026-11-23 (docs/KART-NETCODE.md §11.4; #177's known limit): what each driver wore, in the header
describe("a replay file's outfits", () => {
  it('keeps what each racer wore, and an older file has none (the race suit)', async () => {
    const replay = race(5)
    const worn: ReplayFileInfo = { ...INFO, outfits: [{ seat: 1, outfit: 'street' }] }
    const read = await readReplayFile(await writeReplayFile(replay, worn))
    expect(read.ok && read.file.outfits).toEqual([{ seat: 1, outfit: 'street' }])
    const old = await readReplayFile(await writeReplayFile(replay, INFO))
    expect(old.ok && old.file.outfits).toBeUndefined()
    // A page from before reads the new header as it always did (its fields are all still there)
    const body = packReplayFile(replay, worn)
    const headerLength = new DataView(body.buffer).getUint32(0, true)
    const header = JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + headerLength)))
    expect(header).toMatchObject({ revision: 3, you: 0, savedAt: INFO.savedAt })
    expect(header.names).toHaveLength(2)
  })

  it('leaves out an outfit it does not know, a seat twice, a racer not in it; never refuses the file', () => {
    const replay = race(2)
    const body = packReplayFile(replay, {
      ...INFO,
      outfits: [
        { seat: 0, outfit: 'campus' },
        { seat: 0, outfit: 'street' },
        { seat: 1, outfit: 'tuxedo' as never },
        { seat: 7, outfit: 'street' },
      ],
    })
    const read = unpackReplayFile(body)
    expect(read.ok && read.file.outfits).toEqual([{ seat: 0, outfit: 'campus' }])
    // Not a list at all: no outfits, the file still read
    const plain = packReplayFile(replay, INFO)
    const length = new DataView(plain.buffer).getUint32(0, true)
    const header = JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + length)))
    const odd = new TextEncoder().encode(JSON.stringify({ ...header, outfits: 'street' }))
    const rest = plain.subarray(4 + length)
    const bent = new Uint8Array(4 + odd.length + rest.length)
    new DataView(bent.buffer).setUint32(0, odd.length, true)
    bent.set(odd, 4)
    bent.set(rest, 4 + odd.length)
    const oddRead = unpackReplayFile(bent)
    expect(oddRead.ok).toBe(true)
    expect(oddRead.ok && oddRead.file.outfits).toBeUndefined()
  })
})
