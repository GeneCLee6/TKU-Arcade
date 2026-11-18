// e9-t05, e9-t06a: the item race (docs/KART-NETCODE.md §10). Rows of item boxes across the road; a
// kart that drives through one asks the room for it (`pickup`), and the room, first come first
// served, hands out an item drawn by place: the further back, the better. Using it asks the room
// again (`use`), and the room judges who it reaches from where it last saw every kart; the effect
// goes out to everyone in the game's state, and each browser applies what it does to its own kart.
//
// Five direct items (L4) and three thrown or dropped ones (L5, e9-t06b; shots.ts). Names and looks
// are working titles of our own, to be settled with the kart's world (e10-t01).
//
// Pure and shared: the browser and the Worker read the same boxes, frames and table.
import { KART_TUNING } from './physics.ts'
import type { Spot } from './course.ts'
import { courseOf, type Track } from './track.ts'

export const ITEM_IDS = [
  'boost',
  'shield',
  'tow',
  'headwind',
  'swap',
  'hail',
  'cloud',
  'puddle',
] as const
export type ItemId = (typeof ITEM_IDS)[number]

export const isItemId = (value: unknown): value is ItemId =>
  typeof value === 'string' && (ITEM_IDS as readonly string[]).includes(value)

/**
 * Items that need another kart to reach when used, or the room refuses them; the rest are for the
 * kart itself or go on the road (hail and puddles: shots.ts)
 */
export const TARGETED_ITEMS: ReadonlySet<ItemId> = new Set(['tow', 'headwind', 'swap', 'cloud'])
/**
 * Of the direct ones, those that harm as they are used: a shield stops them, and is used up doing
 * it. The shots harm later, when they hit, and a shield is judged then (shots.ts)
 */
export const HARMFUL_ITEMS: ReadonlySet<ItemId> = new Set(['headwind', 'swap'])

// ── Numbers ──────────────────────────────────────────────────────────────────────────────────

export const ITEM_TUNING = {
  /** A taken box is back this long after, ms */
  boxRespawnMs: 3_000,
  /** A kart this close to a box's centre takes it, metres (the browser's test) */
  boxTouch: 2.6,
  /** The server allows this far from where it last saw the kart, along its way, metres */
  boxReach: 12,
  /** Boost: seconds of the physics' own boost */
  boostSeconds: 2.4,
  /** Shield: how long the bubble lasts, ms; it stops one harmful item and is gone */
  shieldMs: 8_000,
  /** Tow: pulled towards the kart ahead for this long, ms, if it is no further than `towReach` */
  towMs: 2_500,
  towReach: 160,
  /** Tow: the pull, m/s², and the top speed it may reach (a share of the kart's own) */
  towPull: 34,
  towTopFactor: 1.4,
  /** Headwind: everyone ahead is held to this share of the top speed for this long, ms */
  headwindMs: 3_000,
  headwindTopFactor: 0.55,
  /** Headwind: how fast a kart over that speed is brought down to it, share per second */
  headwindDrag: 2.5,
  /** Swap: with the kart just ahead, on the same lap and no further than this, metres */
  swapReach: 260,
} as const

/** Item events kept in the game's state for the browsers to read; older ones are dropped */
export const KEEP_EVENTS = 16

// ── The boxes ────────────────────────────────────────────────────────────────────────────────

export interface ItemBox {
  readonly x: number
  readonly z: number
}

/** Rows of boxes per lap, and boxes in each row */
const ROWS = 3
const PER_ROW = 5

/** At most this many boxes: a pickup frame names its box in one byte */
export const MAX_BOXES = 255

/**
 * Where a track's item boxes are. A track that places its own (`itemBoxes` in its file: N2's item
 * track) has them there. Any other has ROWS rows a lap, spread round it at gates (never the finish
 * line), PER_ROW boxes across each, evenly between the gate's ends: read from the gates, so that
 * every track has them without drawing them in its file, and a reshaped track moves them with it
 */
export function itemBoxes(
  track: Pick<Track, 'gates'> & Partial<Pick<Track, 'itemBoxes'>>,
): ItemBox[] {
  if (track.itemBoxes && track.itemBoxes.length > 0) {
    return track.itemBoxes.slice(0, MAX_BOXES).map(({ x, z }) => ({ x, z }))
  }
  const count = track.gates.length
  if (count < 2) return []
  const boxes: ItemBox[] = []
  const used = new Set<number>()
  for (let row = 0; row < ROWS; row++) {
    // A third of the way round and on, and a little after the start so the grid has room
    const at = Math.max(1, Math.min(count - 1, Math.round(((row + 0.4) / ROWS) * count)))
    if (used.has(at)) continue
    used.add(at)
    const gate = track.gates[at]!
    for (let i = 0; i < PER_ROW; i++) {
      const share = (i + 1) / (PER_ROW + 1)
      boxes.push({
        x: gate.ax + (gate.bx - gate.ax) * share,
        z: gate.az + (gate.bz - gate.az) * share,
      })
    }
  }
  return boxes
}

// ── Item frames on the wire ──────────────────────────────────────────────────────────────────
//
//   0  u8   kind (ITEM_FRAME_KIND)
//   1  u8   op (OP_PICKUP, OP_USE, OP_TEAM or OP_TEAM_KEEP)
//   2  u8   the box (pickup), the item's index in ITEM_IDS (use), the blue boosts kept (OP_TEAM_KEEP);
//           0 for OP_TEAM
//   3  u8   OP_TEAM_KEEP: the fill it answers (the team's `fills`, its low byte); else 0
//   4  i32  race tick
//
// Small and binary like the kart's own frames (net.ts), on the same channel; never relayed.

