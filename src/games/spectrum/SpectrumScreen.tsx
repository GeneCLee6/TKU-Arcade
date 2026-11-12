import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { SpectrumAction, SpectrumView } from '../../../shared/games/spectrum/types.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { Heading, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { useReducedMotion } from '../../lib/useMediaQuery.ts'
import { monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { AnswerCards } from './AnswerCards.tsx'
import { AnswerForm } from './AnswerForm.tsx'
import { AnswerProgress } from './AnswerProgress.tsx'
import './messages.ts'
import { STAGGER_MS } from './NumberLine.tsx'
import { OrderList } from './OrderList.tsx'
import { RoundReveal } from './RoundReveal.tsx'
import { Scoreboard } from './Scoreboard.tsx'
import { SecretNumber } from './SecretNumber.tsx'
import {
  inTheGuess,
  ownAnswer,
  pick,
  promptKey,
  roleOf,
  type GuessPicks,
} from './screenState.ts'
import { TopicCard } from './TopicCard.tsx'

/** If the room never answers a guess or "next", the button comes back after this */
const ANSWER_WAIT_MS = 4000
const NO_PICKS: GuessPicks = { max: null, min: null }

/** Spectrum's screen (e5-t05). The rules stay on the server: this draws `view` and sends actions */
export default function SpectrumScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as SpectrumView
  const legal = game.legal as unknown as SpectrumAction[]
  const reducedMotion = useReducedMotion()
  const role = roleOf(view)
  const own = ownAnswer(view)

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ??
    t('room.waiting.seat', { seat: seat + 1 })
  const guesserName = nameOf(view.guesser)

  // The guesser's choice so far, for this round only
  const [picked, setPicked] = useState<{ round: number; picks: GuessPicks }>({
    round: view.round,
    picks: NO_PICKS,
  })
  const picks = picked.round === view.round ? picked.picks : NO_PICKS
  const playing = inTheGuess(view)
  const [ordered, setOrdered] = useState<{ round: number; seats: SeatId[] } | null>(null)
  const order =
    ordered?.round === view.round && ordered.seats.length === playing.length
      ? ordered.seats
      : playing.map((answerer) => answerer.seat)

  // A button waits for the room's answer, so that a double tap is not refused
  const legalKey = JSON.stringify(game.legal)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === legalKey
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: SpectrumAction) => {
    setAskedAt(legalKey)
    room.act(action)
  }

  const canGuess = legal.some(
    (action) => action.type === 'guessExtremes' || action.type === 'guessOrder',
  )
  const canNext = legal.some((action) => action.type === 'next')
  const picksReady = picks.max !== null && picks.min !== null && picks.max !== picks.min
  const confirm = () => {
    if (asked || !canGuess) return
    if (view.mode === 'order') send({ type: 'guessOrder', seats: order })
    else if (picksReady) send({ type: 'guessExtremes', max: picks.max as SeatId, min: picks.min as SeatId })
  }

  // A reveal seen arriving rises mark by mark; one already up when the page opened just shows
  const [opened] = useState(`${view.round}:${view.phase}`)
  const shown = view.phase === 'reveal' || view.phase === 'over'
  const animate = shown && opened !== `${view.round}:${view.phase}` && !reducedMotion
  const marks = view.answerers.length
  const held = useHold(game.over && animate ? `${view.round}:${view.topic.id}` : null, marks * STAGGER_MS + 900)

  const prompt = promptKey(view)
  const seatDetail = (member: RoomMember) => {
    const player = view.players.find((other) => other.seat === member.seat)
    return player ? t('room.result.score', { score: player.score }) : null
  }

  return (
    <GameLayout
      room={room}
      seatTint
      seatDetail={seatDetail}
      turnSeat={view.phase === 'answering' ? null : view.guesser}
      resultHeld={held}
      dock={
        <DockRow>
          <DockText>
            <MainLine>
              {prompt.withGuesser ? t(prompt.key, { name: guesserName }) : t(prompt.key)}
            </MainLine>
            {role === 'spectator' && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
            {view.phase === 'reveal' && !canNext && (
              <SmallLine>{t('games.spectrum.ui.waitNext', { name: guesserName })}</SmallLine>
            )}
          </DockText>
          {canGuess && (
            <Button
              disabled={asked || (view.mode !== 'order' && !picksReady)}
              onClick={confirm}
            >
              {t('games.spectrum.ui.confirm')}
            </Button>
          )}
          {canNext && (
            <Button disabled={asked} onClick={() => send({ type: 'next' })}>
              {t('games.spectrum.ui.next')}
            </Button>
          )}
        </DockRow>
      }
    >
      <Stage>
        <Header>
          <Round>{t('games.spectrum.ui.round', { round: view.round, rounds: view.totalRounds })}</Round>
          <Steps phase={view.phase} />
          <Guesser>{t('games.spectrum.ui.guesserIs', { name: guesserName })}</Guesser>
        </Header>
        {game.chatLocked && <Notice role="note">{t('games.spectrum.ui.chatLocked')}</Notice>}

        <TopicCard topic={view.topic} />

        {view.phase === 'answering' && (
          <>
            {role === 'answerer' && own && own.number !== null && own.status !== 'out' && (
              <Pair>
                <SecretNumber key={view.round} number={own.number} topic={view.topic} />
                <AnswerForm
                  key={view.round}
                  sent={own.text}
                  onSend={(text) => room.act({ type: 'submitAnswer', text })}
                />
              </Pair>
            )}
            {role === 'guesser' && (
              <Section aria-labelledby="spectrum-you-guess">
                <Heading id="spectrum-you-guess">{t('games.spectrum.ui.youGuess')}</Heading>
                <Body>
                  {t(
                    view.mode === 'order'
                      ? 'games.spectrum.ui.youGuessOrder'
                      : 'games.spectrum.ui.youGuessExtremes',
                  )}
                </Body>
              </Section>
            )}
            <AnswerProgress answerers={view.answerers} you={view.you} nameOf={nameOf} />
          </>
        )}

        {view.phase === 'guessing' && (
          <>
            {role === 'answerer' && own?.number != null && (
              <SecretNumber key={view.round} number={own.number} topic={view.topic} compact />
            )}
            {role === 'guesser' && view.mode === 'order' ? (
              <Section aria-labelledby="spectrum-order-heading">
                <Heading id="spectrum-order-heading">{t('games.spectrum.ui.answers')}</Heading>
                <Body>{t('games.spectrum.ui.orderHint')}</Body>
                <OrderList
                  low={view.topic.low}
                  high={view.topic.high}
                  items={playing.map((answerer) => ({
                    seat: answerer.seat,
                    name: nameOf(answerer.seat),
                    text: answerer.text ?? '',
                  }))}
                  order={order}
                  onChange={(seats) => setOrdered({ round: view.round, seats })}
                  disabled={asked}
                />
              </Section>
            ) : (
              <>
                {role === 'guesser' ? (
                  <Body role="status">
                    {t(picksReady ? 'games.spectrum.ui.picked' : 'games.spectrum.ui.pickBoth')}
                  </Body>
                ) : (
                  <Waiting>
                    {t(
                      view.mode === 'order'
                        ? 'games.spectrum.ui.waitOrder'
                        : 'games.spectrum.ui.waitExtremes',
                      { name: guesserName },
                    )}
                  </Waiting>
                )}
                <AnswerCards
                  answerers={view.answerers}
                  nameOf={nameOf}
                  you={view.you}
                  picks={role === 'guesser' ? picks : null}
                  onPick={(end, seat) =>
                    setPicked({ round: view.round, picks: pick(picks, end, seat) })
                  }
                  disabled={asked}
                />
              </>
            )}
          </>
        )}

        {shown && <RoundReveal view={view} nameOf={nameOf} animate={animate} />}

        <Scoreboard view={view} nameOf={nameOf} />
      </Stage>
    </GameLayout>
  )
}

