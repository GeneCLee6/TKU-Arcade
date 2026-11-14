// Shared by the track tests: measuring a road's shape
type Road = readonly { x: number; z: number }[]
const cumulative = new WeakMap<Road, { at: number[]; total: number }>()

/** How far apart road points i and j are along the road, the shorter way round, metres */
export function alongRoad(road: Road, i: number, j: number): number {
  let known = cumulative.get(road)
  if (!known) {
    const at: number[] = []
    let total = 0
    road.forEach((point, index) => {
      at.push(total)
      const next = road[(index + 1) % road.length]!
      total += Math.hypot(next.x - point.x, next.z - point.z)
    })
    known = { at, total }
    cumulative.set(road, known)
  }
  const forward = Math.abs(known.at[j]! - known.at[i]!)
  return Math.min(forward, known.total - forward)
}

/**
 * Sharp corners: places where the road's direction swings round by more than `degrees` within
 * `span` metres (each counted once)
 */
export function sharpCorners(road: Road, span: number, degrees: number): number {
  const n = road.length
  const heading = (i: number) => {
    const a = road[i % n]!
    const b = road[(i + 1) % n]!
    return Math.atan2(b.x - a.x, b.z - a.z)
  }
  let count = 0
  let skip = 0
  for (let i = 0; i < n; i++) {
    if (skip > 0) {
      skip--
      continue
    }
    let distance = 0
    let j = i
    while (distance < span) {
      const a = road[j % n]!
      const b = road[(j + 1) % n]!
      distance += Math.hypot(b.x - a.x, b.z - a.z)
      j++
    }
    let turn = Math.abs(heading(j) - heading(i))
    if (turn > Math.PI) turn = 2 * Math.PI - turn
    if (turn > (degrees * Math.PI) / 180) {
      count++
      skip = j - i
    }
  }
  return count
}
