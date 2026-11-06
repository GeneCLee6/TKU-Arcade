import { useEffect, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { FACES, type Face } from '../../../shared/games/promotion/board.ts'
import type { DiceKind, LastRoll } from '../../../shared/games/promotion/types.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize } from '../../styles/tokens.ts'
import { ROLL_MS } from './useRollPlayback.ts'

const FLICKER_MS = 90
const DICE = [0, 1, 2, 3]

export interface RollDisplayProps {
  kind: DiceKind
  /** The latest roll, once the top has stopped; null while it spins or before the first roll */
  shown: LastRoll | null
  rolling: boolean
}

/**
 * The top or the dice, as an original drawing. While it spins it only flickers through faces: the
 * real result is shown when it stops. Decorative: the sentence beside it says what was rolled.
 */
export function RollDisplay({ kind, shown, rolling }: RollDisplayProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!rolling) return undefined
    const interval = setInterval(() => setTick((count) => count + 1), FLICKER_MS)
    return () => clearInterval(interval)
  }, [rolling])

  return (
    <Frame aria-hidden="true">
      {kind === 'four-sided' ? (
        <SpinningTop
          face={rolling ? FACES[tick % FACES.length] : (shown?.face ?? null)}
          rolling={rolling}
        />
      ) : (
        <FourDice
          values={DICE.map((die) =>
            rolling ? ((tick * (die + 2) + die) % 6) + 1 : (shown?.dice?.[die] ?? 6),
          )}
          rolling={rolling}
        />
      )}
    </Frame>
  )
}

function SpinningTop({ face, rolling }: { face: Face | null; rolling: boolean }) {
  const t = useT()
  return (
    <svg viewBox="0 0 64 64" width="56" height="56">
      <TopBody $rolling={rolling}>
        <TopPlate x="12" y="12" width="40" height="40" rx="7" transform="rotate(45 32 32)" />
        <TopFacet d="M32 4 V60 M4 32 H60" />
      </TopBody>
      <TopHub cx="32" cy="32" r="16" />
      {face && (
        <Glyph x="32" y="33" $bad={face === 'zang'}>
          {t(`games.promotion.glyph.${face}`)}
        </Glyph>
      )}
    </svg>
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

function FourDice({ values, rolling }: { values: number[]; rolling: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56">
      {values.map((value, die) => (
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

const Frame = styled.div`
  flex: none;
  width: 56px;
  height: 56px;
`

const spin = keyframes`
  to {
    transform: rotate(1080deg);
  }
`

const wobble = keyframes`
  25% {
    transform: rotate(-24deg) scale(0.86);
  }
  75% {
    transform: rotate(24deg) scale(1.08);
  }
`

const TopBody = styled.g<{ $rolling: boolean }>`
  transform-origin: 32px 32px;
  animation: ${(p) => (p.$rolling ? spin : 'none')} ${ROLL_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1);
`

const TopPlate = styled.rect`
  fill: ${color.surface};
  stroke: ${color.text};
  stroke-width: 2;
`

const TopFacet = styled.path`
  stroke: ${color.border};
  stroke-width: 1.5;
`

const TopHub = styled.circle`
  fill: ${color.bg};
  stroke: ${color.text};
  stroke-width: 2;
`

const Glyph = styled.text<{ $bad: boolean }>`
  fill: ${(p) => (p.$bad ? color.danger : color.text)};
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: central;
`

const Die = styled.g<{ $rolling: boolean; $delay: number }>`
  animation: ${(p) => (p.$rolling ? wobble : 'none')} 240ms ease-in-out infinite;
  animation-delay: ${(p) => p.$delay}ms;
`

const DieFace = styled.rect`
  fill: ${color.surface};
  stroke: ${color.text};
  stroke-width: 1.5;
`

const Pip = styled.circle<{ $red: boolean }>`
  fill: ${(p) => (p.$red ? color.danger : color.text)};
`
