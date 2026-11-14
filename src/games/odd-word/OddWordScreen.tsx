import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { OddWordAction, OddWordView } from '../../../shared/games/odd-word/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import './messages.ts'
import { RoundReveal } from './RoundReveal.tsx'
import { answerKey, promptOf } from './screenState.ts'
import { SpeakingOrder } from './SpeakingOrder.tsx'
import { WordCard } from './WordCard.tsx'

/** If the room never answers a press, the button comes back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 誰的詞不一樣's screen. Phone first: the friends talk on their own voice call and look at their
 * phones for one thing, their word, so the word is huge and the round host's buttons are in the dock
 * under the thumb. The rules stay on the server: this draws `view` and sends actions.
 */
export default function OddWordScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as OddWordView
  const legal = game.legal as unknown as OddWordAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  // A button waits for the room's answer, so that a double tap does not redeal twice
  const key = answerKey(view, legal)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: OddWordAction) => {
    setAskedAt(key)
    room.act(action)
  }
  const can = (type: OddWordAction['type']) => legal.some((action) => action.type === type)

  const prompt = promptOf(view, nameOf)
  const shown = view.reveal !== null

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={game.over ? null : view.host}
      resultUnranked
      dock={
        <DockRow>
          <DockText>
            <MainLine>{prompt.name === undefined ? t(prompt.key) : t(prompt.key, { name: prompt.name })}</MainLine>
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          </DockText>
          <Buttons>
            {can('redeal') && (
              <Button $variant="secondary" disabled={asked} onClick={() => send({ type: 'redeal' })}>
                {t('games.odd-word.ui.redeal')}
              </Button>
            )}
            {can('reveal') && (
              <Button disabled={asked} onClick={() => send({ type: 'reveal' })}>
                {t('games.odd-word.ui.reveal')}
              </Button>
            )}
            {can('end') && (
              <Button $variant="secondary" disabled={asked} onClick={() => send({ type: 'end' })}>
                {t('games.odd-word.ui.end')}
              </Button>
            )}
            {can('next') && (
              <Button disabled={asked} onClick={() => send({ type: 'next' })}>
                {t('games.odd-word.ui.next')}
              </Button>
            )}
          </Buttons>
        </DockRow>
      }
    >
      <Stage>
        <Header>
          <Round>{t('games.odd-word.ui.round', { round: view.round, rounds: view.totalRounds })}</Round>
          <Facts>
            <Fact>
              <span>{t('games.odd-word.ui.oddCount', { count: view.undercoverCount })}</span>
            </Fact>
            {view.blankOn && (
              <Fact>
                <span>{t('games.odd-word.ui.blankOn')}</span>
              </Fact>
            )}
          </Facts>
        </Header>
        {game.chatLocked && <Notice role="note">{t('games.odd-word.ui.chatLocked')}</Notice>}
        {!shown && <WordCard view={view} />}
        {shown && <RoundReveal view={view} nameOf={nameOf} />}
        <SpeakingOrder view={view} nameOf={nameOf} />
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

const Notice = styled.p`
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.warning};
  font-weight: 600;
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

const Buttons = styled.div`
  display: flex;
  gap: ${space.sm}px;
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
