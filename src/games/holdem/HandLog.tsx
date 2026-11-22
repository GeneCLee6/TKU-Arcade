import styled from 'styled-components'
import type { HoldemView } from '../../../shared/games/holdem/types.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import { Heading } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { CardFace } from './PokerCard.tsx'
import { categoryKey, logLine, type Names } from './screenState.ts'

/** This hand, newest first, with the cards as they come; then who won the last few hands */
export function HandLog({ view, names }: { view: HoldemView; names: Names }) {
  const t = useT()
  const lines = view.log.map((entry, index) => ({ entry, index })).reverse()
  const history = [...view.history].reverse()
  return (
    <Panel aria-labelledby="holdem-log-heading" data-testid="hand-log">
      <Heading id="holdem-log-heading">{t('games.holdem.ui.log')}</Heading>
      <Lines aria-live="polite" aria-relevant="additions" tabIndex={0}>
        {lines.map(({ entry, index }) => {
          const line = logLine(entry, names)
          const strong = entry.k === 'win' || entry.k === 'street' || entry.k === 'hand'
          return (
            <Entry key={index} $strong={strong} $tone={entry.k === 'win' ? color.accent : entry.k === 'bust' ? color.danger : color.line}>
              <span>{t(line.key, line.params)}</span>
              {line.cards.length > 0 && (
                <Cards>
                  {line.cards.map((card) => (
                    <CardFace key={card} card={card} size="tiny" />
                  ))}
                </Cards>
              )}
            </Entry>
          )
        })}
      </Lines>
      {history.length > 0 && (
        <>
          <SubHeading>{t('games.holdem.ui.history')}</SubHeading>
          <History data-testid="history">
            {history.map((hand) => (
              <li key={hand.hand}>
                {hand.winners.map((win: { seat: SeatId; amount: number }) => (
                  <span key={win.seat}>{t('games.holdem.ui.historyLine', { hand: hand.hand, name: names.name(win.seat), chips: win.amount })}</span>
                ))}
                {hand.category !== null && <Muted>{t(categoryKey(hand.category))}</Muted>}
              </li>
            ))}
          </History>
        </>
      )}
    </Panel>
  )
}

const Panel = styled.section`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
`

const Lines = styled.ol`
  display: grid;
  gap: 2px;
  max-height: 16em;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Entry = styled.li<{ $strong: boolean; $tone: string }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  padding: 2px ${space.sm}px;
  border-left: 3px solid ${(p) => p.$tone};
  font-weight: ${(p) => (p.$strong ? 700 : 400)};
  overflow-wrap: anywhere;
`

const Cards = styled.span`
  display: inline-flex;
  gap: 2px;
`

const SubHeading = styled.h3`
  ${monoType}
  margin: ${space.sm}px 0 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const History = styled.ul`
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: ${fontSize.sm}px;

  & > li {
    display: flex;
    flex-wrap: wrap;
    gap: ${space.xs}px ${space.sm}px;
  }
`

const Muted = styled.span`
  color: ${color.muted};
`
