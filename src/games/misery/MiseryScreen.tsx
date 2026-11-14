import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { MiseryAction, MiseryView } from '../../../shared/games/misery/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { AllLines } from './AllLines.tsx'
import { LineView } from './LineView.tsx'
import './messages.ts'
import { answerKey, lineOf, promptOf } from './screenState.ts'
import { RevealCard, TableCard } from './TableCard.tsx'

/** If the room never answers a press, the buttons come back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 慘度排排站's screen. Phone first: the card on the table at the top, your own line under it with a
 * slot in every gap when the card is yours to place, and everyone else's lines below. The rules stay
 * on the server: this draws `view` and sends actions.
 */
export default function MiseryScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as MiseryView
  const legal = game.legal as unknown as MiseryAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  // A press waits for the room's answer, so that a double tap does not place twice
  const key = answerKey(view, legal)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: MiseryAction) => {
    setAskedAt(key)
    room.act(action)
  }

  const prompt = promptOf(view, nameOf)
  const placing = legal.some((action) => action.type === 'place')
  const canDraw = legal.some((action) => action.type === 'next')
  const yourCards = view.you === null ? [] : lineOf(view, view.you)
  const freshId = view.phase !== 'guess' && view.last?.keptBy === view.you ? (view.last?.card.id ?? null) : null
  const turnSeat = game.over ? null : view.phase === 'guess' ? view.guesser : view.nextTurn

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={turnSeat}
      dock={
        <DockRow>
          <DockText>
            <MainLine>{t(prompt.key, prompt.params)}</MainLine>
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          </DockText>
          {canDraw && (
            <Button disabled={asked} onClick={() => send({ type: 'next' })}>
              {t('games.misery.ui.draw')}
            </Button>
          )}
        </DockRow>
      }
    >
      <Stage>
        <Header>
          <Round>{t('games.misery.ui.cardNo', { turn: view.turnNo })}</Round>
          <Facts>
            <Fact>
              <span>{t('games.misery.ui.target', { target: view.target })}</span>
            </Fact>
            <Fact>
              <span>{t('games.misery.ui.deckLeft', { count: view.deckLeft })}</span>
            </Fact>
            {!view.steals && (
              <Fact>
                <span>{t('games.misery.ui.stealsOff')}</span>
              </Fact>
            )}
          </Facts>
        </Header>
        {view.phase === 'guess' && <TableCard view={view} nameOf={nameOf} />}
        {view.phase !== 'guess' && view.last !== null && (
          <RevealCard reveal={view.last} you={view.you} nameOf={nameOf} />
        )}
        {view.you !== null && !game.over && (
          <Mine aria-labelledby="misery-mine-heading" data-testid="your-line" $live={placing}>
            <MineTop>
              <Heading id="misery-mine-heading">{t('games.misery.ui.yourLine')}</Heading>
              <Count>{t('games.misery.ui.count', { count: yourCards.length, target: view.target })}</Count>
            </MineTop>
            {placing && <Ask>{t(prompt.key, prompt.params)}</Ask>}
            <LineView
              cards={yourCards}
              onPick={placing ? (gap) => send({ type: 'place', gap }) : undefined}
              waiting={asked}
              freshId={freshId}
            />
          </Mine>
        )}
        <AllLines view={view} nameOf={nameOf} final={game.over} />
      </Stage>
    </GameLayout>
  )
}

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
`

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px ${space.md}px;
`

const Round = styled.span`
  ${monoType}
  font-weight: 700;
`

const Facts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Fact = styled.span`
  padding: ${space.xs}px ${space.md}px;
  color: ${color.text};
  background: ${color.raised};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Mine = styled.section<{ $live: boolean }>`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
  box-shadow: inset 0 3px 0 ${(p) => (p.$live ? color.accent : 'transparent')};
`

const MineTop = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${space.md}px;
`

const Heading = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Count = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Ask = styled.p`
  margin: 0;
  font-weight: 700;
`

const DockRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px ${space.md}px;
`

const DockText = styled.div`
  flex: 1 1 12em;
  min-width: 0;
  overflow-wrap: anywhere;
`

const MainLine = styled.p`
  margin: 0;
  font-weight: 600;
  line-height: 1.3;
`

const SmallLine = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`
