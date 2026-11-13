import { promotionRouteMessages } from '../../../../shared/games/promotion/i18n.routes.ts'
import type { FullPlayer } from '../../../../shared/games/promotion/types.ts'
import { registerMessages } from '../../../i18n/t.ts'
import { useT } from '../../../i18n/useT.ts'
import { CareerRoutes } from '../CareerRoutes.tsx'
import { careerRoutes } from './fullCareer.ts'

registerMessages(promotionRouteMessages)

/** The full edition's career routes under the result: loaded only once a game is over (FullScreen) */
export default function FullRoutes({
  players,
  nameOf,
  cellName,
}: {
  players: readonly FullPlayer[]
  nameOf(seat: number): string
  /** A cell's short name in the current language: the screen has the board's data */
  cellName(id: string): string
}) {
  const t = useT()
  return (
    <CareerRoutes
      title={t('games.promotion.full.career.title')}
      explain={t('games.promotion.full.career.explain')}
      routes={careerRoutes(t, cellName, players, nameOf)}
    />
  )
}
