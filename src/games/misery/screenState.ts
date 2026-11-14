// What the screen makes of a view: whom to tell what, and how to say a try or a gap. Kept apart from
// the looks so that it can be tested without a browser. It only reads `view`: the rules are the
// server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type { MiseryAttempt, MiseryCard, MiseryView } from '../../../shared/games/misery/types.ts'
import type { TextKey } from '../../i18n/t.ts'
import { color, type ColorName } from '../../styles/tokens.ts'

type Text = { key: TextKey; params?: Record<string, string | number> }

/** The dock's main line: what you should be doing now */
export function promptOf(view: MiseryView, nameOf: (seat: SeatId) => string): Text {
  const you = view.you
  switch (view.phase) {
    case 'guess': {
      const stealing = view.guesser !== view.turn
      if (you !== null && you === view.guesser) {
        return { key: stealing ? 'games.misery.ui.prompt.yourSteal' : 'games.misery.ui.prompt.yourTurn' }
      }
      return {
        key: stealing ? 'games.misery.ui.prompt.stealing' : 'games.misery.ui.prompt.guessing',
        params: { name: nameOf(view.guesser) },
      }
    }
    case 'reveal':
      return you !== null && you === view.nextTurn
        ? { key: 'games.misery.ui.prompt.yourDraw' }
        : { key: 'games.misery.ui.prompt.draw', params: { name: nameOf(view.nextTurn) } }
    default:
      return { key: 'games.misery.ui.prompt.over' }
  }
}

/** One try, as a line of the list: who, and between which indexes */
export function attemptText(attempt: MiseryAttempt, name: string): Text {
  if (attempt.gap === null) return { key: 'games.misery.ui.try.none', params: { name } }
  if (attempt.low !== null && attempt.high !== null) {
    return { key: 'games.misery.ui.try.between', params: { name, low: attempt.low, high: attempt.high } }
  }
  if (attempt.high !== null) return { key: 'games.misery.ui.try.below', params: { name, high: attempt.high } }
  return { key: 'games.misery.ui.try.above', params: { name, low: attempt.low ?? 0 } }
}

/** What a gap's button says to a screen reader: the indexes either side */
export function gapText(cards: readonly MiseryCard[], gap: number): Text {
  const low = gap > 0 ? cards[gap - 1].index : null
  const high = gap < cards.length ? cards[gap].index : null
  if (low !== null && high !== null) return { key: 'games.misery.ui.gapBetween', params: { low, high } }
  if (high !== null) return { key: 'games.misery.ui.gapBelow', params: { high } }
  if (low !== null) return { key: 'games.misery.ui.gapAbove', params: { low } }
  return { key: 'games.misery.ui.gap' }
}

/** A seat's line, least miserable first */
export const lineOf = (view: Pick<MiseryView, 'lines'>, seat: SeatId): MiseryCard[] =>
  view.lines.find((line) => line.seat === seat)?.cards ?? []

/** The misery meter's band for an index: 0 (a nuisance) to 4 (the worst), in bands of 20 */
export const miseryBand = (index: number): 0 | 1 | 2 | 3 | 4 =>
  Math.min(4, Math.max(0, Math.floor((index - 1) / 20))) as 0 | 1 | 2 | 3 | 4

// The meter borrows hues the site already has, green to red, so that it costs the first load nothing;
// onAccent reads on each of them in both themes (tests/styles/tokens.test.ts)
const BANDS: readonly ColorName[] = ['gameSilentTable', 'gameMisery', 'gamePromotion', 'gameOddWord', 'danger']

/** The misery meter's colour for an index, from the tokens; its ink is onAccent */
export const miseryFill = (index: number): string => color[BANDS[miseryBand(index)]]

/** What a button press waits on: the room's answer changes one of these */
export const answerKey = (view: MiseryView, legal: unknown): string =>
  JSON.stringify([view.phase, view.turnNo, view.attempts.length, view.guesser, legal])
