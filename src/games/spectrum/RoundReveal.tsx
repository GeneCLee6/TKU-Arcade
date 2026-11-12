import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { SpectrumView } from '../../../shared/games/spectrum/types.ts'
import { Heading, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { NumberLine } from './NumberLine.tsx'
import { revealMarks } from './numberLine.ts'
import { gains } from './screenState.ts'

interface RoundRevealProps {
  view: SpectrumView
  nameOf(seat: SeatId): string
  animate: boolean
}

/**
 * The numbers of a round, on the line from 1 to 10, with what the guess got right and who scored. All
 * of it is in the reveal's view: the screen only lays it out.
 */
export function RoundReveal({ view, nameOf, animate }: RoundRevealProps) {
  const t = useT()
  const reveal = view.reveal
  if (!reveal) return null
  const marks = revealMarks(view.answerers, reveal, nameOf)
  const verdict = (seat: SeatId) =>
    t(reveal.correct.includes(seat) ? 'games.spectrum.ui.right' : 'games.spectrum.ui.wrong')
  const gained = [...gains(view)]
  const { guess } = reveal

  return (
    <Section aria-labelledby="spectrum-reveal-heading" data-testid="round-reveal">
      <Heading id="spectrum-reveal-heading">{t('games.spectrum.ui.prompt.reveal')}</Heading>
      <NumberLine low={view.topic.low} high={view.topic.high} marks={marks} animate={animate} />
      <Verdicts>
        {reveal.missed !== null && <Verdict>{t(`games.spectrum.ui.missed.${reveal.missed}`)}</Verdict>}
        {guess?.kind === 'extremes' &&
          (['max', 'min'] as const).map((end) => {
            const seat = guess[end]
            const right = reveal.correct.includes(seat)
            return (
              <Verdict key={end} $right={right}>
                <Mark aria-hidden="true">{right ? '✓' : '✕'}</Mark>
                {t('games.spectrum.ui.verdictLine', {
                  pick: t(end === 'max' ? 'games.spectrum.ui.largest' : 'games.spectrum.ui.smallest'),
                  name: nameOf(seat),
                  verdict: verdict(seat),
                })}
              </Verdict>
            )
          })}
        {guess?.kind === 'order' && (
          <Verdict $right={reveal.correct.length === guess.seats.length}>
            {t('games.spectrum.ui.orderScore', {
              right: reveal.correct.length,
              total: guess.seats.length,
            })}
          </Verdict>
        )}
      </Verdicts>
      <Gained>
        {gained.length === 0
          ? t('games.spectrum.ui.nobodyScored')
          : gained
              .map(([seat, points]) => t('games.spectrum.ui.gained', { name: nameOf(seat), points }))
              .join(' · ')}
      </Gained>
    </Section>
  )
}

const Verdicts = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Verdict = styled.li<{ $right?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0
    ${(p) => (p.$right === undefined ? color.line : p.$right ? color.success : color.danger)};
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Mark = styled.span`
  flex: none;
  font-size: ${fontSize.lg}px;
`

const Gained = styled.p`
  margin: 0;
  color: ${color.success};
  font-weight: 700;
  overflow-wrap: anywhere;
`
