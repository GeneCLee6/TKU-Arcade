import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import styled from 'styled-components'
import { trackBounds, type Gate, type RoadPoint } from '../../shared/kart/track.ts'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import type { MessageParams } from '../i18n/t.ts'
import { color } from '../styles/tokens.ts'
import { kartScene } from '../styles/kartTokens.ts'

/** Moves the car's marker without a React render: the loop calls it every frame */
export interface MinimapHandle {
  place(x: number, z: number, heading: number, nextGate: number): void
}

interface MinimapProps {
  t: (key: KartMessageKey, params?: MessageParams) => string
  road: readonly RoadPoint[]
  gates: readonly Gate[]
}

/** Room around the road, metres */
const MARGIN = 6

/**
 * The track from above (e8-t09), drawn from the same JSON the physics drives on: the road at its
 * width, the finish line, the next gate, and the car. North is -z, up the screen, like the track's
 * own coordinates; it does not turn with the car.
 */
export const Minimap = forwardRef<MinimapHandle, MinimapProps>(function Minimap(
  { t, road, gates },
  ref,
) {
  const box = useMemo(() => trackBounds({ road }), [road])
  const car = useRef<SVGGElement>(null)
  const next = useRef<SVGLineElement>(null)
  const path = useMemo(
    () => `M${road.map((point) => `${point.x.toFixed(1)} ${point.z.toFixed(1)}`).join('L')}Z`,
    [road],
  )
  const width = road.reduce((sum, point) => sum + point.width, 0) / Math.max(1, road.length)

  useImperativeHandle(
    ref,
    () => ({
      place(x, z, heading, nextGate) {
        car.current?.setAttribute(
          'transform',
          `translate(${x.toFixed(1)} ${z.toFixed(1)}) rotate(${((heading * 180) / Math.PI).toFixed(0)})`,
        )
        const gate = gates[nextGate]
        if (gate && next.current) {
          next.current.setAttribute('x1', String(gate.ax))
          next.current.setAttribute('y1', String(gate.az))
          next.current.setAttribute('x2', String(gate.bx))
          next.current.setAttribute('y2', String(gate.bz))
        }
      },
    }),
    [gates],
  )

  const finish = gates[0]
  const viewBox = [
    box.minX - MARGIN,
    box.minZ - MARGIN,
    box.maxX - box.minX + 2 * MARGIN,
    box.maxZ - box.minZ + 2 * MARGIN,
  ]
  return (
    <Frame role="img" aria-label={t('kart.hud.minimap')} data-testid="kart-minimap">
      <svg viewBox={viewBox.join(' ')} preserveAspectRatio="xMidYMid meet">
        <path
          d={path}
          fill="none"
          stroke={kartScene.road}
          strokeWidth={width}
          strokeLinejoin="round"
        />
        <path
          d={path}
          fill="none"
          stroke={kartScene.roadLine}
          strokeWidth={1.5}
          strokeDasharray="6 6"
        />
        {finish && (
          <line
            x1={finish.ax}
            y1={finish.az}
            x2={finish.bx}
            y2={finish.bz}
            stroke={kartScene.finish}
            strokeWidth={3}
          />
        )}
        <line ref={next} stroke={kartScene.nextGate} strokeWidth={2.5} />
        <g ref={car}>
          {/* An arrow pointing -z (heading 0) */}
          <path
            d="M0 -7L5 5L0 2L-5 5Z"
            fill={kartScene.body}
            stroke={kartScene.nose}
            strokeWidth={1.2}
          />
        </g>
      </svg>
    </Frame>
  )
})

const Frame = styled.div`
  width: 132px;
  height: 132px;
  padding: 4px;
  background: color-mix(in srgb, ${color.bg} 55%, transparent);
  box-shadow: 0 0 0 1px ${color.line};

  & > svg {
    display: block;
    width: 100%;
    height: 100%;
  }
`
