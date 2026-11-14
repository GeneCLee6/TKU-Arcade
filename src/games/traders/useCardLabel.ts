import type { TradersCard } from '../../../shared/games/traders/types.ts'
import { useT } from '../../i18n/useT.ts'
import './messages.ts'

/** A card's words for a screen reader: its name, the good it gives, its points and cost */
export function useCardLabel(): (card: TradersCard) => string {
  const t = useT()
  return (card) => {
    const parts = card.cost
      .map((count, good) =>
        count > 0 ? t('games.traders.ui.costPart', { count, good: t(`games.traders.good.${good}`) }) : null,
      )
      .filter((part): part is string => part !== null)
    return t('games.traders.ui.card', {
      name: t(`games.traders.card.${card.tier}.${card.bonus}`),
      good: t(`games.traders.good.${card.bonus}`),
      points: card.points,
      cost: parts.length > 0 ? parts.join(t('games.traders.ui.separator')) : t('games.traders.ui.free'),
    })
  }
}
