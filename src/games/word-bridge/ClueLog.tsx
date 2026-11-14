import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { WbView } from '../../../shared/games/word-bridge/types.ts'
import { Heading, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { clueCount, turnsOf } from './screenState.ts'

/** Every clue so far, newest first, with what each pick turned out to be */
export function ClueLog({ view, nameOf }: { view: WbView; nameOf(seat: SeatId): string }) {
  const t = useT()
  const turns = turnsOf(view.log).reverse()
  if (turns.length === 0) return null
  return (
    <Section aria-labelledby="wb-log" data-testid="clue-log">
      <Heading id="wb-log">{t('games.word-bridge.ui.log')}</Heading>
      <Entries>
        {turns.map((turn, index) => {
          const count = turn.clue ? clueCount(turn.clue.count) : null
          return (
            <li key={turns.length - index}>
              {turn.clue && count ? (
                <ClueLine>
                  <strong>{turn.clue.text}</strong> {t(count.key, count.params)}
                  <By>{nameOf(turn.clue.seat)}</By>
                </ClueLine>
              ) : (
                <ClueLine>{t('games.word-bridge.ui.finalStand')}</ClueLine>
              )}
              {turn.picks.length > 0 && (
                <Picks>
                  {turn.picks.map((pick) => (
                    <span key={pick.index}>
                      {view.words[pick.index]}
                      {t('games.word-bridge.ui.wasCard', { card: t(`games.word-bridge.ui.card.${pick.card}`) })}
                    </span>
                  ))}
                </Picks>
              )}
            </li>
          )
        })}
      </Entries>
    </Section>
  )
}

const Entries = styled.ol`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const ClueLine = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${space.xs}px;
  margin: 0;
`

const By = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Picks = styled.p`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.sm}px;
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
