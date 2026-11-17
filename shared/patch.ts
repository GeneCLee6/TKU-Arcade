// Diff push (ARCHITECTURE.md §2): the RoomDO keeps the last view it sent and sends only what
// changed. `diff` and `applyPatch` are the two halves; the server diffs, the browser applies.
// Objects are diffed key by key. Arrays (protocol 2, 2026-11-17) are diffed too: an item that
// changed in place is set by its index (an object item diffed key by key), and items added or
// dropped in one run travel as a `splice` (a list that moved on, oldest dropped and newest added,
// as two). Whichever is shortest as JSON wins, replacing the whole array included, so a patch is
// never longer than protocol 1's. `wholeArrays` keeps protocol 1's way, for a reader that may not
// understand the rest (shared/games/replay.ts: a page loaded before an update fetches it too).

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }

export type PatchOp =
  /** Sets the value at `path`; the empty path replaces the whole state. An array's item: its index */
  | { op: 'set'; path: string[]; value: JsonValue }
  /** Removes an object's key (never an array's item: see `splice`) */
  | { op: 'del'; path: string[] }
  /** The array at `path`: removes `del` items from index `at` and puts `items` there (protocol 2) */
  | { op: 'splice'; path: string[]; at: number; del: number; items: JsonValue[] }

export interface DiffOptions {
  /** Replace a changed array whole, as protocol 1 did */
  readonly wholeArrays?: boolean
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function jsonEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]))
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && jsonEqual(a[key], b[key]))
    )
  }
  return false
}

/** The operations that turn `before` into `after`; empty when nothing changed */
export function diff(before: JsonValue, after: JsonValue, options: DiffOptions = {}): PatchOp[] {
  return diffAt(before, after, [], options.wholeArrays === true)
}

function diffAt(before: JsonValue, after: JsonValue, path: string[], whole: boolean): PatchOp[] {
  if (Array.isArray(before) && Array.isArray(after) && !whole) {
    return diffArray(before, after, path)
  }
  if (!isObject(before) || !isObject(after)) {
    return jsonEqual(before, after) ? [] : [{ op: 'set', path, value: after }]
  }
  const ops: PatchOp[] = []
  for (const key of Object.keys(before)) {
    if (!(key in after)) ops.push({ op: 'del', path: [...path, key] })
  }
  for (const [key, value] of Object.entries(after)) {
    if (key in before) ops.push(...diffAt(before[key] as JsonValue, value, [...path, key], whole))
    else ops.push({ op: 'set', path: [...path, key], value })
  }
  return ops
}

const splice = (path: string[], at: number, del: number, items: JsonValue[]): PatchOp => ({
  op: 'splice',
  path,
  at,
  del,
  items,
})

/** The shortest of the ways to turn one array into the other (see the top of the file) */
function diffArray(before: JsonValue[], after: JsonValue[], path: string[]): PatchOp[] {
  if (jsonEqual(before, after)) return []
  const candidates: PatchOp[][] = []
  // Changed in place: each item that differs, by its index
  if (before.length === after.length) {
    const ops: PatchOp[] = []
    for (let i = 0; i < after.length; i++) {
      const was = before[i] as JsonValue
      const now = after[i] as JsonValue
      if (!jsonEqual(was, now)) ops.push(...diffAt(was, now, [...path, String(i)], false))
    }
    candidates.push(ops)
  }
  // One run replaced: what lies between the common start and the common end
  const shorter = Math.min(before.length, after.length)
  let head = 0
  while (head < shorter && jsonEqual(before[head], after[head])) head++
  let tail = 0
  while (
    tail < shorter - head &&
    jsonEqual(before[before.length - 1 - tail], after[after.length - 1 - tail])
  ) {
    tail++
  }
  candidates.push([
    splice(path, head, before.length - head - tail, after.slice(head, after.length - tail)),
  ])
  // A list that moved on: the oldest `drop` gone from the front, the rest still first, new at the back
  for (let drop = 1; drop < before.length; drop++) {
    const kept = before.length - drop
    if (kept > after.length || !jsonEqual(before[drop], after[0])) continue
    let same = true
    for (let i = 1; i < kept && same; i++) same = jsonEqual(before[drop + i], after[i])
    if (!same) continue
    const ops = [splice(path, 0, drop, [])]
    if (after.length > kept) ops.push(splice(path, kept, 0, after.slice(kept)))
    candidates.push(ops)
    break
  }
  let best: PatchOp[] = [{ op: 'set', path, value: after }]
  let size = JSON.stringify(best).length
  for (const ops of candidates) {
    const length = JSON.stringify(ops).length
    if (length < size) {
      best = ops
      size = length
    }
  }
  return best
}

/**
 * Applies the operations without changing `state`: the objects and arrays along each changed path
 * are copied, everything else is shared (so React sees exactly what changed).
 */
export function applyPatch<T extends JsonValue>(state: T, ops: readonly PatchOp[]): T {
  let next: JsonValue = state
  for (const op of ops) next = applyOne(next, op.path, op)
  return next as T
}

/** The array index `key` names, below `length`; throws for anything else */
function arrayIndex(key: string, length: number): number {
  const index = /^(0|[1-9][0-9]*)$/.test(key) ? Number(key) : -1
  if (index < 0 || index >= length) throw new Error('Invalid patch path')
  return index
}

function applyOne(node: JsonValue | undefined, path: readonly string[], op: PatchOp): JsonValue {
  if (path.length === 0) {
    if (op.op === 'set') return op.value
    if (op.op === 'splice') {
      if (
        !Array.isArray(node) ||
        !Array.isArray(op.items) ||
        !Number.isInteger(op.at) ||
        !Number.isInteger(op.del) ||
        op.at < 0 ||
        op.del < 0 ||
        op.at + op.del > node.length
      ) {
        throw new Error('Invalid splice')
      }
      const copy = node.slice()
      copy.splice(op.at, op.del, ...op.items)
      return copy
    }
    throw new Error('Cannot delete the root')
  }
  const [key, ...rest] = path as [string, ...string[]]
  // Keys come from the server's own state, but a patch must never reach an object's prototype
  if (key === '__proto__') throw new Error('Invalid patch path')
  if (Array.isArray(node)) {
    if (rest.length === 0 && op.op === 'del') throw new Error('Cannot delete an array item')
    const index = arrayIndex(key, node.length)
    const copy = node.slice()
    copy[index] = applyOne(copy[index], rest, op)
    return copy
  }
  const copy: JsonObject = isObject(node) ? { ...node } : {}
  if (rest.length === 0 && op.op === 'del') {
    delete copy[key]
  } else {
    copy[key] = applyOne(copy[key], rest, op)
  }
  return copy
}
