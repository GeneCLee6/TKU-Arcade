import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import styled from 'styled-components'
import type { Fork } from '../../shared/kart/branches.ts'
import { trackBounds, type Gate, type RoadPoint } from '../../shared/kart/track.ts'
import type { Wall } from '../../shared/kart/walls.ts'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import type { MessageParams } from '../i18n/t.ts'
import { color } from '../styles/tokens.ts'
import { kartScene } from '../styles/kartTokens.ts'

/** Moves the car's marker without a React render: the loop calls it every frame */
export interface MinimapHandle {
  place(x: number, z: number, heading: number, nextGate: number): void
  /** 2026-11-18: where the other karts are (those in `dots`), every frame */
  others?(karts: readonly { readonly seat: number; readonly x: number; readonly z: number }[]): void
}

interface MinimapProps {
  t: (key: KartMessageKey, params?: MessageParams) => string
  road: readonly RoadPoint[]
  gates: readonly Gate[]
  /** Walls on the road beyond its kerbs (N2: the old street's stall island), drawn over it */
  walls?: readonly Wall[]
  /**
   * 2026-11-18, a team race: a dot for each other kart, in its team's colour, moved by the handle's
   * `others`. Left out, only this kart is on the map
   */
  dots?: readonly { readonly seat: number; readonly fill: string }[]
  /**
   * 2026-11-20: the track's branches (shared/kart/branches.ts), each drawn as a road of its own, and
   * the next gate's stand-in on each marked with it
   */
  forks?: readonly Fork[]
}

/** Room around the road, metres */
const MARGIN = 6

/**
 * The track from above (e8-t09), drawn from the same JSON the physics drives on: the road at its
 * width, the finish line, the next gate, and the car. North is -z, up the screen, like the track's
 * own coordinates; it does not turn with the car.
 */
export const Minimap = forwardRef<MinimapHandle, MinimapProps>(function Minimap(
  { t, road, gates, walls = [], dots = [], forks },
  ref,
) {
  const box = useMemo(() => trackBounds({ road, forks }), [road, forks])
  const car = useRef<SVGGElement>(null)
  const next = useRef<SVGLineElement>(null)
  const nextOnForks = useRef<SVGPathElement>(null)
  const forkPaths = useMemo(
    () =>
      (forks ?? []).map((fork) => ({
        d: `M${fork.path.map((point) => `${point.x.toFixed(1)} ${point.z.toFixed(1)}`).join('L')}`,
        width: fork.path.reduce((sum, point) => sum + point.width, 0) / fork.path.length,
      })),
    [forks],
  )
  const dotLayer = useRef<SVGGElement>(null)
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
        if (forks && nextOnForks.current) {
          const stands = forks.flatMap((fork) => {
            const at = nextGate - fork.first
            const line = at >= 0 && at < fork.count ? fork.gates[at] : undefined
            return line ? [`M${line.ax} ${line.az}L${line.bx} ${line.bz}`] : []
          })
          nextOnForks.current.setAttribute('d', stands.join(''))
        }
      },
      others(karts) {
        const layer = dotLayer.current
        if (!layer) return
        for (const kart of karts) {
          const dot = layer.querySelector(`[data-dot="${kart.seat}"]`)
          if (!dot) continue
          dot.setAttribute('cx', kart.x.toFixed(1))
          dot.setAttribute('cy', kart.z.toFixed(1))
          dot.setAttribute('visibility', 'visible')
        }
      },
    }),
    [gates, forks],
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
        {forkPaths.map((fork, index) => (
          <path
            key={index}
            d={fork.d}
            fill="none"
            stroke={kartScene.road}
            strokeWidth={fork.width}
            strokeLinejoin="round"
            data-testid="kart-minimap-branch"
          />
        ))}
        <path
          d={path}
          fill="none"
          stroke={kartScene.roadLine}
          strokeWidth={1.5}
          strokeDasharray="6 6"
        />
        {walls.map((wall, index) => (
          <line
            key={index}
            x1={wall.ax}
            y1={wall.az}
            x2={wall.bx}
            y2={wall.bz}
            stroke={kartScene.barrier}
            strokeWidth={4}
            strokeLinecap="round"
          />
        ))}
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
        {forks && <path ref={nextOnForks} stroke={kartScene.nextGate} strokeWidth={2.5} />}
        <g ref={dotLayer}>
          {dots.map((dot) => (
            <circle
              key={dot.seat}
              data-dot={dot.seat}
              r={5}
              fill={dot.fill}
              stroke={kartScene.nose}
              strokeWidth={1}
              visibility="hidden"
            />
          ))}
        </g>
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

  /* A phone held sideways: smaller, so that it clears the speed and boost panels */
  @media (max-height: 500px) {
    width: 88px;
    height: 88px;
  }
  background: color-mix(in srgb, ${color.bg} 55%, transparent);
  box-shadow: 0 0 0 1px ${color.line};

  & > svg {
    display: block;
    width: 100%;
    height: 100%;
  }
`
