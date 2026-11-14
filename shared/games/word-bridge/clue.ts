// What makes a clue acceptable, in one place for the rules (which decide) and the screen (which only
// warns while the clue-giver types). No words bank and no rules here, so the browser may import it.
import { foldText, HAS_DIGIT, overlaps, textLength, tidyText } from '../wordFold.ts'

/** Plenty for one word in either language */
export const MAX_CLUE_LENGTH = 12
/** The highest number a clue can carry; 0 means "any number" */
export const MAX_CLUE_COUNT = 9

export const CLUE_ERROR = {
  empty: 'games.word-bridge.error.empty',
  tooLong: 'games.word-bridge.error.tooLong',
  oneWord: 'games.word-bridge.error.oneWord',
  digits: 'games.word-bridge.error.digits',
  onGrid: 'games.word-bridge.error.onGrid',
  badCount: 'games.word-bridge.error.badCount',
} as const

export type ClueProblem = { key: (typeof CLUE_ERROR)[keyof typeof CLUE_ERROR]; params?: Record<string, string | number> }

export const tidyClue = tidyText

/**
 * Why this clue is refused, or null. `text` is `tidyClue`'s output; `open` the words still face down.
 * A clue may not hold a word on the grid, nor be part of one ("雞" with "火雞" face down)
 */
export function clueProblem(text: string, count: number, open: readonly string[]): ClueProblem | null {
  if (foldText(text) === '') return { key: CLUE_ERROR.empty }
  if (textLength(text) > MAX_CLUE_LENGTH) return { key: CLUE_ERROR.tooLong, params: { max: MAX_CLUE_LENGTH } }
  if (/\s/u.test(text)) return { key: CLUE_ERROR.oneWord }
  if (HAS_DIGIT.test(text)) return { key: CLUE_ERROR.digits }
  const clash = open.find((word) => overlaps(text, word))
  if (clash !== undefined) return { key: CLUE_ERROR.onGrid, params: { word: clash } }
  if (!Number.isInteger(count) || count < 0 || count > MAX_CLUE_COUNT) return { key: CLUE_ERROR.badCount }
  return null
}
