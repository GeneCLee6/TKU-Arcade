// 2026-11-20 (branches, docs/ARCHITECTURE.md §4.41): a track without branches, and a track made in
// the editor without a bypass, is exactly what it was. The digests below were taken on main at
// fb5f7e1, BEFORE branches came in: every unchanged built-in track's checked JSON (its walls, gates,
// respawns, grid, terrain), the hard computer kart's three laps on it with its own guide (every
// step), and the tracks of the editor's presets and its starter (their ids, so their records, and
// their checked JSON). If one of them changes, a track that has no branch changed with them.
import { describe, expect, it } from 'vitest'
import { encodeSpec } from '../../shared/kart/editor/codec.ts'
import { customTrack } from '../../shared/kart/editor/custom.ts'
import {
  jump,
  slope,
  starterSpec,
  straight,
  type TrackSpec,
} from '../../shared/kart/editor/spec.ts'
import { KART_TUNING } from '../../shared/kart/physics.ts'
import { startTrial, stepTrial, type Trial, type TrialCourse } from '../../shared/kart/timeTrial.ts'
import { courseOf, type Track } from '../../shared/kart/track.ts'
import { trackGuide } from '../../shared/kart/tracks/guides.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { createBotBrain } from '../../src/kart/bots/brain.ts'
import { GOLDEN_HARD } from './goldenHard.ts'

/** FNV-1a over a string, and over the bytes of numbers */
function hasher() {
  let hash = 0x811c9dc5
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  return {
    text(value: string) {
      for (let index = 0; index < value.length; index++) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0
      }
    },
    number(value: number) {
      view.setFloat64(0, value, true)
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
    },
    get value() {
      return hash.toString(16).padStart(8, '0')
    },
  }
}

/** A checked track as JSON: everything the race and the art read */
function trackDigest(track: Track): string {
  const hash = hasher()
  const course = courseOf(track)
  hash.text(JSON.stringify(track))
  hash.text(JSON.stringify(course.checkpoints))
  hash.text(JSON.stringify(course.terrain ?? null))
  return hash.value
}

/** The hard bot, with the track's guide, three laps (or 200 s), every step */
function raceDigest(track: Track): string {
  const plain = courseOf(track)
  const course: TrialCourse = { ...plain, checkpoints: plain.checkpoints!, road: track.road }
  const brain = createBotBrain(
    GOLDEN_HARD,
    track.road,
    KART_TUNING,
    5,
    track.jumps,
    track.walls,
    trackGuide(track.id),
  )
  const hash = hasher()
  let trial: Trial = startTrial(course)
  for (let steps = 0; trial.phase !== 'finished' && steps < 200 * 60; steps++) {
    trial = stepTrial(trial, brain(trial, { speedShare: 1 }), course)
    const { kart } = trial.run
    for (const value of [kart.x, kart.z, kart.heading, kart.vx, kart.vz, kart.y ?? 0]) {
      hash.number(value)
    }
    hash.number(trial.run.nextGate)
    hash.number(trial.wrongWay ? 1 : 0)
  }
  return hash.value
}

/**
 * Taken on main at fb5f7e1: [track digest, race digest]. 2026-11-21: the track digests taken again
 * with the grid in one row and the time trial's own start (shared/kart/startLine.ts); the races,
 * driven from that start, are the very same. 2026-11-22: riverside's, harbour's and tamkang's
 * track digests taken again for their settled names (docs/KART-WORLD.md §0; only `name` changed)
 */
// 2026-11-22 (#145): every digest taken again: each revision raised, and the wall slide and the
// timed landing in the physics (docs/KART-FEEL.md §22); the lanes' race is the very same
const TRACKS: Record<string, readonly [string, string]> = {
  riverside: ['7d5b57b8', '7cffd72b'],
  tamkang: ['b31f94db', '942dad15'],
  guanyin: ['233004ea', '09cf9011'],
  mangrove: ['0268a3b6', 'ece42fe7'],
  fort: ['0d5d475b', 'ad851a43'],
  danhai: ['ee3baecd', '0adde0a5'],
  datun: ['c1fb29ca', '30d3c497'],
  lanes: ['f0104bee', 'e46f40e5'],
  // 2026-11-20: the wharf (a branch now) and the old street (redrawn for its boost cover) changed
  // on purpose, their revisions raised; these are what they were
  // wharf: ['e842a0a2', '59e4d97c'],
  // oldstreet: ['3dbf1196', '83885996'],
  // 2026-11-22: the harbour has moving obstacles (shared/kart/obstacles.ts), its revision raised
  // harbour: ['86bba381', 'bcba2291'],
}

/** Three editor tracks: the starter, and the starter with a hill and with a jump on its long straight */
const SPECS: Record<string, TrackSpec> = (() => {
  const starter = starterSpec()
  const swap = (pieces: TrackSpec['pieces']) => ({
    ...starter,
    theme: 'night' as const,
    pieces: [...starter.pieces.slice(0, 4), ...pieces, ...starter.pieces.slice(5)],
  })
  return {
    starter,
    hill: swap([slope(120, 6, 36, { pad: 'right' }), slope(120, -6, 36, { boxes: true })]),
    jump: swap([jump(80, 2.5), straight(160, 36, { pad: 'middle' })]),
  }
})()

/** Taken on main at fb5f7e1: each editor track's [id, track digest] (the digests again 2026-11-21: the grid in one row) */
const CUSTOM: Record<string, readonly [string, string]> = {
  starter: ['custom-164wwb3lbtz', '011a2e9f'],
  hill: ['custom-ih8shvnxar', '1391ffbf'],
  jump: ['custom-1jip6lh60ry', 'bbb4dbbd'],
}

const customOf = (name: string) => SPECS[name]!

describe('a track without branches is what it was', () => {
  it.each(Object.keys(TRACKS))('%s: the same track and the same race', (id) => {
    const track = raceTrack(id)!
    expect([trackDigest(track), raceDigest(track)]).toEqual(TRACKS[id])
  }, 60_000)

  it.each(Object.keys(CUSTOM))('the editor’s %s: the same id and the same track', (name) => {
    const result = customTrack(encodeSpec(customOf(name)))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect([result.track.id, trackDigest(result.track)]).toEqual(CUSTOM[name])
  })
})
