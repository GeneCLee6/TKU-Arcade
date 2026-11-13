import { describe, expect, it } from 'vitest'
import { passGates, resetRun, startRun, stepRun, type Run } from '../../shared/kart/course.ts'
import type { KartInput } from '../../shared/kart/physics.ts'
import {
  courseOf,
  gateCrossing,
  gatesAlong,
  kerbs,
  parseTrack,
  trackBounds,
  type Track,
} from '../../shared/kart/track.ts'
import { TEST_OVAL } from '../../shared/kart/tracks/testOval.ts'
import { headingOfNode, trackFromGltf, type Gltf } from '../../scripts/kart/gltfTrack.ts'

// e8-t04 (AC-8.2): the track format, its gates and respawns, and the glTF export

const oval = (): Track => {
  const parsed = parseTrack(TEST_OVAL)
  if ('problems' in parsed) throw new Error(parsed.problems.join('; '))
  return parsed.track
}

describe('parseTrack', () => {
  it('takes the test oval and works out its kerbs', () => {
    const track = oval()
    expect(track.allWalls).toHaveLength(TEST_OVAL.road.length * 2)
    expect(track.gates).toHaveLength(track.respawns.length)
    // JSON in, JSON out: what a file holds is what the game reads
    expect(parseTrack(JSON.parse(JSON.stringify(TEST_OVAL)))).toEqual({ track })
  })

  it('lists every problem at once', () => {
    const broken = {
      ...TEST_OVAL,
      format: 2,
      id: 'Test Oval',
      laps: 0,
      road: TEST_OVAL.road.slice(0, 3),
      respawns: [],
      grid: [],
      decor: [{ x: 0, z: 0, heading: 0, scale: 1, model: '../../evil' }],
    }
    const result = parseTrack(broken)
    expect('problems' in result && result.problems).toEqual(
      expect.arrayContaining([
        'format: must be 1',
        'id: lower-case letters, digits and dashes',
        'laps: a whole number from 1 to 20',
        'road: at least 4 points',
        'respawns: one for each gate',
        'grid: at least one place',
        'decor[0]: model must be an asset id',
      ]),
    )
  })

  it('refuses what is not a track at all', () => {
    expect(parseTrack(null)).toEqual({ problems: ['not an object'] })
    expect('problems' in parseTrack({ ...TEST_OVAL, road: 'round' })).toBe(true)
    const narrow = { ...TEST_OVAL, road: TEST_OVAL.road.map((point) => ({ ...point, width: 2 })) }
    expect('problems' in parseTrack(narrow)).toBe(true)
  })
})

