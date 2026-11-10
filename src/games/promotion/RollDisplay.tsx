import { useEffect, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { FACES, type Face } from '../../../shared/games/promotion/board.ts'
import type { DiceKind, LastRoll } from '../../../shared/games/promotion/types.ts'
import { useT } from '../../i18n/useT.ts'
import { font, promotionBoard as paint } from '../../styles/tokens.ts'
import { spunTo, turn } from './topSpin.ts'
import { ROLL_MS } from './useRollPlayback.ts'

const FLICKER_MS = 90
const DICE = [0, 1, 2, 3]

export interface RollDisplayProps {
  kind: DiceKind
  /** The latest roll, or null before the first. While `rolling` it is the roll being played */
  roll: LastRoll | null
  rolling: boolean
}

/**
 * The top or the dice, as an original drawing. Decorative: the sentence beside it says what was
 * rolled, and only once the top has stopped.
 */
export function RollDisplay({ kind, roll, rolling }: RollDisplayProps) {
  return (
    <Frame aria-hidden="true" $tall={kind === 'four-sided'}>
      {kind === 'four-sided' ? (
        <SpinningTop face={roll?.face ?? null} rolling={rolling} />
      ) : (
        <FourDice values={roll?.dice ?? null} rolling={rolling} />
      )}
    </Frame>
  )
}

const SPIN_TURNS = 4

/**
 * Turns the top: a new roll spins it several times and slows it down onto the face rolled, in the
 * time the room gives the roll (ROLL_MS); otherwise it rests on the latest face. React state that
 * follows the props, set during render so that no frame shows the old angle with the new face.
 */
function useTopAngle(face: Face | null, rolling: boolean): number {
  const index = face ? FACES.indexOf(face) : 0
  const [angle, setAngle] = useState(() => spunTo(0, index, 0))
  // The face being spun to; a newer roll that replaces one still spinning spins again
  const [spinning, setSpinning] = useState<number | null>(null)
  if (rolling && spinning !== index) {
    setSpinning(index)
    setAngle(spunTo(angle, index, SPIN_TURNS))
  } else if (!rolling && spinning !== null) {
    setSpinning(null)
  } else if (!rolling && turn(angle) !== turn(-90 * index)) {
    setAngle(spunTo(angle, index, 0))
  }
  return angle
}

/**
 * The four-sided top, in CSS 3D: a square body with 德, 才, 功 and 贓 round its sides, a handle above
 * and a point below. It spins to its result and wobbles as it slows.
 */
function SpinningTop({ face, rolling }: { face: Face | null; rolling: boolean }) {
  const t = useT()
  const angle = useTopAngle(face, rolling)
  return (
    <TopScene>
      <Handle />
      <Tilt $rolling={rolling}>
        <Prism style={{ transform: `rotateX(-18deg) rotateY(${angle}deg)` }} data-angle={angle}>
          {FACES.map((side, at) => (
            <TopFace
              key={side}
              style={{
                transform: `rotateY(${at * 90}deg) translateZ(${TOP_SIZE / 2}px)`,
                background: paint.face[side],
              }}
              data-face={side}
            >
              {t(`games.promotion.glyph.${side}`)}
            </TopFace>
          ))}
        </Prism>
      </Tilt>
      <Point />
    </TopScene>
  )
}

// Standard pip positions on a 3 by 3 grid
const PIPS: Record<number, readonly [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
}

/** Chinese dice paint the 1 and the 4 red, which is what the six-sided table reads */
const isRed = (value: number) => value === 1 || value === 4

/** Four dice that tumble through faces while rolling and show the roll's when they stop */
function FourDice({ values, rolling }: { values: number[] | null; rolling: boolean }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!rolling) return undefined
    const interval = setInterval(() => setTick((count) => count + 1), FLICKER_MS)
    return () => clearInterval(interval)
  }, [rolling])

  const shown = DICE.map((die) =>
    rolling ? ((tick * (die + 2) + die) % 6) + 1 : (values?.[die] ?? 6),
  )
  return (
    <svg viewBox="0 0 64 64" width="56" height="56">
      {shown.map((value, die) => (
        <Die
          key={die}
          $rolling={rolling}
          $delay={die * 40}
          style={{ transformOrigin: `${(die % 2) * 32 + 16}px ${Math.floor(die / 2) * 32 + 16}px` }}
        >
          <DieFace
            x={(die % 2) * 32 + 2}
            y={Math.floor(die / 2) * 32 + 2}
            width="28"
            height="28"
            rx="6"
          />
          {PIPS[value].map(([x, y]) => (
            <Pip
              key={`${x}${y}`}
              cx={(die % 2) * 32 + 8 + x * 8}
              cy={Math.floor(die / 2) * 32 + 8 + y * 8}
              r={value === 1 ? 4.5 : 2.6}
              $red={isRed(value)}
            />
          ))}
        </Die>
      ))}
    </svg>
  )
}

const TOP_SIZE = 38

const Frame = styled.div<{ $tall: boolean }>`
  flex: none;
  width: 60px;
  height: ${(p) => (p.$tall ? 72 : 56)}px;
  display: grid;
  place-items: center;
`

const TopScene = styled.div`
  position: relative;
  width: 60px;
  height: 72px;
  perspective: 320px;
`

const Handle = styled.div`
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 1;
  width: 9px;
  height: 17px;
  margin-left: -4.5px;
  border-radius: 4px;
  background: linear-gradient(90deg, ${paint.drop}, ${paint.gold} 45%, ${paint.drop});
`

const wobble = keyframes`
  0% { transform: rotateZ(0deg); }
  20% { transform: rotateZ(7deg); }
  45% { transform: rotateZ(-6deg); }
  70% { transform: rotateZ(4deg); }
  88% { transform: rotateZ(-2deg); }
  100% { transform: rotateZ(0deg); }
`

const Tilt = styled.div<{ $rolling: boolean }>`
  position: absolute;
  top: 14px;
  left: ${(60 - TOP_SIZE) / 2}px;
  width: ${TOP_SIZE}px;
  height: ${TOP_SIZE}px;
  transform-style: preserve-3d;
  transform-origin: 50% 140%;
  animation: ${(p) => (p.$rolling ? wobble : 'none')} ${ROLL_MS}ms ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Prism = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform ${ROLL_MS}ms cubic-bezier(0.12, 0.72, 0.18, 1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const TopFace = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  backface-visibility: hidden;
  color: ${paint.onFace};
  font-family: ${font.kai};
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  box-shadow:
    inset 0 0 0 2px ${paint.drop},
    inset 0 -10px 14px -6px ${paint.drop};
`

const Point = styled.div`
  position: absolute;
  top: ${14 + TOP_SIZE - 1}px;
  left: 50%;
  width: 0;
  height: 0;
  margin-left: -13px;
  border-left: 13px solid transparent;
  border-right: 13px solid transparent;
  border-top: 18px solid ${paint.edge};
`

const tumble = keyframes`
  25% {
    transform: rotate(-24deg) scale(0.86);
  }
  75% {
    transform: rotate(24deg) scale(1.08);
  }
`

const Die = styled.g<{ $rolling: boolean; $delay: number }>`
  animation: ${(p) => (p.$rolling ? tumble : 'none')} 240ms ease-in-out infinite;
  animation-delay: ${(p) => p.$delay}ms;
`

const DieFace = styled.rect`
  fill: ${paint.paperHi};
  stroke: ${paint.ink};
  stroke-width: 1.5;
`

const Pip = styled.circle<{ $red: boolean }>`
  fill: ${(p) => (p.$red ? paint.seal : paint.ink)};
`
