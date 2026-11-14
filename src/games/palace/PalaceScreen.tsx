import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { PalaceAct, PalaceAction, PalaceRole, PalaceView } from '../../../shared/games/palace/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { ActionLog } from './ActionLog.tsx'
import { ActionPicker } from './ActionPicker.tsx'
import { Court } from './Court.tsx'
import { Hand } from './Hand.tsx'
import './messages.ts'
import { RoleGuide } from './RoleGuide.tsx'
import { actKey, answerKey, CLAIMS, isBluff, promptOf, roleKey } from './screenState.ts'

/** If the room never answers a press, the buttons come back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 朝堂暗鬥's screen. Phone first: what is being claimed right now and the answer buttons (pass,
 * challenge, block) sit in the dock under the thumb, with the window's countdown above the game; your
 * own cards, the court and the log scroll under it. The rules stay on the server: this draws `view`
 * and sends actions.
 */
export default function PalaceScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as PalaceView
  const legal = game.legal as unknown as PalaceAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })
  const names = {
    name: nameOf,
    role: (role: PalaceRole) => t(roleKey(role)),
    act: (act: PalaceAct) => t(actKey(act)),
  }

  // A button waits for the room's answer, so that a double tap does not answer twice
  const key = answerKey(view, legal)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: PalaceAction) => {
    setAskedAt(key)
    room.act(action)
  }

  const prompt = promptOf(view, names)
  const choosing = legal.some((action) => action.type === 'act')
  const canPass = legal.some((action) => action.type === 'pass')
  const canChallenge = legal.some((action) => action.type === 'challenge')
  const blocks = legal.flatMap((action) => (action.type === 'block' ? [action.role] : []))

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={game.over ? null : view.turn}
      dock={
        <DockRow>
          <DockText>
            <MainLine data-testid="palace-prompt">{t(prompt.key, prompt.params)}</MainLine>
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          </DockText>
          {(canPass || canChallenge || blocks.length > 0) && (
            <Buttons>
              {canChallenge && (
                <Button $variant="danger" disabled={asked} onClick={() => send({ type: 'challenge' })}>
                  {t('games.palace.ui.challenge')}
                </Button>
              )}
              {blocks.map((role) => (
                <Button key={role} disabled={asked} onClick={() => send({ type: 'block', role })}>
                  {t('games.palace.ui.blockAs', { role: t(roleKey(role)) })}
                  {isBluff(view, role) ? ` · ${t('games.palace.ui.bluff')}` : ''}
                </Button>
              ))}
              {canPass && (
                <Button $variant="secondary" disabled={asked} onClick={() => send({ type: 'pass' })}>
                  {t('games.palace.ui.pass')}
                </Button>
              )}
            </Buttons>
          )}
        </DockRow>
      }
    >
      <Stage>
        {view.current !== null && !game.over && <Now view={view} nameOf={nameOf} />}
        {choosing && <ActionPicker key={view.step} view={view} legal={legal} disabled={asked} nameOf={nameOf} onAct={send} />}
        <Hand view={view} disabled={asked} onAct={send} />
        <Court view={view} nameOf={nameOf} />
        <ActionLog log={view.log} names={names} />
        <RoleGuide />
      </Stage>
    </GameLayout>
  )
}

/** What is on the table right now: the action, its claim, any block, and which window is open */
function Now({ view, nameOf }: { view: PalaceView; nameOf(seat: SeatId): string }) {
  const t = useT()
  const current = view.current
  if (current === null) return null
  const claimed = CLAIMS[current.act]
  const phase = view.phase
  return (
    <NowPanel aria-labelledby="palace-now-heading" data-testid="now">
      <NowLabel id="palace-now-heading">{t('games.palace.ui.now')}</NowLabel>
      <NowAct>{t(actKey(current.act))}</NowAct>
      <NowWho>
        {current.target === null
          ? nameOf(current.actor)
          : t('games.palace.ui.nowTarget', { name: nameOf(current.actor), target: nameOf(current.target) })}
      </NowWho>
      {claimed !== null && <NowFact>{t('games.palace.ui.claims', { role: t(roleKey(claimed)) })}</NowFact>}
      {current.block !== null && (
        <NowFact>
          {t('games.palace.ui.blockedBy', { name: nameOf(current.block.by), role: t(roleKey(current.block.role)) })}
        </NowFact>
      )}
      {phase.kind === 'respond' && <NowWindow>{t(`games.palace.ui.window.${phase.window}`)}</NowWindow>}
    </NowPanel>
  )
}

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
`

const NowPanel = styled.section`
  ${glass}
  display: grid;
  gap: 2px;
  padding: ${space.md}px ${space.lg}px;
  box-shadow: inset 4px 0 0 ${color.magenta};
`

const NowLabel = styled.h2`
  ${monoType}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const NowAct = styled.p`
  margin: 0;
  font-size: ${fontSize.xl}px;
  font-weight: 900;
  line-height: 1.2;
`

const NowWho = styled.p`
  margin: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const NowFact = styled.p`
  margin: 0;
  color: ${color.muted};
`

const NowWindow = styled.p`
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
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

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
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