describe('gates', () => {
  const gate = { ax: -5, az: 0, bx: 5, bz: 0 }

  it('tells forwards from backwards, and passing beside from crossing', () => {
    // a (-x) on the left kerb, b (+x) on the right: a driver going the right way faces -z
    expect(gateCrossing(gate, 0, 1, 0, -1)).toBe(1)
    expect(gateCrossing(gate, 0, -1, 0, 1)).toBe(-1)
    expect(gateCrossing(gate, 8, 1, 8, -1)).toBe(0)
    expect(gateCrossing(gate, 0, 2, 0, 1)).toBe(0)
    // Stopping on the line counts, leaving it again does not count a second time
    expect(gateCrossing(gate, 0, 1, 0, 0)).toBe(1)
    expect(gateCrossing(gate, 0, 0, 0, -1)).toBe(0)
  })

  it('makes gates across the road that a car driving along it crosses forwards', () => {
    const { road } = TEST_OVAL
    const { gates, respawns } = gatesAlong(road, 6)
    expect(gates).toHaveLength(Math.ceil(road.length / 6))
    gates.forEach((made, index) => {
      const at = road[index * 6]!
      const before = road[(index * 6 - 1 + road.length) % road.length]!
      const after = road[(index * 6 + 1) % road.length]!
      expect(gateCrossing(made, before.x, before.z, after.x, after.z), `gate ${index}`).toBe(1)
      expect(respawns[index]).toMatchObject({ x: at.x, z: at.z })
    })
  })

  it('counts gates only in order, lap lines included, and undoes one crossed backwards', () => {
    const track = oval()
    const checkpoints = courseOf(track).checkpoints!
    const start = track.grid[0]!
    const road = track.road
    let progress = { nextGate: 0, crossings: 0, safe: start }
    const drive = (from: number, to: number) => {
      for (let index = from; index < to; index++) {
        const a = road[index % road.length]!
        const b = road[(index + 1) % road.length]!
        progress = passGates(progress, a, b, checkpoints, start)
      }
    }
    // From just behind the line, once round and a bit
    progress = passGates(progress, { x: road[0]!.x, z: road[0]!.z + 1 }, road[1]!, checkpoints, start)
    expect(progress).toMatchObject({ nextGate: 1, crossings: 1 })
    drive(1, road.length + 1)
    expect(progress).toMatchObject({ nextGate: 1, crossings: 2 })
    expect(progress.safe).toEqual(track.respawns[0])
    // Back over the finish line: the lap is not counted twice when it goes forwards again
    progress = passGates(progress, road[1]!, road[road.length - 1]!, checkpoints, start)
    expect(progress).toMatchObject({ nextGate: 0, crossings: 1 })
    progress = passGates(progress, road[road.length - 1]!, road[1]!, checkpoints, start)
    expect(progress).toMatchObject({ nextGate: 1, crossings: 2 })
    // Skipping a gate (a shortcut across the infield) does not count the ones after it
    const far = road[30]!
    const further = road[31]!
    expect(passGates(progress, far, further, checkpoints, start)).toBe(progress)
  })
})

describe('driving the test oval', () => {
  /** Steers at the road a few points ahead: enough to go round, not a racing line */
  function autopilot(run: Run, road: readonly { x: number; z: number }[]): KartInput {
    let nearest = 0
    road.forEach((point, index) => {
      const best = road[nearest]!
      if (Math.hypot(point.x - run.kart.x, point.z - run.kart.z) < Math.hypot(best.x - run.kart.x, best.z - run.kart.z)) {
        nearest = index
      }
    })
    const target = road[(nearest + 3) % road.length]!
    const want = Math.atan2(target.x - run.kart.x, -(target.z - run.kart.z))
    let turn = want - run.kart.heading
    while (turn > Math.PI) turn -= 2 * Math.PI
    while (turn < -Math.PI) turn += 2 * Math.PI
    return {
      throttle: true,
      brake: false,
      steer: Math.max(-1, Math.min(1, turn * 3)),
      drift: false,
      boost: false,
    }
  }

  it('goes round, counts the laps, and a reset puts the car at the last gate', () => {
    const track = oval()
    const course = courseOf(track)
    let run = startRun(course)
    let steps = 0
    while (run.crossings < 3 && steps < 60 * 120) {
      run = stepRun(run, autopilot(run, track.road), course)
      steps++
    }
    expect(run.crossings).toBe(3)
    // Two laps of about 650 m at up to 30 m/s: well under two minutes
    expect(steps / 60).toBeLessThan(90)
    const passed = (run.nextGate - 1 + track.gates.length) % track.gates.length
    expect(run.safe).toEqual(track.respawns[passed])
    const back = resetRun(run)
    expect(back.kart).toMatchObject({ x: run.safe.x, z: run.safe.z, heading: run.safe.heading })
    expect(back.crossings).toBe(3)
  })
})

describe('the minimap bounds', () => {
  it('hold the road and its kerbs', () => {
    const track = oval()
    const box = trackBounds(track)
    for (const wall of kerbs(track.road)) {
      expect(wall.ax).toBeGreaterThanOrEqual(box.minX - 1e-9)
      expect(wall.ax).toBeLessThanOrEqual(box.maxX + 1e-9)
      expect(wall.az).toBeGreaterThanOrEqual(box.minZ - 1e-9)
      expect(wall.az).toBeLessThanOrEqual(box.maxZ + 1e-9)
    }
  })
})

