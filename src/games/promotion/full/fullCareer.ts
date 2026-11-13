// The full edition's career routes in words (2026-11-13): each turn, what the dice made, where it led,
// what was answered and the silver. Loaded with the routes, once a game is over (FullRoutes.tsx); the
// screen hands in the cell names, which come with the board's data (fullText.ts)
import type {
  FullPlayer,
  FullRouteStep,
  FullRouteThrow,
} from '../../../../shared/games/promotion/types.ts'
import type { Translate } from '../../../i18n/t.ts'
import type { CareerRoute, RouteLine } from '../CareerRoutes.tsx'

const signed = (amount: number) => (amount > 0 ? `+${amount}` : `−${-amount}`)

/** "Pair of Virtue", "Straight", "Daji: Virtue" */
function throwText(t: Translate, cell: (id: string) => string, thrown: FullRouteThrow): string {
  const face = thrown.face ? t(`games.promotion.full.face.${thrown.face}`) : ''
  if (thrown.zone && face) return t('games.promotion.full.career.zone', { zone: cell(thrown.zone), face })
  if (face && (thrown.combo === 'pair' || thrown.combo === 'three' || thrown.combo === 'pairs')) {
    return t(`games.promotion.full.career.combo.${thrown.combo}Of`, { face })
  }
  return t(`games.promotion.full.career.combo.${thrown.combo}`)
}

/** One turn of a career in words: "Round 4", "Red two pairs", the cells, an answer and the silver */
function routeLine(t: Translate, cell: (id: string) => string, step: FullRouteStep): RouteLine {
  const what = step.birth
    ? t('games.promotion.full.career.birth')
    : step.throws.map((thrown) => throwText(t, cell, thrown)).join(' · ')
  const notes: string[] = []
  if (step.decision) {
    const { kind, price, timedOut } = step.decision
    const said = t(`games.promotion.full.career.${kind}`, { cell: cell(step.decision.cell), price })
    notes.push(timedOut ? t('games.promotion.full.decided.timedOut', { sentence: said }) : said)
  }
  if (step.path.length === 0 && !step.decision) notes.push(t('games.promotion.full.career.stayed'))
  if (step.silver !== 0) notes.push(t('games.promotion.full.career.silver', { amount: signed(step.silver) }))
  return {
    round: t('games.promotion.full.career.round', { round: step.round }),
    what: what || t('games.promotion.full.career.combo.none'),
    cells: step.path.map(cell),
    notes,
  }
}

/** Every seat's career, from the commoner it started as; none for a game from before routes were kept */
export function careerRoutes(
  t: Translate,
  cell: (id: string) => string,
  players: readonly FullPlayer[],
  nameOf: (seat: number) => string,
): CareerRoute[] {
  if (players.some((player) => player.route === undefined)) return []
  return players.map((player) => {
    const route = player.route ?? []
    return {
      seat: player.seat,
      name: nameOf(player.seat),
      summary: t('games.promotion.full.career.summary', {
        start: cell('baiding'),
        end: cell(player.cell),
        count: player.rolls,
      }),
      lines: route.map((step) => routeLine(t, cell, step)),
    }
  })
}
