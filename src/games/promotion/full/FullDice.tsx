import { useEffect, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { PIP_FACE } from '../../../../shared/games/promotion/fullFaces.ts'
import { useT } from '../../../i18n/useT.ts'
import { font, promotionBoard as paint } from '../../../styles/tokens.ts'

const FLICKER_MS = 90
const DICE = [0, 1, 2, 3]
const SIZE = 26
const STEP = 30

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

/** Chinese dice paint the 1 and the 4 red */
const isRed = (value: number) => value === 1 || value === 4

/**
 * Four six-sided dice in a row, each with the result its pip stands for under it (德 4, 才 6, 功 5,
 * 良 3, 柔 2, 贓 1). They tumble while `tumbling` and then show `dice`. Decorative: the line beside
 * them says what was thrown and what it makes
 */
export function FullDice({ dice, tumbling }: { dice: readonly number[] | null; tumbling: boolean }) {
  const t = useT()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!tumbling) return undefined
    const interval = setInterval(() => setTick((count) => count + 1), FLICKER_MS)
    return () => clearInterval(interval)
  }, [tumbling])

  const shown = DICE.map((die) =>
    tumbling ? ((tick * (die + 2) + die) % 6) + 1 : (dice?.[die] ?? null),
  )
  return (
    <Frame aria-hidden="true" data-dice={dice?.join('') ?? ''}>
      <svg viewBox={`0 0 ${STEP * 4 - 4} ${SIZE + 2}`} width={STEP * 4 - 4} height={SIZE + 2}>
        {shown.map((value, die) => {
          const x = die * STEP + 1
          return (
            <Die
              key={die}
              $tumbling={tumbling}
              $delay={die * 40}
              style={{ transformOrigin: `${x + SIZE / 2}px ${SIZE / 2 + 1}px` }}
            >
              <DieFace x={x} y={1} width={SIZE} height={SIZE} rx={5} />
              {value !== null &&
                PIPS[value].map(([px, py]) => (
                  <Pip
                    key={`${px}${py}`}
                    cx={x + 6 + px * 7}
                    cy={7 + py * 7}
                    r={value === 1 ? 4 : 2.3}
                    $red={isRed(value)}
                  />
                ))}
            </Die>
          )
        })}
      </svg>
      <Faces>
        {shown.map((value, die) => {
          const face = value === null || tumbling ? null : PIP_FACE[value]
          return (
            <Glyph key={die} style={face ? { background: paint.face[face] } : undefined}>
              {face ? t(`games.promotion.full.glyph.${face}`) : ''}
            </Glyph>
          )
        })}
      </Faces>
    </Frame>
  )
}

const Frame = styled.div`
  flex: none;
  display: grid;
  gap: 2px;
  width: ${STEP * 4 - 4}px;
  height: ${SIZE + 2 + 2 + 16}px;
`

const Faces = styled.div`
  display: grid;
  grid-template-columns: repeat(4, ${SIZE}px);
  column-gap: ${STEP - SIZE}px;
  padding-left: 1px;
`

const Glyph = styled.span`
  display: grid;
  place-items: center;
  height: 16px;
  border-radius: 2px;
  color: ${paint.onFace};
  font-family: ${font.kai};
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
`

const tumble = keyframes`
  25% {
    transform: rotate(-24deg) scale(0.86);
  }
  75% {
    transform: rotate(24deg) scale(1.08);
  }
`

const Die = styled.g<{ $tumbling: boolean; $delay: number }>`
  animation: ${(p) => (p.$tumbling ? tumble : 'none')} 240ms ease-in-out infinite;
  animation-delay: ${(p) => p.$delay}ms;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const DieFace = styled.rect`
  fill: ${paint.paperHi};
  stroke: ${paint.ink};
  stroke-width: 1.3;
`

const Pip = styled.circle<{ $red: boolean }>`
  fill: ${(p) => (p.$red ? paint.seal : paint.ink)};
`
