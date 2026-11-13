// The simple edition's career routes in words (2026-11-13): each roll, what it was, where it led
import { START_CELL } from '../../../shared/games/promotion/board.ts'
import type { PromotionPlayer } from '../../../shared/games/promotion/types.ts'
import type { Translate } from '../../i18n/t.ts'
import type { CareerRoute } from './CareerRoutes.tsx'
import { shortCellText } from './cellText.ts'

/** Every seat's rolls, from the commoner it started as; none for a game from before routes were kept */
export function careerRoutes(
  t: Translate,
  players: readonly PromotionPlayer[],
  nameOf: (seat: number) => string,
): CareerRoute[] {
  if (players.some((player) => player.route === undefined)) return []
  return players.map((player) => {
    let at = START_CELL
    return {
      seat: player.seat,
      name: nameOf(player.seat),
      summary: t('games.promotion.career.summary', {
        start: shortCellText(t, START_CELL),
        end: shortCellText(t, player.cell),
        count: player.rolls,
      }),
      lines: (player.route ?? []).map((step) => {
        const moved = step.to !== at
        at = step.to
        return {
          round: t('games.promotion.career.round', { round: step.round }),
          what: t(`games.promotion.face.${step.face}`),
          cells: moved ? [shortCellText(t, step.to)] : [],
          notes: moved ? [] : [t('games.promotion.career.stayed')],
        }
      }),
    }
  })
}
