import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import styled from 'styled-components'
import type { Fork } from '../../shared/kart/branches.ts'
import { findCrossings } from '../../shared/kart/levels.ts'
import {
  besideObstacle,
  obstacleState,
  obstaclesOf,
  sliderCorners,
  type Obstacle,
  type ObstacleJson,
} from '../../shared/kart/obstacles.ts'
import { trackBounds, type Gate, type RoadPoint } from '../../shared/kart/track.ts'
import type { Wall } from '../../shared/kart/walls.ts'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import type { MessageParams } from '../i18n/t.ts'
import { color } from '../styles/tokens.ts'
import { kartScene, obstacleScene } from '../styles/kartTokens.ts'

/** Moves the car's marker without a React render: the loop calls it every frame */
export interface MinimapHandle {
  /**
   * `tick` (2026-11-23): the race clock, steps since GO, by which the moving obstacles are drawn
   * down or up, held or sliding; left out, they stay as they were last drawn
   */
  place(x: number, z: number, heading: number, nextGate: number, tick?: number): void
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
  /**
   * 2026-11-23 (#143): the track's moving obstacles (shared/kart/obstacles.ts): each barrier's line
   * and each container where it is, coloured by what it is doing at the race clock `place` is given
   */
  obstacles?: readonly ObstacleJson[]
}

/** Room around the road, metres */
const MARGIN = 6

/**
 * The track from above (e8-t09), drawn from the same JSON the physics drives on: the road at its
 * width, the finish line, the next gate, and the car. North is -z, up the screen, like the track's
 * own coordinates; it does not turn with the car.
 */
export const Minimap = forwardRef<MinimapHandle, MinimapProps>(function Minimap(
  { t, road, gates, walls = [], dots = [], forks, obstacles: obstacleList },
  ref,
) {
  const obstacles = useMemo(
    () => obstaclesOf({ road, ...(obstacleList ? { obstacles: obstacleList } : {}) }),
    [road, obstacleList],
  )
  const obstacleLayer = useRef<SVGGElement>(null)
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
  // 2026-11-22 (shared/kart/levels.ts): where the road runs over itself, the stretch on top drawn
  // again over the one beneath, edged, so that the map shows which goes over
  const overpasses = useMemo(() => {
    const crossings = findCrossings(road, [])
    const count = road.length
    return crossings.map((crossing) => {
      const near = (index: number) => {
        const point = road[((index % count) + count) % count]!
        return Math.hypot(point.x - crossing.x, point.z - crossing.z) < crossing.reach + 12
      }
      let first = crossing.upper
      while (near(first - 1) && crossing.upper - first < count) first--
      let last = crossing.upper + 1
      while (near(last + 1) && last - crossing.upper < count) last++
      const points = Array.from({ length: last - first + 1 }, (_, k) => road[(((first + k) % count) + count) % count]!)
      return `M${points.map((point) => `${point.x.toFixed(1)} ${point.z.toFixed(1)}`).join('L')}`
    })
  }, [road])

  useImperativeHandle(
    ref,
    () => ({
      place(x, z, heading, nextGate, tick) {
        if (tick !== undefined && obstacleLayer.current) drawObstacles(obstacleLayer.current, obstacles, tick)
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
    [gates, forks, obstacles],
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
        {overpasses.map((d, index) => (
          <g key={index} data-testid="kart-minimap-overpass">
            <path d={d} fill="none" stroke={kartScene.nose} strokeWidth={width + 6} />
            <path d={d} fill="none" stroke={kartScene.road} strokeWidth={width} />
            <path
              d={d}
              fill="none"
              stroke={kartScene.roadLine}
              strokeWidth={1.5}
              strokeDasharray="6 6"
            />
          </g>
        ))}
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
        {obstacles.length > 0 && (
          <g ref={obstacleLayer}>
            {obstacles.map((obstacle, index) => {
              const look = obstacleLook(obstacle, 0)
              return obstacle.json.kind === 'boom' ? (
                <line
                  key={index}
                  {...boomLine(obstacle)}
                  stroke={look.color}
                  strokeWidth={look.width}
                  strokeLinecap="round"
                  data-obstacle={index}
                  data-state={look.state}
                  data-testid="kart-minimap-obstacle"
                />
              ) : (
                <path
                  key={index}
                  d={sliderPath(obstacle, 0)}
                  fill={look.color}
                  stroke={kartScene.nose}
                  strokeWidth={1}
                  data-obstacle={index}
                  data-state={look.state}
                  data-testid="kart-minimap-obstacle"
                />
              )
            })}
          </g>
        )}
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

/** What an obstacle is doing at `tick`, as the map shows it: a state name, a colour and a width */
function obstacleLook(
  obstacle: Obstacle,
  tick: number,
): { state: 'open' | 'warn' | 'closed' | 'held' | 'sliding'; color: string; width: number } {
  const now = obstacleState(obstacle, tick)
  if (obstacle.json.kind === 'boom') {
    // Down: a red bar across the road; warned of: amber; up: a thin green line
    if (now.closed) return { state: 'closed', color: obstacleScene.armRed, width: 5 }
    if (now.warn) return { state: 'warn', color: obstacleScene.lampAmber, width: 4 }
    return { state: 'open', color: obstacleScene.lampGreen, width: 2 }
  }
  if (now.shut > 0) return { state: 'sliding', color: obstacleScene.armRed, width: 1 }
  if (now.warn) return { state: 'warn', color: obstacleScene.lampAmber, width: 1 }
  return { state: 'held', color: obstacleScene.trolley, width: 1 }
}

/** A barrier's line across the road, as SVG attributes */
function boomLine(obstacle: Obstacle): { x1: number; y1: number; x2: number; y2: number } {
  const json = obstacle.json
  if (json.kind !== 'boom') return { x1: 0, y1: 0, x2: 0, y2: 0 }
  const a = besideObstacle(obstacle, json.from)
  const b = besideObstacle(obstacle, json.to)
  return { x1: a.x, y1: a.z, x2: b.x, y2: b.z }
}

/** A container's outline where it is at `tick` */
function sliderPath(obstacle: Obstacle, tick: number): string {
  const json = obstacle.json
  if (json.kind !== 'slider') return ''
  const corners = sliderCorners(obstacle, json, obstacleState(obstacle, tick).across)
  return `M${corners.map((corner) => `${corner.x.toFixed(1)} ${corner.z.toFixed(1)}`).join('L')}Z`
}

/** Every obstacle in `layer` as it is at `tick`, without a React render (only what changed) */
function drawObstacles(layer: SVGGElement, obstacles: readonly Obstacle[], tick: number): void {
  obstacles.forEach((obstacle, index) => {
    const shape = layer.querySelector(`[data-obstacle="${index}"]`)
    if (!shape) return
    const look = obstacleLook(obstacle, tick)
    if (shape.getAttribute('data-state') !== look.state) {
      shape.setAttribute('data-state', look.state)
      shape.setAttribute(obstacle.json.kind === 'boom' ? 'stroke' : 'fill', look.color)
      if (obstacle.json.kind === 'boom') shape.setAttribute('stroke-width', String(look.width))
    }
    if (obstacle.json.kind === 'slider') shape.setAttribute('d', sliderPath(obstacle, tick))
  })
}

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
