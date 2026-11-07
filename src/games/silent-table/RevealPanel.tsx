import styled from 'styled-components'
import type {
  Reveal,
  RevealedSeat,
  SilentTablePlayerView,
  SilentTableSkin,
} from '../../../shared/games/silent-table/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, radius, seatColor, space } from '../../styles/tokens.ts'
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
    <Panel aria-label={t('games.silent-table.ui.revealHeading')}>
      <Title>{t('games.silent-table.ui.revealHeading')}</Title>
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
            <Row key={seat.seat} $wrong={open && !seat.correct}>
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
    </Panel>
  )
}

const Panel = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.sm}px;
  padding: ${space.md}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
`

const Title = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const Rows = styled.ol`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

// A wrong row is told by the word and the cross as well as by its outline
const Row = styled.li<{ $wrong: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  padding: ${space.sm}px;
  background: ${color.bg};
  border: ${(p) => (p.$wrong ? `2px solid ${color.danger}` : `1px solid ${color.border}`)};
  border-radius: ${radius.component}px;
`

const Who = styled.div`
  min-width: 0;
`

const Name = styled.div`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
`

const Small = styled.div`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const Cards = styled.div`
  display: flex;
  gap: 2px;
`

const Compare = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0 ${space.md}px;
  font-size: ${fontSize.sm}px;
`

const Mark = styled.span<{ $right: boolean }>`
  color: ${(p) => (p.$right ? color.success : color.danger)};
  font-weight: 700;
`

const Best = styled.div`
  grid-column: 1 / -1;
  display: flex;
  gap: 2px;
`

const Verdict = styled.p<{ $passed: boolean }>`
  margin: 0;
  color: ${(p) => (p.$passed ? color.success : color.danger)};
  min-height: 1.5em;
  font-weight: 700;
`
