import { describe, expect, it } from 'vitest'
import { buildSpec } from '../../shared/kart/editor/build.ts'
import { decodeSpec, encodeSpec, specHash } from '../../shared/kart/editor/codec.ts'
import { customTrack } from '../../shared/kart/editor/custom.ts'
import {
  boomPiece,
  overpass,
  sliderPiece,
  starterSpec,
  straight,
  turn,
  type TrackSpec,
} from '../../shared/kart/editor/spec.ts'
import { inObstacle, obstaclesOf } from '../../shared/kart/obstacles.ts'

// 2026-11-23 (#150): the editor's barriers and sliding containers: their code, the obstacles they
// make, and where they may not go (a crossing, the start and the grid, a respawn point)

/** The starter loop with its long back straight (piece 4) made into an obstacle */
const withObstacle = (piece: TrackSpec['pieces'][number]): TrackSpec => {
  const spec = starterSpec()
  return { ...spec, pieces: spec.pieces.map((one, index) => (index === 4 ? piece : one)) }
}

describe('obstacle pieces in a code', () => {
  it('go there and back; every older code reads and hashes as before', () => {
    const spec = withObstacle(boomPiece(240, 36, 'left', 7.5, 2.5))
    expect(decodeSpec(encodeSpec(spec))).toEqual(spec)
    const sliding = withObstacle(sliderPiece(240, 36, 6, 0))
    expect(decodeSpec(encodeSpec(sliding))).toEqual(sliding)
    const plain = starterSpec()
    expect(decodeSpec(encodeSpec(plain))).toEqual(plain)
    expect(specHash(spec.pieces)).not.toBe(specHash(plain.pieces))
  })

  it('refuse a cycle out of range or a start not within it', () => {
    const code = (tuple: unknown[]) =>
      btoa(JSON.stringify({ v: 1, n: '', t: 'day', p: [tuple, ['s', 100, 36, 0, 0], ['s', 100, 36, 0, 0]] }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    expect(decodeSpec(code(['g', 80, 36, 0, 8, 2]))).not.toBeNull()
    expect(decodeSpec(code(['g', 80, 36, 0, 2, 0]))).toBeNull()
    expect(decodeSpec(code(['g', 80, 36, 0, 21, 0]))).toBeNull()
    expect(decodeSpec(code(['g', 80, 36, 0, 8, 8]))).toBeNull()
    expect(decodeSpec(code(['g', 80, 36, 3, 8, 0]))).toBeNull()
    expect(decodeSpec(code(['c', 80, 36, 6, 1]))).not.toBeNull()
    expect(decodeSpec(code(['c', 30, 36, 6, 1]))).toBeNull()
  })
})

describe('obstacle pieces on a track', () => {
  it('a barrier and a container at their pieces’ middles, legal as any track file', () => {
    for (const piece of [boomPiece(240, 36, 'full', 8, 0), boomPiece(240, 36, 'right', 5, 1), sliderPiece(240, 36, 6, 0)]) {
      const spec = withObstacle(piece)
      const built = buildSpec(spec)
      expect(built.problems).toEqual([])
      expect(built.track.obstacles).toHaveLength(1)
      const made = customTrack(encodeSpec(spec))
      expect(made.ok).toBe(true)
      if (!made.ok) continue
      const [obstacle] = obstaclesOf(made.track)
      // No pad or boxes on its piece, and no respawn point in its way
      for (const respawn of made.track.respawns) {
        expect(inObstacle(obstacle!, respawn.x, respawn.z, 4)).toBe(false)
      }
    }
  })

  it('a barrier over the whole road closes it, a half one leaves the other half', () => {
    const full = buildSpec(withObstacle(boomPiece(240, 36, 'full'))).track.obstacles![0]!
    const left = buildSpec(withObstacle(boomPiece(240, 36, 'left'))).track.obstacles![0]!
    expect(full.kind === 'boom' && full.from < -18 && full.to > 18).toBe(true)
    expect(left.kind === 'boom' && left.from < -18 && left.to === 0).toBe(true)
  })

  it('not at the start or on the grid behind it', () => {
    const spec = starterSpec()
    const first = buildSpec({ ...spec, pieces: [boomPiece(80, 36), straight(40), ...spec.pieces.slice(1)] })
    expect(first.problems.map((one) => one.code)).toContain('obstacle')
    expect(first.problems.find((one) => one.code === 'obstacle')!.pieces).toEqual([0])
    const last = buildSpec({ ...spec, pieces: [...spec.pieces.slice(0, -1), straight(40), sliderPiece(80, 36)] })
    expect(last.problems.find((one) => one.code === 'obstacle')!.pieces).toEqual([9])
    expect(customTrack(encodeSpec({ ...spec, pieces: [boomPiece(80, 36), straight(40), ...spec.pieces.slice(1)] })).ok).toBe(false)
  })

  it('not where the road crosses itself', () => {
    const eight = (lower: TrackSpec['pieces']): TrackSpec => ({
      name: 'eight',
      theme: 'day',
      pieces: [overpass(240, 6, 36), turn(270, 120, 36), ...lower, turn(-270, 120, 36)],
    })
    expect(buildSpec(eight([straight(80), straight(80), straight(80)])).problems).toEqual([])
    const crossed = buildSpec(eight([straight(80), boomPiece(80, 36), straight(80)]))
    expect(crossed.problems.find((one) => one.code === 'obstacle')?.pieces).toEqual([3])
  })
})
