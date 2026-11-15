import { lazy, Suspense } from 'react'
import styled from 'styled-components'
import type { KartView } from '../../../shared/games/kart/types.ts'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import './messages.ts'
import { Standings } from './Standings.tsx'

// The race itself, three.js and all: the kart's own chunk (docs/ARCHITECTURE.md §4), loaded only
// by someone with a kart in the race
const RaceView = lazy(() => import('../../kart/race/RaceView.tsx'))

/**
 * The race room's screen (e9-t07, e9-t08). A racer gets the race full screen, from the grid to the
 * finish; once the race is over the room's result panel shows the times, with the host's rematch.
 * Someone without a kart in it sees the standings as the server counts them (watching live is L5).
 */
export default function KartScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as KartView
  const nameOf = (seat: number) =>
    Object.values(room.view.members).find((member) => member.seat === seat)?.name ??
    t('room.waiting.seat', { seat: seat + 1 })

  if (!game.over && view.you !== null && room.realtime) {
    return (
      <Suspense fallback={<Loading role="status">{t('games.kart.race.loading')}</Loading>}>
        <RaceView view={view} realtime={room.realtime} act={room.act} nameOf={nameOf} />
      </Suspense>
    )
  }
  return (
    <GameLayout room={room}>
      {!game.over && (
        <Watching>
          <p role="status">{t('games.kart.race.spectating')}</p>
          <Standings view={view} order={view.racers.map((racer) => racer.seat)} nameOf={nameOf} />
        </Watching>
      )}
    </GameLayout>
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