export const ITEM_FRAME_KIND = 2
export const ITEM_FRAME_BYTES = 8
export const OP_PICKUP = 1
export const OP_USE = 2
/**
 * 2026-11-18, a team race (team.ts): this kart has just fired a team boost. In either mode, since a
 * team race need not have items; a room from before, or one that is no team race, ignores it
 */
export const OP_TEAM = 3
/**
 * 2026-11-18, later: when its team's gauge filled this kart held fewer charges than the room allows
 * blue ones (teamRider.ts), so it holds only this many. A room from before ignores it
 */
export const OP_TEAM_KEEP = 4

export type ItemFrame =
  | { readonly op: 'pickup'; readonly box: number; readonly tick: number }
  | { readonly op: 'use'; readonly item: ItemId; readonly tick: number }
  | { readonly op: 'team'; readonly tick: number }
  | { readonly op: 'keep'; readonly held: number; readonly fill: number; readonly tick: number }

const OPS = { pickup: OP_PICKUP, use: OP_USE, team: OP_TEAM, keep: OP_TEAM_KEEP } as const

export function encodeItemFrame(frame: ItemFrame): Uint8Array {
  const bytes = new Uint8Array(ITEM_FRAME_BYTES)
  const view = new DataView(bytes.buffer)
  view.setUint8(0, ITEM_FRAME_KIND)
  view.setUint8(1, OPS[frame.op])
  view.setUint8(
    2,
    frame.op === 'pickup'
      ? frame.box
      : frame.op === 'use'
        ? ITEM_IDS.indexOf(frame.item)
        : frame.op === 'keep'
          ? frame.held
          : 0,
  )
  if (frame.op === 'keep') view.setUint8(3, frame.fill & 0xff)
  view.setInt32(4, Math.round(frame.tick), true)
  return bytes
}

/** The item frame in these bytes, or null for anything that is not one */
export function decodeItemFrame(bytes: Uint8Array): ItemFrame | null {
  if (bytes.byteLength !== ITEM_FRAME_BYTES || bytes[0] !== ITEM_FRAME_KIND) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const op = view.getUint8(1)
  const value = view.getUint8(2)
  const tick = view.getInt32(4, true)
  if (op === OP_PICKUP) return { op: 'pickup', box: value, tick }
  if (op === OP_USE) {
    const item = ITEM_IDS[value]
    return item ? { op: 'use', item, tick } : null
  }
  if (op === OP_TEAM) return { op: 'team', tick }
  if (op === OP_TEAM_KEEP) return { op: 'keep', held: value, fill: view.getUint8(3), tick }
  return null
}

// ── The draw ─────────────────────────────────────────────────────────────────────────────────

export type PlaceBucket = 'front' | 'middle' | 'back'

/**
 * How likely each item is, by place: the leader gets a boost, a shield or a puddle to drop behind
 * it; the back of the field gets the items that catch up, the chasing cloud most of all. Weights,
 * not shares; tune freely (a test checks that every item can come out of some place, and nothing
 * that reaches a kart ahead, hail included, is ever given to the leader)
 */
export const ITEM_TABLE: Readonly<Record<PlaceBucket, Readonly<Partial<Record<ItemId, number>>>>> =
  {
    front: { boost: 5, shield: 4, puddle: 3 },
    middle: { boost: 4, shield: 2, tow: 3, swap: 1, hail: 3, puddle: 2, cloud: 1 },
    back: { boost: 3, shield: 1, tow: 3, headwind: 3, swap: 2, hail: 2, cloud: 3 },
  }

/** Which part of the field a place (0 is first) out of `racing` is in */
export function placeBucket(place: number, racing: number): PlaceBucket {
  if (racing <= 1 || place <= 0) return 'front'
  if (place >= racing - 1) return 'back'
  return 'middle'
}

/** One item from the bucket's weights, by `roll` in [0, 1) */
export function drawItem(bucket: PlaceBucket, roll: number): ItemId {
  const weights = ITEM_TABLE[bucket]
  const entries = ITEM_IDS.map((id) => [id, weights[id] ?? 0] as const).filter(([, w]) => w > 0)
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let left = Math.max(0, Math.min(0.999_999, roll)) * total
  for (const [id, weight] of entries) {
    if (left < weight) return id
    left -= weight
  }
  return entries[entries.length - 1]![0]
}

/** A number in [0, 1) from a seed and a count: the same pair always gives the same number */
export function rollFor(seed: number, n: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca77)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 2 ** 32
}

// ── Where a swap lands ───────────────────────────────────────────────────────────────────────

/** Where a kart is put by a swap: the other's place, heading and count of gates */
export type Warp = {
  seat: number
  x: number
  z: number
  heading: number
  nextGate: number
  crossings: number
}

/** The respawn point behind gate `nextGate`: where a reset puts a kart after a swap */
export function safeBehind(track: Track, nextGate: number): Spot {
  const checkpoints = courseOf(track).checkpoints!
  const count = checkpoints.gates.length
  return checkpoints.respawns[(nextGate - 1 + count) % count]!
}

/** The top speed a tow may reach, m/s */
export const TOW_TOP_SPEED = KART_TUNING.topSpeed * ITEM_TUNING.towTopFactor
/** The top speed under a headwind, m/s */
export const HEADWIND_TOP_SPEED = KART_TUNING.topSpeed * ITEM_TUNING.headwindTopFactor
