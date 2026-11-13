import { createElement, Suspense, useEffect, useMemo, useState } from 'react'
import '../i18n/roomExtras.ts'
import styled from 'styled-components'
import type { ReplayResponse } from '../../shared/games/replay.ts'
import type { GameProjection } from '../../shared/games/types.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { isRoomId } from '../../shared/room-id.ts'
import { Button } from '../components/Button.tsx'
import { GameLayout, type RoomParts } from '../components/GameLayout.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { gameScreen } from '../games/screens.ts'
import { useT } from '../i18n/useT.ts'
import { ChatDraft } from '../lib/chatState.ts'
import { Link } from '../lib/router.tsx'
import { useParams } from '../lib/useRouter.ts'
import { monoType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

/** How long each step stays up while the replay plays itself */
const PLAY_STEP_MS = 1200

type Loaded =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ready'; replay: ReplayResponse }

async function fetchReplay(id: string, signal: AbortSignal): Promise<Loaded> {
  try {
    const response = await fetch(`/api/rooms/${id}/replay`, { signal })
    if (response.status === 404) return { status: 'missing' }
    if (!response.ok) return { status: 'failed' }
    const replay = (await response.json()) as ReplayResponse
    return Array.isArray(replay?.frames) ? { status: 'ready', replay } : { status: 'failed' }
  } catch {
    return { status: 'failed' }
  }
}

/**
 * A finished game played back step by step (e2-t09), through the game's own screen as a spectator
 * saw it. The room sends the first projection and a patch a step; nothing here can act on the game.
 */
export function ReplayPage() {
  const { id = '' } = useParams()
  const t = useT()
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })

  useEffect(() => {
    if (!isRoomId(id)) return undefined
    const controller = new AbortController()
    void fetchReplay(id, controller.signal).then((result) => {
      if (!controller.signal.aborted) setLoaded(result)
    })
    return () => controller.abort()
  }, [id])

  return (
    <>
      <TopBar />
      <Main>
        <Title>{t('room.extra.replay.title')}</Title>
        {!isRoomId(id) || loaded.status === 'missing' ? (
          <p>{t('room.extra.replay.missing')}</p>
        ) : loaded.status === 'loading' ? (
          <p role="status">{t('common.loading')}</p>
        ) : loaded.status === 'failed' ? (
          <p role="alert">{t('room.extra.replay.failed')}</p>
        ) : (
          <Player id={id} replay={loaded.replay} />
        )}
        <Back to={`/r/${id}`}>{t('room.extra.replay.back')}</Back>
      </Main>
    </>
  )
}

function Player({ id, replay }: { id: string; replay: ReplayResponse }) {
  const t = useT()
  // Every step's projection, built once: patches only go forward
  const projections = useMemo(() => {
    const all: GameProjection[] = [replay.start]
    let shown = replay.start as unknown as JsonValue
    for (const frame of replay.frames) {
      shown = applyPatch(shown, frame.ops)
      all.push(shown as unknown as GameProjection)
    }
    return all
  }, [replay])
  const last = projections.length - 1
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  // Playing stops by itself at the end: it is only "playing" while there is a next step
  const running = playing && step < last
  useEffect(() => {
    if (!running) return undefined
    const timer = setTimeout(() => setStep((now) => Math.min(now + 1, last)), PLAY_STEP_MS)
    return () => clearTimeout(timer)
  }, [running, step, last])

  const nameOf = (seat: number) =>
    replay.names[String(seat)] ?? t('room.waiting.seat', { seat: seat + 1 })
  const game = projections[step]
  const members: Record<string, RoomMember> = Object.fromEntries(
    Object.keys(replay.names).map((seat) => [
      `seat-${seat}`,
      {
        id: `seat-${seat}`,
        name: replay.names[seat],
        seat: Number(seat),
        ready: false,
        host: false,
        online: true,
        absent: false,
      },
    ]),
  )
  const view: RoomView = {
    room: {
      id,
      gameId: replay.gameId,
      // The result only on the last step, as the room showed it then
      status: step === last ? 'ended' : 'playing',
      options: replay.options,
      minPlayers: 0,
      maxSeats: Object.keys(replay.names).length,
    },
    members,
    game,
    coverable: [],
  }
  const nothing = () => {}
  const parts: RoomParts = {
    view,
    you: '',
    timers: [],
    onSit: nothing,
    onCover: nothing,
    onKick: nothing,
    onTransfer: nothing,
    onDissolve: nothing,
    onReopen: nothing,
    onRematch: nothing,
    act: nothing,
    chat: {
      messages: [],
      locked: true,
      onSend: async () => 'chat_locked',
      draftStore: new ChatDraft(),
    },
  }
  const Screen = gameScreen(replay.gameId, game.view)
  const actor = step === 0 ? null : replay.frames[step - 1].actor

  return (
    <>
      <Controls aria-label={t('room.extra.replay.controls')}>
        <Button $variant="secondary" $size="sm" disabled={step === 0} onClick={() => setStep(0)}>
          {t('room.extra.replay.first')}
        </Button>
        <Button
          $variant="secondary"
          $size="sm"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          {t('room.extra.replay.previous')}
        </Button>
        <Button
          $size="sm"
          disabled={step === last}
          onClick={() => {
            setPlaying(!running)
            // Play from the start again once it has reached the end
            if (!running && step === last) setStep(0)
          }}
        >
          {t(running ? 'room.extra.replay.pause' : 'room.extra.replay.play')}
        </Button>
        <Button
          $variant="secondary"
          $size="sm"
          disabled={step === last}
          onClick={() => setStep(step + 1)}
        >
          {t('room.extra.replay.next')}
        </Button>
        <Button
          $variant="secondary"
          $size="sm"
          disabled={step === last}
          onClick={() => setStep(last)}
        >
          {t('room.extra.replay.last')}
        </Button>
        <Slider
          type="range"
          min={0}
          max={last}
          value={step}
          aria-label={t('room.extra.replay.step')}
          aria-valuetext={t('room.extra.replay.stepOf', { step, total: last })}
          onChange={(event) => setStep(Number(event.target.value))}
        />
        <StepText role="status">
          {t('room.extra.replay.stepOf', { step, total: last })}
          {actor !== null &&
            ` · ${actor === 'system' ? t('room.extra.replay.byRoom') : t('room.extra.replay.by', { name: nameOf(actor) })}`}
        </StepText>
      </Controls>
      {Screen ? (
        <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
          {createElement(Screen, { room: parts, game })}
        </Suspense>
      ) : (
        <GameLayout room={parts} />
      )}
    </>
  )
}

const Main = styled.main`
  display: grid;
  gap: ${space.lg}px;
  width: min(1200px, 100%);
  margin: 0 auto;
  padding: ${space.lg}px;
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.xl}px;
`

const Controls = styled.section`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.md}px;
  background: ${color.sunken};
`

const Slider = styled.input`
  flex: 1 1 200px;
  min-height: 44px;
  accent-color: ${color.accent};
`

const StepText = styled.p`
  ${monoType}
  flex-basis: 100%;
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Back = styled(Link)`
  color: ${color.accent};
  font-weight: 700;
`
