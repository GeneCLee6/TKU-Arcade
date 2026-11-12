import styled from 'styled-components'
import type {
  Reveal,
  RevealedSeat,
  SilentTablePlayerView,
  SilentTableSkin,
} from '../../../shared/games/silent-table/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, Section } from '../../components/roomParts.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { clippedFill, displayType, monoType, slantClip } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import { ChipMark } from './ChipRail.tsx'
import { CardBack, CardFace } from './PlayingCard.tsx'

/** Weakest hand first, which is the order the chips should have been in */
const revealOrder = (reveal: Reveal): RevealedSeat[] =>
  [...reveal.seats].sort((a, b) => a.lowestCorrectChip - b.lowestCorrectChip || a.seat - b.seat)

interface RevealPanelProps {
  reveal: Reveal
  players: readonly SilentTablePlayerView[]
  /** How many rows have turned over so far */
  shown: number
  skin: SilentTableSkin
  felt: string
  nameOf(seat: number): string
}

/** The hands turned over one by one: what each one needed against the chip it held (e4-t05) */
export function RevealPanel({ reveal, players, shown, skin, felt, nameOf }: RevealPanelProps) {
  const t = useT()
  const done = shown >= reveal.seats.length
  return (
    <Section aria-label={t('games.silent-table.ui.revealHeading')}>
      <Heading>{t('games.silent-table.ui.revealHeading')}</Heading>
      <Hint>{t('games.silent-table.ui.revealOrder')}</Hint>
      <Rows>
        {revealOrder(reveal).map((seat, index) => {
          const hole = players.find((player) => player.seat === seat.seat)?.hole ?? null
          const open = index < shown
          const { lowestCorrectChip: low, highestCorrectChip: high } = seat
          const range =
            low === high
              ? String(low)
              : t('games.silent-table.ui.neededRange', { low, high })
          return (
            <Row key={seat.seat} $state={open ? (seat.correct ? 'right' : 'wrong') : 'closed'}>
              <Avatar name={nameOf(seat.seat)} tint={seatColor(seat.seat)} />
              <Who>
                <Name>{nameOf(seat.seat)}</Name>
                {open && <Small>{t(`games.silent-table.hand.${seat.hand}`)}</Small>}
              </Who>
              <Cards>
                {hole?.map((card) =>
                  open ? (
                    <CardFace key={card} card={card} size="small" />
                  ) : (
                    <CardBack key={card} skin={skin} felt={felt} size="small" />
                  ),
                )}
              </Cards>
              <ChipMark chip={seat.chip} seat={seat.seat} />
              {open && (
                <Compare>
                  <Mark $right={seat.correct}>
                    {seat.correct ? '✓' : '✕'}{' '}
                    {t(seat.correct ? 'games.silent-table.ui.right' : 'games.silent-table.ui.wrong')}
                  </Mark>
                  <span>{t('games.silent-table.ui.needed', { range })}</span>
                  <span>{t('games.silent-table.ui.held', { chip: seat.chip })}</span>
                </Compare>
              )}
              {open && (
                <Best>
                  <VisuallyHidden>{t('games.silent-table.ui.bestFive')}</VisuallyHidden>
                  {seat.best.map((card) => (
                    <CardFace key={card} card={card} size="small" />
                  ))}
                </Best>
              )}
            </Row>
          )
        })}
      </Rows>
      {/* Always there, so that a screen reader hears the verdict when it arrives */}
      <Verdict role="status" $passed={reveal.passed}>
        {done
          ? t(reveal.passed ? 'games.silent-table.ui.passed' : 'games.silent-table.ui.failed')
          : ''}
      </Verdict>
    </Section>
  )
}

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const Rows = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const edge = { closed: color.line, right: color.success, wrong: color.danger }

// A row sunk into the panel, its left edge green or red once it is turned over: a wrong row is told
// by the word and the cross as well
const Row = styled.li<{ $state: keyof typeof edge }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => edge[p.$state]};
`

const Who = styled.div`
  min-width: 0;
`

const Name = styled.div`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 700;
`

const Small = styled.div`
  ${displayType}
  font-size: ${fontSize.sm}px;
`

const Cards = styled.div`
  display: flex;
  gap: 2px;
`

const Compare = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.md}px;
  ${monoType}
  font-size: ${fontSize.sm}px;
`

// A slanted tag in the verdict's colour, with the word on it
const Mark = styled.span<{ $right: boolean }>`
  ${(p) => clippedFill(slantClip(6), p.$right ? color.success : color.danger)}
  padding: 2px ${space.md}px;
  color: ${color.onAccent};
  ${displayType}
`

const Best = styled.div`
  grid-column: 1 / -1;
  display: flex;
  gap: 2px;
`

const Verdict = styled.p<{ $passed: boolean }>`
  margin: 0;
  min-height: 1.5em;
  color: ${(p) => (p.$passed ? color.success : color.danger)};
  ${displayType}
  font-size: ${fontSize.xl}px;

  &:not(:empty) {
    padding: ${space.sm}px ${space.md}px;
    background: color-mix(in srgb, currentColor 10%, transparent);
    box-shadow: inset 4px 0 0 currentColor;
  }
`
