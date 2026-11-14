import styled, { css, keyframes } from 'styled-components'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import type { Translate } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'
import { LANE_GAP, lanes, lineOrder, position, type NumberLineMark } from './numberLine.ts'

const TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
/** Room under the line for the tick numbers */
const LINE_Y = 32
/** The height of one lane of marks */
const LANE_PX = 136
/** A mark's tallest: the answer on two lines, the name, the verdict and the number */
const MARK_PX = 128
/** Between one mark rising and the next */
export const STAGGER_MS = 180

interface NumberLineProps {
  /** What 1 means */
  low: string
  /** What 10 means */
  high: string
  marks: readonly NumberLineMark[]
  /** Let the marks rise one by one; off for a view that is already old (a reconnect) */
  animate?: boolean
}

function pickLabel(mark: NumberLineMark, t: Translate): string | null {
  if (mark.pick === null) return null
  if (mark.pick === 'max') return t('games.spectrum.ui.largest')
  if (mark.pick === 'min') return t('games.spectrum.ui.smallest')
  return t('games.spectrum.ui.placed', { place: mark.pick })
}

/**
 * Every answer of a revealed round on a line from 1 to 10 (e5-t04): each at its number, lowest
 * first, with what the guesser said of it and whether that was right. Marks too close to share a
 * height stack in lanes. Only shows what it is given: the numbers come from the reveal's `view`.
 */
export function NumberLine({ low, high, marks, animate = true }: NumberLineProps) {
  const t = useT()
  const ordered = lineOrder(marks)
  const laneOf = lanes(ordered)
  const laneCount = Math.max(1, ...laneOf.map((lane) => lane + 1))
  const height = LINE_Y + space.sm + (laneCount - 1) * LANE_PX + MARK_PX

  return (
    <Figure aria-label={t('games.spectrum.ui.numberLine')}>
      <Ends>
        <span>{t('games.spectrum.ui.lowEnd', { low })}</span>
        <span>{t('games.spectrum.ui.highEnd', { high })}</span>
      </Ends>
      <Plot>
        <Track aria-hidden="true" style={{ height }} data-testid="number-line-track">
          <Line />
          {TICKS.map((tick) => (
            <Tick key={tick} style={{ left: `${position(tick) * 100}%` }}>
              {tick}
            </Tick>
          ))}
          {ordered.map((mark, index) => {
            const label = pickLabel(mark, t)
            return (
              <Mark
                key={mark.seat}
                data-testid={`mark-${mark.seat}`}
                data-lane={laneOf[index]}
                $animate={animate}
                style={{
                  left: `${position(mark.number) * 100}%`,
                  // A higher lane's stem runs down past the lower lanes: their bubbles stay on top
                  zIndex: laneCount - laneOf[index],
                  animationDelay: animate ? `${index * STAGGER_MS}ms` : undefined,
                }}
              >
                <Bubble $correct={mark.correct} $close={mark.close}>
                  <Answer $out={mark.text === null}>{mark.text ?? '—'}</Answer>
                  <Name>{mark.name}</Name>
                  {label !== null && (
                    <Verdict $correct={mark.correct} $close={mark.close}>
                      {mark.correct === null ? '' : mark.correct ? '✓ ' : mark.close ? '≈ ' : '✕ '}
                      {label}
                    </Verdict>
                  )}
                </Bubble>
                <NumberChip style={{ background: seatColor(mark.seat) }}>{mark.number}</NumberChip>
                <Stem style={{ height: laneOf[index] * LANE_PX + space.sm }} />
              </Mark>
            )
          })}
        </Track>
      </Plot>
      {/* The same, in order, for a screen reader: the drawing above is hidden from it. On a phone the
          marks are too narrow for a whole answer, so there the list shows too (H2) */}
      <Readout>
        {ordered.map((mark) => {
          const label = pickLabel(mark, t)
          const verdict =
            mark.correct === null
              ? ''
              : t(
                  mark.correct
                    ? 'games.spectrum.ui.right'
                    : mark.close
                      ? 'games.spectrum.ui.close'
                      : 'games.spectrum.ui.wrong',
                )
          return (
            <li key={mark.seat}>
              {mark.text === null
                ? t('games.spectrum.ui.markOut', { number: mark.number, name: mark.name })
                : t('games.spectrum.ui.mark', {
                    number: mark.number,
                    name: mark.name,
                    text: mark.text,
                  })}
              {label !== null && ` ${t('games.spectrum.ui.markPick', { pick: label, verdict })}`}
            </li>
          )
        })}
      </Readout>
    </Figure>
  )
}

