import { lazy, Suspense, useState } from 'react'
import styled from 'styled-components'
import type { KartView } from '../../../shared/games/kart/types.ts'
import type { Replay } from '../../../shared/kart/replay.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import './messages.ts'
import { Standings } from './Standings.tsx'
import { useRaceRecorder } from './useRaceRecorder.ts'

// The race itself, three.js and all: the kart's own chunk (docs/ARCHITECTURE.md §4), loaded only
// by someone with a kart in the race
const RaceView = lazy(() => import('../../kart/race/RaceView.tsx'))
// Watching it live and its replay (e9-t10): the same scene, loaded only when asked for
const SpectateView = lazy(() => import('../../kart/watch/SpectateView.tsx'))
const ReplayView = lazy(() => import('../../kart/watch/ReplayView.tsx'))

/**
 * The race room's screen (e9-t07, e9-t08, e9-t10). A racer gets the race full screen, from the grid
 * to the finish, and once there can watch the others. Someone without a kart in it (or whose kart
 * dropped out) watches live, following any kart, or closes that for the standings. Once the race is
 * over the room's result panel shows the times, with the host's rematch and the replay this browser
 * recorded.
 */
export default function KartScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as KartView
  const recording = useRaceRecorder(view, room.realtime)
  // Watching live: null until chosen, and then the default is whether there is no kart to drive
  const [watchChoice, setWatchChoice] = useState<boolean | null>(null)
  const [replay, setReplay] = useState<Replay | null>(null)
  const nameOf = (seat: number) =>
    Object.values(room.view.members).find((member) => member.seat === seat)?.name ??
    t('room.waiting.seat', { seat: seat + 1 })
  const me = view.racers.find((racer) => racer.seat === view.you)
  const watching = watchChoice ?? (!me || me.out)
  const loading = <Loading role="status">{t('games.kart.race.loading')}</Loading>

  if (!game.over && room.realtime && watching) {
    return (
      <Suspense fallback={loading}>
        <SpectateView
          view={view}
          realtime={room.realtime}
          nameOf={nameOf}
          onClose={() => setWatchChoice(false)}
        />
      </Suspense>
    )
  }
  if (!game.over && me && !me.out && recording.realtime) {
    return (
      <Suspense fallback={loading}>
        <RaceView
          view={view}
          realtime={recording.realtime}
          act={room.act}
          nameOf={nameOf}
          onWatch={() => setWatchChoice(true)}
        />
      </Suspense>
    )
  }
  const canReplay = game.over && recording.recorder.hasFrames()
  return (
    <>
      <GameLayout
        room={room}
        resultExtra={
          canReplay && (
            <Button
              $variant="secondary"
              onClick={() => setReplay(recording.recorder.replay())}
              data-testid="kart-replay-open"
            >
              {t('games.kart.replay.watch')}
            </Button>
          )
        }
      >
        {!game.over && (
          <Watching>
            <p role="status">{t('games.kart.watch.spectating')}</p>
            {room.realtime && (
              <div>
                <Button $size="sm" onClick={() => setWatchChoice(true)}>
                  {t('games.kart.watch.live')}
                </Button>
              </div>
            )}
            <Standings view={view} order={view.racers.map((racer) => racer.seat)} nameOf={nameOf} />
          </Watching>
        )}
      </GameLayout>
      {game.over && replay && (
        <Suspense fallback={loading}>
          <ReplayView
            replay={replay}
            nameOf={nameOf}
            you={view.you}
            onClose={() => setReplay(null)}
          />
        </Suspense>
      )}
    </>
  )
}

const Loading = styled.p`
  margin: 0;
  padding: ${space.lg}px;
`

const Watching = styled.section`
  display: grid;
  gap: ${space.md}px;

  p {
    margin: 0;
  }
`
