import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { BluffAction, BluffView } from '../../../shared/games/bluff/types.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { useReducedMotion } from '../../lib/useMediaQuery.ts'
import { monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import './messages.ts'
import { ReadingOrder } from './ReadingOrder.tsx'
import { RoleCard } from './RoleCard.tsx'
import { REVEAL_STEP_MS, RoundReveal } from './RoundReveal.tsx'
import { Scoreboard } from './Scoreboard.tsx'
import { answerKey, promptOf, readerNow, roleOf } from './screenState.ts'
import { VotePanel, type Pick } from './VotePanel.tsx'

/** If the room never answers a press, the button comes back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 真假朗讀's screen (e6-t04, e6-t05). Phone first: most tables play face to face, each on their own
 * phone, so the term and the card are big and every button is in the dock under the thumb. The rules
 * stay on the server: this draws `view` and sends actions.
 */
export default function BluffScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as BluffView
  const legal = game.legal as unknown as BluffAction[]
  const reducedMotion = useReducedMotion()
  const role = roleOf(view)

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })
  const judgeName = nameOf(view.judge)

  // A button waits for the room's answer, so that a double tap is not refused
  const key = answerKey(view, legal)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: BluffAction) => {
    setAskedAt(key)
    room.act(action)
  }

  const can = (type: BluffAction['type']) => legal.some((action) => action.type === type)
  const canStart = can('startReading')
  const canDone = can('doneReading')
  const canVote = can('vote')
  const canSticker = can('sticker')
  const canNext = can('next')

  // What the judge or a reader has picked at the vote, for this round only
  const [picking, setPicking] = useState<{ round: number; pick: Pick }>({ round: view.round, pick: undefined })
  const picked = picking.round === view.round ? picking.pick : undefined
  const confirm = () => {
    if (asked || picked === undefined) return
    if (canVote && picked !== null) send({ type: 'vote', seat: picked })
    else if (canSticker) send({ type: 'sticker', seat: picked })
  }

  // A reveal seen arriving turns over part by part; one already up when the page opened just shows
  const [opened] = useState(`${view.round}:${view.phase}`)
  const shown = view.phase === 'reveal' || view.phase === 'over'
  const animate = shown && opened !== `${view.round}:${view.phase}` && !reducedMotion
  const held = useHold(game.over && animate ? `${view.round}` : null, 5 * REVEAL_STEP_MS + 600)

  const prompt = promptOf(view, nameOf)
  const reader = readerNow(view)
  const seatDetail = (member: RoomMember) => {
    const player = view.players.find((other) => other.seat === member.seat)
    return player ? t('room.result.score', { score: player.score }) : null
  }

  return (
    <GameLayout
      room={room}
      seatTint
      seatDetail={seatDetail}
      turnSeat={view.phase === 'reading' ? reader : view.phase === 'voting' ? null : view.judge}
      resultHeld={held}
      dock={
        <DockRow>
          <DockText>
            <MainLine>{prompt.name === undefined ? t(prompt.key) : t(prompt.key, { name: prompt.name })}</MainLine>
            {role === 'spectator' && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
            {view.phase === 'reveal' && !canNext && (
              <SmallLine>{t('games.bluff.ui.waitNext', { name: judgeName })}</SmallLine>
            )}
          </DockText>
          {canStart && (
            <Button disabled={asked} onClick={() => send({ type: 'startReading' })}>
              {t('games.bluff.ui.start')}
            </Button>
          )}
          {canDone && (
            <Button
              $variant={reader === view.you ? 'primary' : 'secondary'}
              disabled={asked}
              onClick={() => send({ type: 'doneReading' })}
            >
              {t(reader === view.you ? 'games.bluff.ui.done' : 'games.bluff.ui.endReading')}
            </Button>
          )}
          {(canVote || canSticker) && (
            <Button disabled={asked || picked === undefined || (canVote && picked === null)} onClick={confirm}>
              {canVote
                ? picked == null
                  ? t('games.bluff.ui.pickReader')
                  : t('games.bluff.ui.vote', { name: nameOf(picked) })
                : picked === undefined
                  ? t('games.bluff.ui.pickReader')
                  : picked === null
                    ? t('games.bluff.ui.keepSticker')
                    : t('games.bluff.ui.stickerFor', { name: nameOf(picked) })}
            </Button>
          )}
          {canNext && (
            <Button disabled={asked} onClick={() => send({ type: 'next' })}>
              {t('games.bluff.ui.next')}
            </Button>
          )}
        </DockRow>
      }
    >
      <Stage>
        <Header>
          <Round>{t('games.bluff.ui.round', { round: view.round, rounds: view.totalRounds })}</Round>
          <Steps phase={view.phase} />
          <Judge>{t('games.bluff.ui.judgeIs', { name: judgeName })}</Judge>
        </Header>
        {game.chatLocked && <Notice role="note">{t('games.bluff.ui.chatLocked')}</Notice>}

        {!shown && <RoleCard view={view} />}

        {(view.phase === 'prepare' || view.phase === 'reading') && <ReadingOrder view={view} nameOf={nameOf} />}

        {view.phase === 'voting' && (
          <VotePanel
            view={view}
            nameOf={nameOf}
            canVote={canVote}
            canSticker={canSticker}
            picked={picked}
            onPick={(pick) => setPicking({ round: view.round, pick })}
            disabled={asked}
          />
        )}

        {shown && <RoundReveal view={view} nameOf={nameOf} animate={animate} />}

        <Scoreboard view={view} nameOf={nameOf} />
      </Stage>
    </GameLayout>
  )
}

/** True for `ms` after `key` turns up: long enough for the last reveal to finish turning over */
function useHold(key: string | null, ms: number): boolean {
  const [doneKey, setDoneKey] = useState<string | null>(null)
  useEffect(() => {
    if (key === null) return undefined
    const timer = setTimeout(() => setDoneKey(key), ms)
    return () => clearTimeout(timer)
  }, [key, ms])
  return key !== null && doneKey !== key
}

const PHASES = ['prepare', 'reading', 'voting', 'reveal'] as const

/** Where this round is: cards, read, vote, reveal */
function Steps({ phase }: { phase: BluffView['phase'] }) {
  const t = useT()
  const now = phase === 'over' ? PHASES.length - 1 : PHASES.indexOf(phase)
  return (
    <StepList aria-label={t('games.bluff.ui.steps')}>
      {PHASES.map((step, index) => (
        <Step
          key={step}
          $state={index === now ? 'now' : index < now ? 'done' : 'later'}
          aria-current={index === now ? 'step' : undefined}
        >
          <span>
            {index + 1} {t(`games.bluff.ui.step.${step}`)}
          </span>
        </Step>
      ))}
    </StepList>
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

const Judge = styled.span`
  font-weight: 700;
  overflow-wrap: anywhere;
`

const StepList = styled.ol`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Step = styled.li<{ $state: 'now' | 'done' | 'later' }>`
  padding: ${space.xs}px ${space.md}px;
  color: ${(p) => (p.$state === 'now' ? color.onAccent : p.$state === 'done' ? color.text : color.muted)};
  background: ${(p) => (p.$state === 'now' ? color.accent : color.raised)};
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
  align-items: center;
  gap: ${space.md}px;
`

const DockText = styled.div`
  flex: 1;
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