const rise = keyframes`
  from {
    transform: translate(-50%, 24px);
    opacity: 0;
  }
`

// Sunk into the reveal's panel (H2): the shell has no rounded boxes
const Figure = styled.figure`
  margin: 0;
  padding: ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 0 0 0 1px ${color.line};
`

const Ends = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${space.md}px;
  margin: 0 0 ${space.sm}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

// Half a mark's width each side, so that a mark on 1 or 10 stays inside: a mark is LANE_GAP of the
// nine steps wide, a third of the track, so the track is three quarters of the whole
const Plot = styled.div`
  padding: 0 12.5%;

  /* A narrow mark wraps its answer and verdict onto more lines than a lane allows for */
  @media (max-width: 599px) {
    padding-top: ${space.xl}px;
  }
`

const Readout = styled(VisuallyHidden).attrs({ as: 'ol' })`
  @media (max-width: 599px) {
    position: static;
    width: auto;
    height: auto;
    margin: ${space.sm}px 0 0;
    padding: 0 0 0 ${space.lg}px;
    overflow: visible;
    clip-path: none;
    white-space: normal;
    display: grid;
    gap: ${space.xs}px;
    font-size: ${fontSize.sm}px;
    overflow-wrap: anywhere;
  }
`

const Track = styled.div`
  position: relative;
`

const Line = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: ${LINE_Y}px;
  height: 8px;
  background: linear-gradient(90deg, ${color.accent}, ${color.magenta});
  transform: skewX(${SLANT});
`

const Tick = styled.span`
  position: absolute;
  bottom: ${space.xs}px;
  transform: translateX(-50%);
  color: ${color.muted};
  ${monoType}
  font-size: ${fontSize.sm}px;
`

const Mark = styled.div<{ $animate: boolean }>`
  position: absolute;
  bottom: ${LINE_Y + 6}px;
  width: calc(${(LANE_GAP / 9) * 100}% - ${space.xs}px);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  ${(p) =>
    p.$animate &&
    css`
      animation: ${rise} 0.6s cubic-bezier(0.2, 0.9, 0.2, 1) backwards;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

// A wrong pick is told by the cross and the word as well as by its outline
const verdictColor = (correct: boolean | null, close: boolean) =>
  correct === null ? color.muted : correct ? color.success : close ? color.warning : color.danger

const Bubble = styled.div<{ $correct: boolean | null; $close: boolean }>`
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  padding: ${space.xs}px ${space.sm}px;
  text-align: center;
  background: ${color.surface};
  border: ${(p) =>
    p.$correct === null
      ? `1px solid ${color.border}`
      : `2px solid ${verdictColor(p.$correct, p.$close)}`};
`

const Answer = styled.div<{ $out: boolean }>`
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
  color: ${(p) => (p.$out ? color.muted : color.text)};
  font-weight: 700;
  line-height: 1.3;
`

const Name = styled.div`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const Verdict = styled.div<{ $correct: boolean | null; $close: boolean }>`
  color: ${(p) => verdictColor(p.$correct, p.$close)};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  line-height: 1.3;
`

const NumberChip = styled.span`
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  min-width: 32px;
  height: 32px;
  margin-top: ${space.xs}px;
  color: ${color.onSeat};
  ${displayType}
  font-size: ${fontSize.lg}px;
  font-variant-numeric: tabular-nums;
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
`

const Stem = styled.span`
  width: 2px;
  background: ${color.border};
`
