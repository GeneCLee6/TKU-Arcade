// A test track for J4 (e8-t04): a stadium-shaped loop, written in code with the track format, so
// that checkpoints, respawns, laps and the minimap have something to run on before the first real
// track (e8-t05a). Original and plain on purpose: two 160 m straights joined by half circles of
// 50 m radius, 14 m wide; the start on the left-hand straight, heading up it (towards -z).
import { gatesAlong, headingOf, TRACK_FORMAT, type RoadPoint, type TrackJson } from '../track.ts'

const STRAIGHT = 160
const RADIUS = 50
const WIDTH = 14
/** About one road point every 8 m */
const STEP = 8

function centreLine(): RoadPoint[] {
  const points: RoadPoint[] = []
  const half = STRAIGHT / 2
  const arcSteps = Math.round((Math.PI * RADIUS) / STEP)
  // Up the left straight (x = -RADIUS) towards -z
  for (let z = half; z > -half; z -= STEP) points.push({ x: -RADIUS, z, width: WIDTH })
  // Round the far end, centred on (0, -half), over to the right straight
  for (let i = 0; i < arcSteps; i++) {
    const angle = Math.PI - (Math.PI * i) / arcSteps
    points.push({ x: RADIUS * Math.cos(angle), z: -half - RADIUS * Math.sin(angle), width: WIDTH })
  }
  // Down the right straight towards +z
  for (let z = -half; z < half; z += STEP) points.push({ x: RADIUS, z, width: WIDTH })
  // Round the near end, centred on (0, half), back to the left straight
  for (let i = 0; i < arcSteps; i++) {
    const angle = (Math.PI * i) / arcSteps
    points.push({ x: RADIUS * Math.cos(angle), z: half + RADIUS * Math.sin(angle), width: WIDTH })
  }
  return points
}

const road = centreLine()
const { gates, respawns } = gatesAlong(road, 6)
// Along the straight it starts on, not bent towards the curve before it
const pole = { dx: road[1]!.x - road[0]!.x, dz: road[1]!.z - road[0]!.z }

export const TEST_OVAL: TrackJson = {
  format: TRACK_FORMAT,
  id: 'test-oval',
  name: { en: 'Test oval', 'zh-TW': '測試橢圓' },
  laps: 3,
  road,
  gates,
  respawns,
  // Two by two behind the line, 6 m apart
  grid: [0, 1, 2, 3, 4, 5].map((slot) => ({
    x: road[0]!.x + (slot % 2 === 0 ? -3 : 3),
    z: road[0]!.z + 8 + Math.floor(slot / 2) * 6,
    heading: headingOf(pole),
  })),
  walls: [],
  boostPads: [],
  itemBoxes: [],
  decor: [],
}
