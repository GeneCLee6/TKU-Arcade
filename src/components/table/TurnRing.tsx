import { useState, type ReactNode } from 'react'
import styled, { keyframes } from 'styled-components'
import type { RoomTimer } from '../../lib/roomConnection.ts'
import { color } from '../../styles/tokens.ts'

/**
 * A hexagonal ring round the avatar of the seat whose move it is (docs/DESIGN.md §3.9). With a running
 * countdown the ring runs down with it, like a broadcast's shot clock; the countdown's own text is
 * elsewhere, so this is only for the eye. With reduced motion the ring stays whole.
 */
export function TurnRing({ timer, children }: { timer?: RoomTimer; children: ReactNode }) {
  return (
    <Wrap>
      {children}
      <Ring key={timer?.deadline} timer={timer} />
    </Wrap>
  )
}

/** One countdown's ring: a new deadline starts a new one, read against the clock once */
function Ring({ timer }: { timer?: RoomTimer }) {
  const [start] = useState(() => performance.now())
  const running = timer !== undefined && timer.totalMs > 0
  const left = running ? Math.max(0, timer.deadline - start) : 0
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <polygon points={HEX} pathLength={100} data-track="" />
      <Run
        points={HEX}
        pathLength={100}
        style={
          running
            ? { animationDuration: `${timer.totalMs}ms`, animationDelay: `${left - timer.totalMs}ms` }
            : { animation: 'none' }
        }
      />
    </svg>
  )
}

// The avatar's own hexagon (Avatar.tsx), 4 px larger all round
const HEX = '10,2 30,2 39,20 30,38 10,38 1,20'

const runDown = keyframes`
  to {
    stroke-dashoffset: 100;
  }
`

const Wrap = styled.span`
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  /* Takes no more room than the avatar alone: it arrives after the first paint */
  margin: -5px;

  & > svg {
    position: absolute;
    inset: 0;
    overflow: visible;
    fill: none;
    stroke-width: 2.5;
    pointer-events: none;
  }

  & [data-track] {
    stroke: ${color.raised};
  }
`

const Run = styled.polygon`
  stroke: ${color.accent};
  stroke-dasharray: 100;
  stroke-dashoffset: 0;
  filter: drop-shadow(0 0 3px ${color.accent});
  animation: ${runDown} linear both;

  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
  }
`
