// e10-t07: the editor's live map, from above: each piece's road at its width (the selected piece in
// the accent, pieces with a problem in red), the start line, the grid, boost pads, item boxes and
// an arrow for the way round. North (-z) is up, as on the minimap. A press on a piece selects it;
// the piece list does the same for the keyboard.
import { memo, useMemo } from 'react'
import styled from 'styled-components'
import type { Built } from '../../../shared/kart/editor/build.ts'
import { roadDirection } from '../../../shared/kart/track.ts'
import { kartEditor } from '../../styles/kartTokens.ts'

interface MapViewProps {
  readonly built: Built
  readonly selected: number
  readonly faulty: ReadonlySet<number>
  readonly label: string
  onSelect(piece: number): void
}

/** Room round the road, metres */
const MARGIN = 30

const point = (x: number, z: number) => `${x.toFixed(1)} ${z.toFixed(1)}`

export const MapView = memo(function MapView({
  built,
  selected,
  faulty,
  label,
  onSelect,
}: MapViewProps) {
  const { track, laid } = built
  const road = track.road

  // Each piece as one path of quads, kerb to kerb, so that it can be coloured and pressed alone
  const pieces = useMemo(() => {
    const edges = road.map((p, index) => {
      const { dx, dz } = roadDirection(road, index)
      const half = p.width / 2
      return {
        left: { x: p.x + dz * half, z: p.z - dx * half },
        right: { x: p.x - dz * half, z: p.z + dx * half },
      }
    })
    const paths = new Map<number, string[]>()
    road.forEach((_, index) => {
      const owner = laid.pieceOf[index]!
      const a = edges[index]!
      const b = edges[(index + 1) % road.length]!
      const quad = `M${point(a.left.x, a.left.z)}L${point(b.left.x, b.left.z)}L${point(b.right.x, b.right.z)}L${point(a.right.x, a.right.z)}Z`
      const list = paths.get(owner) ?? []
      list.push(quad)
      paths.set(owner, list)
    })
    return [...paths].map(([piece, quads]) => ({ piece, d: quads.join('') }))
  }, [road, laid])

  const box = useMemo(() => {
    const xs = road.flatMap((p) => [p.x - p.width / 2, p.x + p.width / 2])
    const zs = road.flatMap((p) => [p.z - p.width / 2, p.z + p.width / 2])
    // The joints too: an open track's last piece may end far from the road
    for (const joint of laid.joints) {
      xs.push(joint.x)
      zs.push(joint.z)
    }
    const minX = Math.min(...xs, 0) - MARGIN
    const minZ = Math.min(...zs, 0) - MARGIN
    const maxX = Math.max(...xs, 0) + MARGIN
    const maxZ = Math.max(...zs, 0) + MARGIN
    return { minX, minZ, width: maxX - minX, height: maxZ - minZ }
  }, [road, laid])

  const scale = Math.max(box.width, box.height) / 400
  const finish = track.gates[0]
  const end = laid.joints[laid.joints.length - 1]!

  return (
    <Svg
      viewBox={`${box.minX} ${box.minZ} ${box.width} ${box.height}`}
      role="img"
      aria-label={label}
      data-testid="kart-editor-map"
    >
      <rect
        x={box.minX}
        y={box.minZ}
        width={box.width}
        height={box.height}
        fill={kartEditor.ground}
      />
      {pieces.map(({ piece, d }) => (
        <path
          key={piece}
          d={d}
          fill={
            faulty.has(piece)
              ? kartEditor.problem
              : piece === selected
                ? kartEditor.selected
                : kartEditor.road
          }
          stroke={
            faulty.has(piece)
              ? kartEditor.problem
              : piece === selected
                ? kartEditor.selected
                : kartEditor.road
          }
          strokeWidth={0.6}
          onClick={() => onSelect(piece)}
          data-piece={piece}
        />
      ))}
      {/* Where each piece meets the next */}
      {laid.joints.slice(1, -1).map((joint, index) => (
        <circle key={index} cx={joint.x} cy={joint.z} r={1.6 * scale} fill={kartEditor.joint} />
      ))}
      {track.boostPads.map((pad, index) => (
        <rect
          key={`pad-${index}`}
          x={pad.x - pad.width / 2}
          y={pad.z - pad.length / 2}
          width={pad.width}
          height={pad.length}
          fill={kartEditor.pad}
          transform={`rotate(${(pad.heading * 180) / Math.PI} ${pad.x} ${pad.z})`}
        />
      ))}
      {track.itemBoxes.map((itemBox, index) => (
        <rect
          key={`box-${index}`}
          x={itemBox.x - 1.6}
          y={itemBox.z - 1.6}
          width={3.2}
          height={3.2}
          fill={kartEditor.box}
        />
      ))}
      {track.grid.map((spot, index) => (
        <rect
          key={`grid-${index}`}
          x={spot.x - 1.2}
          y={spot.z - 2}
          width={2.4}
          height={4}
          fill={kartEditor.grid}
          transform={`rotate(${(spot.heading * 180) / Math.PI} ${spot.x} ${spot.z})`}
        />
      ))}
      {finish && (
        <line
          x1={finish.ax}
          y1={finish.az}
          x2={finish.bx}
          y2={finish.bz}
          stroke={kartEditor.finish}
          strokeWidth={2.5 * scale}
        />
      )}
      {/* The way round: an arrow at the start, facing up the first piece */}
      <path
        d={`M0 ${-24 * scale}L${-6 * scale} ${-12 * scale}L${6 * scale} ${-12 * scale}Z`}
        fill={kartEditor.arrow}
      />
      {/* Where the last piece ends: on the start line when the loop is closed */}
      <circle
        cx={end.x}
        cy={end.z}
        r={4 * scale}
        fill="none"
        stroke={faulty.size > 0 ? kartEditor.problem : kartEditor.joint}
        strokeWidth={1.5 * scale}
      />
    </Svg>
  )
})

const Svg = styled.svg`
  display: block;
  background: ${kartEditor.ground};
  width: 100%;
  height: 100%;
  touch-action: manipulation;

  path[data-piece] {
    cursor: pointer;
  }
`
