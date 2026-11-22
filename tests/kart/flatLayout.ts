// 2026-11-22: a built-in track's layout as it was before its steps, branches and moving obstacles
// were added (#103): the same road, flat, its main gates every seventh road point as they were laid,
// and only the walls without a top. For the tests that lock the physics on a layout (flatGolden,
// expert.test.ts): what they lock is the flat physics, not the track's newer parts.
import { gatesAlong, type TrackJson } from '../../shared/kart/track.ts'

export function flatLayout(json: TrackJson): TrackJson {
  const road = json.road.map(({ x, z, width }) => ({ x, z, width }))
  return {
    ...json,
    road,
    jumps: undefined,
    branches: undefined,
    obstacles: undefined,
    walls: json.walls.filter((wall) => wall.top === undefined),
    // A track with branches had its gates moved off them (gatesClearOf): laid again, as they were
    ...(json.branches ? gatesAlong(road, 7) : {}),
  }
}