/** True for `ms` after `key` turns up: long enough for the last reveal to finish rising */
function useHold(key: string | null, ms: number): boolean {
  const [doneKey, setDoneKey] = useState<string | null>(null)
  useEffect(() => {
    if (key === null) return undefined
    const timer = setTimeout(() => setDoneKey(key), ms)
    return () => clearTimeout(timer)
  }, [key, ms])
  return key !== null && doneKey !== key
}

const PHASES = ['answering', 'guessing', 'reveal'] as const
const STEP_KEYS = {
  answering: 'games.spectrum.ui.step.answer',
  guessing: 'games.spectrum.ui.step.guess',
  reveal: 'games.spectrum.ui.step.reveal',
} as const

/** Where this round is: answer, guess, reveal */
function Steps({ phase }: { phase: SpectrumView['phase'] }) {
  const t = useT()
  const now = phase === 'over' ? 2 : PHASES.indexOf(phase)
  return (
    <StepList aria-label={t('games.spectrum.ui.steps')}>
      {PHASES.map((step, index) => (
        <Step
          key={step}
          $state={index === now ? 'now' : index < now ? 'done' : 'later'}
          aria-current={index === now ? 'step' : undefined}
        >
          <span>
            {index + 1} {t(STEP_KEYS[step])}
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

const Guesser = styled.span`
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

// The step now is told by its fill and by aria-current; the ones done by a lighter colour
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

const Pair = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: ${space.md}px;
  align-items: stretch;
`

const Body = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Waiting = styled.p`
  margin: 0;
  padding: ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.accent};
  font-weight: 700;
  overflow-wrap: anywhere;
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
