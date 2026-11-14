// What makes a clue or a guess acceptable, and when two clues clash: one place for the rules (which
// decide) and the screen (which warns while someone types). No bank here, so the browser may import it.
import { foldText, overlaps, textLength, tidyText } from '../wordFold.ts'

export const MAX_CLUE_LENGTH = 12
export const MAX_GUESS_LENGTH = 20

export const CC_ERROR = {
  empty: 'games.clue-clash.error.empty',
  tooLong: 'games.clue-clash.error.tooLong',
  oneWord: 'games.clue-clash.error.oneWord',
  tooClose: 'games.clue-clash.error.tooClose',
  twice: 'games.clue-clash.error.twice',
} as const

export type CcProblem = { key: (typeof CC_ERROR)[keyof typeof CC_ERROR]; params?: Record<string, number> }

export const tidyClue = tidyText

/** Why this clue is refused, or null. `text` is tidied; `answers` the word and the answers that count */
export function clueProblem(text: string, answers: readonly string[]): CcProblem | null {
  if (foldText(text) === '') return { key: CC_ERROR.empty }
  if (textLength(text) > MAX_CLUE_LENGTH) return { key: CC_ERROR.tooLong, params: { max: MAX_CLUE_LENGTH } }
  if (/\s/u.test(text)) return { key: CC_ERROR.oneWord }
  if (answers.some((answer) => overlaps(text, answer))) return { key: CC_ERROR.tooClose }
  return null
}

/** Why this guess is refused, or null */
export function guessProblem(text: string): CcProblem | null {
  if (foldText(text) === '') return { key: CC_ERROR.empty }
  if (textLength(text) > MAX_GUESS_LENGTH) return { key: CC_ERROR.tooLong, params: { max: MAX_GUESS_LENGTH } }
  return null
}

/**
 * What two clues clash by: folded (width, case, spaces, punctuation), and an English plural's s or
 * es taken off, so "Cats" and "cat" clash. Same meaning in other words is for the review to catch.
 */
export function clashKey(text: string): string {
  const folded = foldText(text)
  if (!/^[a-z]+$/.test(folded) || folded.length < 4) return folded
  if (folded.endsWith('ies')) return `${folded.slice(0, -3)}y`
  if (/(ches|shes|sses|xes)$/.test(folded)) return folded.slice(0, -2)
  if (folded.endsWith('s') && !folded.endsWith('ss')) return folded.slice(0, -1)
  return folded
}

/** Whether a guess names the word, or one of the other answers that count */
export const isRight = (guess: string, answers: readonly string[]): boolean =>
  answers.some((answer) => foldText(answer) === foldText(guess))
