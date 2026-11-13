import { promotionRouteMessages } from '../../../shared/games/promotion/i18n.routes.ts'
import type { PromotionPlayer } from '../../../shared/games/promotion/types.ts'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { CareerRoutes } from './CareerRoutes.tsx'
import { careerRoutes } from './routeWords.ts'

registerMessages(promotionRouteMessages)

/** The simple edition's career routes under the result: loaded only once a game is over */
export default function SimpleRoutes({
  players,
  nameOf,
}: {
  players: readonly PromotionPlayer[]
  nameOf(seat: number): string
}) {
  const t = useT()
  return (
    <CareerRoutes
      title={t('games.promotion.career.title')}
      explain={t('games.promotion.career.explain')}
      routes={careerRoutes(t, players, nameOf)}
    />
  )
}