describe('build-track: a track from a glTF scene', () => {
  const empty = (name: string, x: number, z: number, extras?: Record<string, unknown>) => ({
    name,
    translation: [x, 0, z] as [number, number, number],
    ...(extras ? { extras } : {}),
  })
  // A square loop, 100 m a side, driven up its left side first
  const square: [number, number][] = []
  for (let z = 50; z > -50; z -= 10) square.push([-50, z])
  for (let x = -50; x < 50; x += 10) square.push([x, -50])
  for (let z = -50; z < 50; z += 10) square.push([50, z])
  for (let x = 50; x > -50; x -= 10) square.push([x, 50])
  // Rotated 90° clockwise about +Y in glTF: -Z turns to -X
  const quarter = [0, Math.SQRT1_2, 0, Math.SQRT1_2] as [number, number, number, number]
  const gltf: Gltf = {
    scenes: [{ nodes: [], extras: { gateEvery: 10 } }],
    nodes: [
      // Out of order on purpose: the numbers give the order
      ...square.map(([x, z], index) => empty(`road.${String(index).padStart(3, '0')}`, x, z, { width: 10 })).reverse(),
      { ...empty('grid.0', -50, 58) },
      { ...empty('grid.1', -45, 64), rotation: quarter },
      empty('wall.island.000', -10, -10, { closed: true }),
      empty('wall.island.001', 10, -10),
      empty('wall.island.002', 10, 10),
      empty('wall.island.003', -10, 10),
      empty('item.0', 0, -50),
      { ...empty('decor.lamp-post.0', 60, 0), scale: [2, 2, 2] },
      { name: 'Camera' },
    ],
  }
  gltf.scenes![0]!.nodes = gltf.nodes!.map((_, index) => index)
  const meta = { id: 'square', name: { en: 'Square', 'zh-TW': '方形' }, laps: 2 }

  it('reads the road, the grid, the walls and the rest by their names', () => {
    const json = trackFromGltf(gltf, meta)
    expect(json.road).toHaveLength(square.length)
    expect(json.road[0]).toEqual({ x: -50, z: 50, width: 10 })
    expect(json.gates).toHaveLength(square.length / 10)
    expect(json.grid.map((spot) => Math.round(spot.heading * 100) / 100)).toEqual([0, -1.57])
    expect(json.walls).toHaveLength(4)
    expect(json.itemBoxes).toEqual([{ x: 0, z: -50 }])
    expect(json.decor).toEqual([{ x: 60, z: 0, heading: 0, model: 'lamp-post', scale: 2 }])
    expect('track' in parseTrack(json)).toBe(true)
  })

  it('puts gates where the scene says, across the road there', () => {
    const withGates: Gltf = {
      ...gltf,
      nodes: [...gltf.nodes!, empty('gate.00', -50, 40), empty('gate.01', 50, 0)],
    }
    withGates.scenes = [{ nodes: withGates.nodes!.map((_, index) => index) }]
    const json = trackFromGltf(withGates, meta)
    expect(json.gates).toHaveLength(2)
    // Up the left side (-z): the gate runs from the left kerb (-x) to the right (+x)
    expect(json.gates[0]).toEqual({ ax: -55, az: 40, bx: -45, bz: 40 })
    expect(gateCrossing(json.gates[0]!, -50, 45, -50, 35)).toBe(1)
    expect(json.respawns[1]).toMatchObject({ x: 50, z: 0 })
  })

  it('turns a node to the heading the game uses', () => {
    expect(headingOfNode({})).toBe(0)
    expect(headingOfNode({ rotation: quarter })).toBeCloseTo(-Math.PI / 2)
  })
})
