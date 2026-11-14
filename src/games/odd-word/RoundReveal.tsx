import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { OddWordView } from '../../../shared/games/odd-word/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, glass, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'
import { revealedWords } from './screenState.ts'

/** The two words, who had the odd one, and everyone's word: the same for everyone */
export function RoundReveal({ view, nameOf }: { view: OddWordView; nameOf(seat: SeatId): string }) {
  const t = useT()
  const reveal = view.reveal
  if (reveal === null) return null
  const words = revealedWords(view)
  const oddNames = words.filter((entry) => entry.odd).map((entry) => nameOf(entry.seat))

  return (
    <Card aria-labelledby="odd-reveal-heading" data-testid="round-reveal">
      <Heading id="odd-reveal-heading">{t('games.odd-word.ui.revealHeading')}</Heading>
      <Pair>
        <Side>
          <SideLabel>{t('games.odd-word.ui.commonWord')}</SideLabel>
          <Big lang="zh-TW" data-testid="common-word">
            {reveal.pair.common}
          </Big>
        </Side>
        <Side $odd>
          <SideLabel>{t('games.odd-word.ui.oddWord')}</SideLabel>
          <Big lang="zh-TW" data-testid="odd-word">
            {reveal.pair.odd}
          </Big>
        </Side>
      </Pair>
      <Line data-testid="odd-were">{t('games.odd-word.ui.oddWere', { names: oddNames.join(t('games.odd-word.ui.nameSeparator')) })}</Line>
      <Small>
        {t('games.odd-word.ui.category', { category: reveal.pair.category })}
      </Small>
      <Section aria-labelledby="odd-everyone-heading">
        <Heading id="odd-everyone-heading">{t('games.odd-word.ui.everyone')}</Heading>
        <List>
          {words.map((entry) => {
            const name = nameOf(entry.seat)
            return (
              <WordRow key={entry.seat} $mark={seatColor(entry.seat)} $odd={entry.odd}>
                <Avatar name={name} tint={seatColor(entry.seat)} />
                <Name>{name}</Name>
                <SeatWord lang="zh-TW">{entry.word ?? t('games.odd-word.ui.blank')}</SeatWord>
                {entry.odd && (
                  <Tag>
                    <span>{t(entry.blank ? 'games.odd-word.ui.blankMark' : 'games.odd-word.ui.oddMark')}</span>
                  </Tag>
                )}
              </WordRow>
            )
          })}
        </List>
      </Section>
    </Card>
  )
}

const Card = styled.section`
  ${glass}
  display: grid;
  gap: ${space.md}px;
  padding: ${space.lg}px;
  box-shadow: inset 0 3px 0 ${color.magenta};
`

const Pair = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
  gap: ${space.sm}px;
`

const Side = styled.div<{ $odd?: boolean }>`
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => (p.$odd ? color.magenta : color.accent)};
`

const SideLabel = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Big = styled.span`
  ${displayType}
  font-size: clamp(${fontSize.xl}px, 9vw, 44px);
  overflow-wrap: anywhere;
`

const Line = styled.p`
  margin: 0;
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Small = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const WordRow = styled(Row)<{ $odd: boolean }>`
  background: ${(p) => (p.$odd ? color.raised : 'transparent')};
`

const Name = styled.span`
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const SeatWord = styled.span`
  font-size: ${fontSize.lg}px;
  font-weight: 800;
`

const Tag = styled.span`
  padding: 0 ${space.sm}px;
  color: ${color.onAccent};
  background: ${color.magenta};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`
