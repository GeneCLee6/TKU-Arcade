// What the screen makes of a view: the prompt, the log's lines and the choices left for a play. Kept
// apart from the looks so that it can be tested without a browser. It only reads `view` and the
// legal moves: the rules are the server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type {
  ScrollAction,
  ScrollCard,
  ScrollEventView,
  ScrollView,
} from '../../../shared/games/secret-scroll/types.ts'
import type { MessageParams, TextKey } from '../../i18n/t.ts'

export type Line = { key: TextKey; params?: MessageParams; mine?: boolean }

type PlayAction = Extract<ScrollAction, { type: 'play' }>

const plays = (legal: readonly ScrollAction[]): PlayAction[] =>
  legal.filter((action): action is PlayAction => action.type === 'play')

/** The cards you may play now, each once */
export const playableCards = (legal: readonly ScrollAction[]): ScrollCard[] => [
  ...new Set(plays(legal).map((action) => action.card)),
]

/** Who `card` may pick: seats, or null alone when it picks nobody */
export const targetsOf = (legal: readonly ScrollAction[], card: ScrollCard): (SeatId | null)[] => [
  ...new Set(plays(legal).filter((action) => action.card === card).map((action) => action.target)),
]

/** The cards a Constable may name at `target` */
export const guessesOf = (legal: readonly ScrollAction[], card: ScrollCard, target: SeatId | null): ScrollCard[] =>
  plays(legal)
    .filter((action) => action.card === card && action.target === target && action.guess !== null)
    .map((action) => action.guess as ScrollCard)

/** The legal play matching a choice, if the choice is complete */
export function chosenPlay(
  legal: readonly ScrollAction[],
  card: ScrollCard | null,
  target: SeatId | null | undefined,
  guess: ScrollCard | null,
): PlayAction | null {
  if (card === null) return null
  const targets = targetsOf(legal, card)
  const aimed = targets.length === 1 && target === undefined ? targets[0] : target
  if (aimed === undefined) return null
  return (
    plays(legal).find((action) => action.card === card && action.target === aimed && action.guess === guess) ?? null
  )
}

/** The dock's main line */
export function promptOf(view: ScrollView, nameOf: (seat: SeatId) => string): Line {
  if (view.phase === 'over') return { key: 'games.secret-scroll.ui.prompt.over' }
  if (view.phase === 'roundEnd') return { key: 'games.secret-scroll.ui.prompt.roundEnd' }
  if (view.you !== null && view.current === view.you) return { key: 'games.secret-scroll.ui.prompt.yourTurn' }
  return { key: 'games.secret-scroll.ui.prompt.turn', params: { name: nameOf(view.current) } }
}

/**
 * The log's lines for one play: what everyone saw, then what only you learned. `cardName` turns a
 * value into its translated name; `list` joins several.
 */
export function eventLines(
  event: ScrollEventView,
  nameOf: (seat: SeatId) => string,
  cardName: (card: ScrollCard) => string,
  list: (items: string[]) => string,
): Line[] {
  const params: MessageParams = {
    name: nameOf(event.seat),
    card: event.card === null ? '' : cardName(event.card),
    target: event.target === null ? '' : nameOf(event.target),
    guess: event.guess === null ? '' : cardName(event.guess),
  }
  const lines: Line[] = []
  const say = (key: string, extra: MessageParams = {}) =>
    lines.push({ key: `games.secret-scroll.log.${key}` as TextKey, params: { ...params, ...extra } })

  switch (event.outcome) {
    case 'none':
      say(event.card === 7 || event.card === 0 ? 'plain' : 'none')
      break
    case 'scroll':
      say(event.card === 8 ? 'scrollSelf' : 'scroll')
      break
    case 'redraw':
      say('redraw', { lost: event.shown.map((shown) => cardName(shown.card)).join('') })
      break
    default:
      say(event.outcome)
  }
  // A hand knocked out goes face up: say what it was, where the line above did not
  const showsHand = event.outcome === 'won' || event.outcome === 'lost' || event.outcome === 'fold' ||
    (event.outcome === 'scroll' && event.card === 8)
  if (showsHand && event.out.length > 0 && event.shown.length > 0) {
    const out = event.out[0]
    lines.push({
      key: 'games.secret-scroll.log.outShown',
      params: { name: nameOf(out), cards: list(event.shown.filter((shown) => shown.seat === out).map((shown) => cardName(shown.card))) },
    })
  }
  for (const seen of event.seen) {
    lines.push(
      seen.of === 'deck'
        ? { key: 'games.secret-scroll.log.seenDeck', params: { card: cardName(seen.card) }, mine: true }
        : { key: 'games.secret-scroll.log.seen', params: { target: nameOf(seen.of), card: cardName(seen.card) }, mine: true },
    )
  }
  return lines
}
